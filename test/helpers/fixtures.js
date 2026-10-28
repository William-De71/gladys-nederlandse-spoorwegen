// A fake gateway of the NS API for the tests, served through the `fetch`
// option of the integration. Its answers are real ones, reduced, read on
// 2026-10-06 around 09:30 (Amsterdam) by the perron project
// (https://github.com/ultimatelemon/perron, MIT): the departures of Utrecht
// Centraal, the disruptions of the network, a few stations. Tests never touch
// the network.

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 2026-10-06 09:20:30 in Amsterdam: before the departures of the fixture.
const NOW = Date.parse('2026-10-06T07:20:30Z');
const TZ = 'Europe/Amsterdam';
const KEY = '0123456789abcdef0123456789abcdef';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const STATIONS = fixture('stations.json');
const DEPARTURES = fixture('departures.json');
const DISRUPTIONS = fixture('disruptions.json');

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary path for the file kept in /data.
 * @returns {string} The path (its directory exists, the file does not).
 */
const storePath = () => join(mkdtempSync(join(tmpdir(), 'ns-')), 'nederlandse-spoorwegen.json');

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * @description An Amsterdam time of the day of the fixtures, as NS writes it.
 * @param {string} time - "09:42".
 * @returns {string} "2026-10-06T09:42:00+0200".
 */
const nsDate = (time) => `2026-10-06T${time.length === 5 ? `${time}:00` : time}+0200`;

/**
 * @description A departure, as the API writes it.
 * @param {object} [options] - What differs from an Intercity 3540 to Zwolle
 * via Amersfoort, leaving at 09:40 from platform 18, on time.
 * @returns {object} The departure.
 */
function departure({
  at = '09:40',
  actual = at,
  track = '18',
  actualTrack = track,
  cancelled = false,
  direction = 'Zwolle',
  category = 'IC',
  number = '3540',
  via = ['Amersfoort C.', 'Harderwijk'],
  messages = [],
} = {}) {
  return {
    direction,
    name: `NS ${number}`,
    plannedDateTime: nsDate(at),
    plannedTimeZoneOffset: 120,
    actualDateTime: actual ? nsDate(actual) : undefined,
    actualTimeZoneOffset: 120,
    plannedTrack: track,
    actualTrack,
    product: {
      number,
      categoryCode: category,
      shortCategoryName: category === 'SPR' ? 'NS Sprinter' : 'NS Intercity',
      longCategoryName: category === 'SPR' ? 'Sprinter' : 'Intercity',
      operatorName: 'NS',
      operatorCode: 'NS',
      type: 'TRAIN',
    },
    trainCategory: category,
    cancelled,
    routeStations: via.map((mediumName, index) => ({ uicCode: `84000${index}`, mediumName })),
    messages: messages.map((message) => ({ message, style: cancelled ? 'WARNING' : 'INFO' })),
    departureStatus: 'INCOMING',
  };
}

/**
 * @description A disruption, as the API writes it.
 * @param {object} [fields] - What differs from a signal failure between
 * Utrecht and Amersfoort, impact 3, from 09:00 to 11:00.
 * @returns {object} The disruption.
 */
function disruption(fields = {}) {
  return {
    id: '7100001',
    isActive: true,
    title: 'Utrecht - Amersfoort.',
    type: 'DISRUPTION',
    start: nsDate('09:00'),
    end: nsDate('11:00'),
    impact: { value: 3 },
    expectedDuration: { description: 'Expect disruptions until around 11:00.' },
    publicationSections: [
      {
        section: {
          stations: [
            { uicCode: '8400621', stationCode: 'UT', name: 'Utrecht Centraal' },
            { uicCode: '8400055', stationCode: 'AMF', name: 'Amersfoort Centraal' },
          ],
          direction: 'BOTH',
        },
        consequence: { description: 'fewer trains', level: 'LESS_TRAINS' },
      },
    ],
    timespans: [
      {
        start: nsDate('09:00'),
        end: nsDate('11:00'),
        situation: { label: 'Between Utrecht Centraal and Amersfoort Centraal fewer trains run.' },
        cause: { label: 'signal failure' },
        advices: ['Allow for extra travel time.'],
      },
    ],
    ...fields,
  };
}

/**
 * @description The fake gateway.
 * @returns {Function} A fetch function, with `.calls` and `.state`.
 */
function fakeNs() {
  const state = {
    key: KEY,
    stations: clone(STATIONS),
    departures: { UT: clone(DEPARTURES.payload.departures) },
    disruptions: clone(DISRUPTIONS),
    // 'network', or an HTTP status, for every request; a station code fails alone.
    fail: null,
    failStation: null,
  };
  const calls = [];

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });

  /**
   * @description The fetch function.
   * @param {string} url - The URL.
   * @param {object} [init] - The request options.
   * @returns {Promise<Response>} The answer.
   */
  async function fetchFn(url, init = {}) {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname);
    calls.push({ path, params: Object.fromEntries(parsed.searchParams), headers: init.headers });
    if (state.fail === 'network') {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }
    if (typeof state.fail === 'number') {
      return new Response('Service Unavailable', { status: state.fail });
    }
    if (init.headers?.['Ocp-Apim-Subscription-Key'] !== state.key) {
      return json(
        {
          statusCode: 401,
          message:
            'Access denied due to invalid subscription key. Make sure to provide a valid key for an active subscription.',
        },
        401,
      );
    }
    if (path === '/nsapp-stations/v3') {
      return json({ payload: state.stations.payload });
    }
    if (path === '/reisinformatie-api/api/v2/departures') {
      const code = parsed.searchParams.get('station');
      if (state.failStation === code) {
        return new Response('Bad Gateway', { status: 502 });
      }
      return json({ payload: { source: 'PPV', departures: state.departures[code] ?? [] } });
    }
    const station = /^\/disruptions\/v3\/station\/([^/]+)$/.exec(path);
    if (station) {
      return json(
        state.disruptions.filter((entry) =>
          (entry.publicationSections ?? []).some((section) =>
            section.section.stations.some((stop) => stop.stationCode === station[1]),
          ),
        ),
      );
    }
    if (path === '/disruptions/v3') {
      return json(state.disruptions.filter((entry) => entry.isActive !== false));
    }
    return json({ statusCode: 404, message: 'Resource not found' }, 404);
  }
  fetchFn.calls = calls;
  fetchFn.state = state;
  return fetchFn;
}

/**
 * @description A minimal Gladys client for the pure builders.
 */
const fakeGladys = {
  externalIds: (type, id) => ({
    device: `ext:nederlandse-spoorwegen:${type}:${id}`,
    feature: (key) => `ext:nederlandse-spoorwegen:${type}:${id}:${key}`,
  }),
};

export {
  NOW,
  TZ,
  KEY,
  STATIONS,
  DEPARTURES,
  DISRUPTIONS,
  silent,
  storePath,
  nsDate,
  departure,
  disruption,
  fakeNs,
  fakeGladys,
};
