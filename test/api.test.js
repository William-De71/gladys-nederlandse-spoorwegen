// The client of the NS API, the stations, the departures, the disruptions,
// the configuration and the times: the pure modules, against the real
// (reduced) answers of the fixtures.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createNsClient, errorDetail, REQUEST_BUDGET } from '../src/ns-api.js';
import { stationOf, findStation, searchStations, fold, slug } from '../src/stations.js';
import {
  parseNsDate,
  parsePassages,
  terms,
  upcomingPassages,
  cancelledPassages,
} from '../src/departures.js';
import { parseDisruptions, stationTraffic, headline, stateOf } from '../src/disruptions.js';
import {
  normalizeConfig,
  readLanguage,
  readInterval,
  parseAddedStations,
  DEFAULT_INTERVAL,
  MAX_ADDED_STATIONS,
} from '../src/config.js';
import { formatTime, localClock, dateText, formatDay } from '../src/time.js';
import {
  fakeNs,
  departure,
  disruption,
  NOW,
  TZ,
  KEY,
  STATIONS,
  DEPARTURES,
  DISRUPTIONS,
} from './helpers/fixtures.js';

const KNOWN = STATIONS.payload.map(stationOf);
const UTRECHT = parsePassages(DEPARTURES.payload.departures);

test('the client sends the key, asks in English and reads the payloads', async () => {
  const fetch = fakeNs();
  const api = createNsClient({ apiKey: () => KEY, fetch, now: () => NOW });
  const stations = await api.stations();
  assert.equal(stations.length, STATIONS.payload.length);
  const departures = await api.departures('UT');
  assert.equal(departures.length, 8);
  const [call] = fetch.calls.slice(-1);
  assert.equal(call.path, '/reisinformatie-api/api/v2/departures');
  assert.deepEqual(call.params, { station: 'UT', maxJourneys: '40', lang: 'en' });
  assert.equal(call.headers['Ocp-Apim-Subscription-Key'], KEY);
  assert.equal(call.headers['accept-language'], 'en');
  assert.match(call.headers['user-agent'], /^gladys-nederlandse-spoorwegen\/\d/);
  assert.equal((await api.stationDisruptions('RTD')).length, 2);
  assert.equal((await api.disruptions()).length, 5);
  assert.deepEqual(fetch.calls.at(-1).params, { isActive: 'true' });
  assert.equal(api.requests.total, 4);
  assert.equal(api.requests.byEndpoint.departures, 1);
});

test('the client tells a missing or refused key, the quota and the network apart', async () => {
  const fetch = fakeNs();
  let key = '';
  let clock = NOW;
  const api = createNsClient({ apiKey: () => key, fetch, now: () => clock });
  await assert.rejects(api.stations(), { kind: 'auth', message: 'no API key' });
  assert.equal(fetch.calls.length, 0, 'nothing is sent without a key');
  key = 'wrong';
  await assert.rejects(api.stations(), (err) => {
    assert.equal(err.kind, 'auth');
    assert.equal(err.status, 401);
    assert.match(err.message, /^HTTP 401: Access denied due to invalid subscription key/);
    return true;
  });
  key = KEY;
  fetch.state.fail = 'network';
  await assert.rejects(api.departures('UT'), { kind: 'unreachable', message: 'ECONNREFUSED' });
  fetch.state.fail = 503;
  await assert.rejects(api.departures('UT'), { kind: 'busy', status: 503 });
  fetch.state.fail = 404;
  await assert.rejects(api.departures('UT'), { kind: 'invalid' });
  // A 429 pauses the client: no request until the time NS asked for.
  fetch.state.fail = null;
  const limited = fakeNs();
  const busy = createNsClient({
    apiKey: () => KEY,
    now: () => clock,
    fetch: async () =>
      new Response('{"statusCode":429,"message":"Rate limit is exceeded."}', {
        status: 429,
        headers: { 'retry-after': '30' },
      }),
  });
  await assert.rejects(busy.departures('UT'), { kind: 'busy', status: 429 });
  await assert.rejects(busy.departures('UT'), /NS asked to wait/);
  clock += 31000;
  await assert.rejects(busy.departures('UT'), /Rate limit is exceeded/);
  assert.equal(limited.calls.length, 0);
  assert.equal(errorDetail('{"errors":[{"message":"Station not found"}]}'), 'Station not found');
  assert.equal(errorDetail('Bad Gateway\nmore'), 'Bad Gateway');
});

test('the client keeps under the 300 requests per 5 minutes NS allows', async () => {
  let clock = NOW;
  const api = createNsClient({
    apiKey: () => KEY,
    now: () => clock,
    fetch: async () => new Response('{"payload":[]}'),
  });
  for (let i = 0; i < REQUEST_BUDGET; i += 1) {
    await api.stations();
  }
  await assert.rejects(api.stations(), { kind: 'busy' });
  assert.equal(api.requests.refused, 1);
  clock += 5 * 60 * 1000 + 1;
  await api.stations();
  assert.equal(api.requests.total, REQUEST_BUDGET + 1);
});

test('stations by code, UIC code, name, short name, synonym or unique words', () => {
  const code = (typed) => findStation(KNOWN, typed)?.code ?? null;
  assert.equal(code('ut'), 'UT');
  assert.equal(code('8400621'), 'UT');
  assert.equal(code('Utrecht Centraal'), 'UT');
  assert.equal(code('Utrecht'), 'UT');
  assert.equal(code('den bosch'), 'HT');
  assert.equal(code("'s-Hertogenbosch"), 'HT');
  assert.equal(code('hollands spoor'), 'GV');
  assert.equal(code('Köln'), 'KOLN');
  // Two stations hold "Den Haag": ambiguous.
  assert.equal(code('den haag'), 'GVC', 'a synonym of Den Haag Centraal');
  assert.equal(code('haag'), null);
  assert.equal(code('Nowhere'), null);
  assert.equal(code(''), null);
  assert.deepEqual(
    searchStations(KNOWN, 'amsterdam').map((station) => station.code),
    // Schiphol through its synonym "Amsterdam Airport".
    ['ASD', 'ASDZ', 'SHL'],
  );
  // The Netherlands first, then abroad.
  assert.deepEqual(
    searchStations(KNOWN, 'brussel').map((station) => station.code),
    ['BRUSC', 'BRUSN', 'BRUSZ', 'FBNL'],
  );
  assert.deepEqual(
    searchStations(KNOWN, 'rtd').map((station) => station.code),
    ['RTD'],
  );
  assert.deepEqual(searchStations(KNOWN, ' '), []);
  assert.equal(fold("'s-Hertogenbosch Oost"), 's hertogenbosch oost');
  assert.equal(slug('Den Haag | Leiden', 12), 'den-haag-lei');
});

test('departures: the delay from the two times, the platform change, the filters', () => {
  assert.equal(parseNsDate('2026-10-06T09:24:00+0200'), Date.parse('2026-10-06T07:24:00Z'));
  assert.equal(parseNsDate('2026-10-06T09:24:00+02:00'), Date.parse('2026-10-06T07:24:00Z'));
  assert.equal(parseNsDate('soon'), null);
  assert.equal(parseNsDate(undefined), null);
  assert.equal(UTRECHT.length, 8);
  const venlo = UTRECHT.find((passage) => passage.destination === 'Venlo');
  assert.deepEqual(
    {
      line: venlo.line,
      number: venlo.number,
      delay: venlo.delay,
      platform: venlo.platform,
      planned: venlo.plannedPlatform,
      changed: venlo.platformChanged,
      via: venlo.via,
      messages: venlo.messages,
    },
    {
      line: 'IC',
      number: '3529',
      delay: 8,
      platform: '15',
      planned: '18',
      changed: true,
      via: ["'s-Hertogenbosch", 'Eindhoven C.', 'Helmond', 'Deurne'],
      messages: ['Rear trainset till Eindhoven C.'],
    },
  );
  // Soonest first, on the real-time estimate.
  assert.deepEqual(
    UTRECHT.slice(0, 3).map((passage) => passage.destination),
    ['Almere Centrum', 'Driebergen-Zeist', 'Den Haag Centraal'],
  );
  const raw = DEPARTURES.payload.departures;
  const destinations = (filter) => parsePassages(raw, filter).map((p) => p.destination);
  assert.deepEqual(destinations({ type: 'spr' }), [
    'Almere Centrum',
    'Driebergen-Zeist',
    'Utrecht Maliebaan',
  ]);
  assert.deepEqual(destinations({ type: 'ICE | sprinter' }).length, 4);
  // The direction: the destination or a station called at.
  assert.deepEqual(destinations({ direction: 'Eindhoven' }), ['Venlo']);
  // The Intercity to Rotterdam calls at Den Haag HS.
  assert.deepEqual(destinations({ direction: 'den haag | alkmaar' }), [
    'Den Haag Centraal',
    'Alkmaar',
    'Rotterdam Centraal',
  ]);
  assert.deepEqual(destinations({ type: 'IC', direction: 'Amsterdam' }), [
    'Alkmaar',
    'Rotterdam Centraal',
  ]);
  assert.deepEqual(destinations({ type: 'IC', direction: 'Groningen' }), []);
  assert.deepEqual(terms(' IC |, SPR '), ['ic', 'spr']);
  // A cancelled train without real time.
  const [cancelled] = parsePassages([departure({ cancelled: true, actual: '' })]);
  assert.equal(cancelled.realtime, false);
  assert.equal(cancelled.delay, 0);
  assert.deepEqual(upcomingPassages([cancelled], NOW), []);
  assert.deepEqual(cancelledPassages([cancelled], NOW), [cancelled]);
});

test('disruptions: kinds, states, the traffic of a station', () => {
  const all = parseDisruptions(DISRUPTIONS);
  assert.deepEqual(
    all.map((entry) => [entry.id, entry.kind, entry.state]),
    [
      ['disruption:6068091', 'disruption', 'disrupted'],
      ['maintenance:7006841', 'maintenance', 'disrupted'],
      ['maintenance:7008203', 'maintenance', 'info'],
      ['maintenance:7008314', 'maintenance', 'info'],
      ['maintenance:7008291', 'maintenance', 'info'],
    ],
  );
  const [signal, buses] = all;
  assert.equal(headline(buses), 'Alkmaar - Hoorn: buses are running');
  assert.equal(signal.cause, 'signal failure');
  assert.equal(signal.extraTime, 'Delay is decreasing.');
  assert.match(signal.text, /restrictions are lifted\. The trains will run again around 9:30\.$/);
  assert.equal(buses.end, Date.parse('2026-10-12T00:00:00Z'));
  assert.ok(signal.stations.includes('HRL'));
  // At 09:20 every one is under way; the most serious first.
  const traffic = stationTraffic(all, NOW);
  assert.equal(traffic.state, 'disrupted');
  assert.equal(traffic.current.length, 5);
  assert.deepEqual(stationTraffic([], NOW), { state: 'normal', current: [], upcoming: [] });
  assert.equal(stationTraffic(null, NOW).state, 'unknown');
  // Later the incident is over; works announced for tomorrow are coming.
  const later = Date.parse('2026-10-06T08:00:00Z');
  const tomorrow = parseDisruptions([
    disruption({
      id: '9',
      type: 'MAINTENANCE',
      isActive: false,
      start: '2026-10-07T01:00:00+0200',
      end: '2026-10-07T05:00:00+0200',
    }),
  ]);
  assert.deepEqual(
    stationTraffic([...all, ...tomorrow], later).upcoming.map((entry) => entry.id),
    ['maintenance:9'],
  );
  assert.ok(!stationTraffic(all, later).current.some((entry) => entry.kind === 'disruption'));
  const calamity = parseDisruptions([
    {
      id: 'c1',
      type: 'CALAMITY',
      title: 'Storm',
      description: '<p>No trains in the north.</p>',
      url: 'https://www.ns.nl/storm',
    },
  ])[0];
  assert.deepEqual(
    [calamity.state, calamity.text, calamity.url, calamity.start],
    ['major', 'No trains in the north.', 'https://www.ns.nl/storm', null],
  );
  assert.equal(stateOf('disruption', 4), 'major');
  assert.equal(stateOf('maintenance', 1), 'info');
  assert.deepEqual(parseDisruptions([{ id: 1, type: 'OTHER' }, null]), []);
});

test('configuration: key, three stations, added stations, interval, language', () => {
  const config = normalizeConfig({
    api_key: ` ${KEY} `,
    station_1: ' UT ',
    station_1_type: 'IC',
    station_1_direction: 'Amersfoort',
    station_2: '',
    station_3: 'Schiphol Airport',
    added_stations: [{ station: 'GVC', type: '', direction: 'Leiden' }, { station: '' }],
    interval: '30',
    language: 'de',
  });
  assert.deepEqual(config, {
    apiKey: KEY,
    stations: [
      { slot: 1, added: null, station: 'UT', type: 'IC', direction: 'Amersfoort' },
      { slot: 3, added: null, station: 'Schiphol Airport', type: '', direction: '' },
      { slot: null, added: 1, station: 'GVC', type: '', direction: 'Leiden' },
    ],
    addedStations: [{ station: 'GVC', type: '', direction: 'Leiden' }],
    interval: 30,
    language: 'de',
  });
  assert.deepEqual(normalizeConfig(), {
    apiKey: '',
    stations: [],
    addedStations: [],
    interval: DEFAULT_INTERVAL,
    language: 'auto',
  });
  assert.equal(readInterval('45'), DEFAULT_INTERVAL);
  assert.deepEqual(parseAddedStations('[{"station":"UT"}]'), [
    { station: 'UT', type: '', direction: '' },
  ]);
  assert.deepEqual(parseAddedStations('not json'), []);
  assert.equal(
    parseAddedStations(Array.from({ length: 20 }, () => ({ station: 'UT' }))).length,
    MAX_ADDED_STATIONS,
  );
  assert.equal(readLanguage({ last_language: 'fr' }, 'en'), 'fr');
  assert.equal(readLanguage({ last_language: 'french' }, 'en'), 'en');
});

test('times in the timezone of the instance', () => {
  assert.equal(formatTime(NOW, TZ), '09:20');
  assert.equal(formatTime(NOW, 'UTC'), '07:20');
  assert.equal(formatTime(null, TZ), '');
  assert.deepEqual(localClock(NOW, TZ), { date: '2026-10-06', minutes: 560 });
  assert.equal(formatDay(NOW, TZ), '06/10');
  assert.equal(dateText(NOW + 3600000, NOW, TZ), '10:20');
  assert.equal(dateText(NOW + 24 * 3600000, NOW, TZ), '07/10 09:20');
  assert.equal(dateText(null, NOW, TZ), '');
});
