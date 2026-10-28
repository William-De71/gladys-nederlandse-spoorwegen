// -----------------------------------------------------------------------------
// HTTP client of the official API of NS (Nederlandse Spoorwegen), the Dutch
// railways: https://apiportal.ns.nl. A free personal key of the "Ns-App"
// product, sent in the `Ocp-Apim-Subscription-Key` header; without it, or with
// a wrong one, the gateway answers 401 `{ "message": "Access denied…" }`.
//
// Routes used (gateway https://gateway.apiportal.ns.nl):
//   /nsapp-stations/v3                         every station NS knows (the
//                                              Netherlands and the stations
//                                              abroad its trains serve), read
//                                              weekly;
//   /reisinformatie-api/api/v2/departures      the next departures of one
//                                              station (`station` = its code,
//                                              "UT"), real time: one request
//                                              per station. Marked deprecated
//                                              by NS in favour of an API the
//                                              Ns-App product does not hold:
//                                              only this file knows it;
//   /disruptions/v3/station/:code              the disruptions, engineering
//                                              works and calamities about one
//                                              station;
//   /disruptions/v3                            every disruption of the network
//                                              (the traffic widget, nothing
//                                              followed).
// Texts are asked in English (`lang=en`): NS writes Dutch or English only.
// NS allows 300 requests per 5 minutes per key: the client keeps its own
// count and refuses beyond REQUEST_BUDGET, before the gateway does (429).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const BASE_URL = process.env.NS_API_URL || 'https://gateway.apiportal.ns.nl';
const TIMEOUT_MS = 20000;
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const USER_AGENT = `gladys-nederlandse-spoorwegen/${version} (+https://github.com/William-De71/gladys-nederlandse-spoorwegen)`;
const API_LANGUAGE = 'en';
// Below the 300 requests per 5 minutes NS allows, with room for the buttons.
const REQUEST_WINDOW_MS = 5 * 60 * 1000;
const REQUEST_BUDGET = 250;
// After a 429 without Retry-After, the API is left alone this long.
const BUSY_PAUSE_MS = 60 * 1000;

const ENDPOINTS = {
  STATIONS: 'stations',
  DEPARTURES: 'departures',
  STATION_DISRUPTIONS: 'station_disruptions',
  DISRUPTIONS: 'disruptions',
};

class NsError extends Error {
  /**
   * @param {string} kind - `auth` (no key or a refused one), `busy` (the
   * quota), `unreachable` or `invalid`.
   * @param {string} message - The detail.
   * @param {object} [extra] - `{ status }`.
   */
  constructor(kind, message, { status = null } = {}) {
    super(message);
    this.name = 'NsError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @description The message of an error answer of the gateway or of an API.
 * @param {string} text - The body.
 * @returns {string} The message, at most 160 characters.
 */
function errorDetail(text) {
  let detail = text.trim();
  try {
    const body = JSON.parse(text);
    const nested = Array.isArray(body?.errors) ? body.errors[0]?.message : null;
    detail = String(nested ?? body?.message ?? body?.errorMessage ?? body?.error ?? detail);
  } catch {
    // Plain text.
  }
  return detail.split('\n')[0].slice(0, 160);
}

/**
 * @description A client of the API of NS.
 * @param {object} options - Options.
 * @param {Function} options.apiKey - `() => string`: the key, read at each call.
 * @param {Function} [options.fetch] - The fetch function (tests).
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {string} [options.baseUrl] - The gateway root (tests, end-to-end runs).
 * @returns {object} The methods, and `requests` for the diagnostic.
 */
function createNsClient({
  apiKey,
  fetch: fetchFn = globalThis.fetch,
  now = () => Date.now(),
  baseUrl = BASE_URL,
}) {
  // Requests made, per endpoint, for the diagnostic; the instants of the
  // window, for the budget.
  const requests = { total: 0, byEndpoint: {}, failed: 0, last: null, refused: 0 };
  let window = [];
  let busyUntil = 0;

  /**
   * @description Count a request in the window, or refuse it.
   * @param {string} endpoint - ENDPOINTS.
   */
  function take(endpoint) {
    const current = now();
    if (current < busyUntil) {
      requests.refused += 1;
      throw new NsError('busy', `${endpoint}: NS asked to wait`, { status: 429 });
    }
    window = window.filter((at) => at > current - REQUEST_WINDOW_MS);
    if (window.length >= REQUEST_BUDGET) {
      requests.refused += 1;
      throw new NsError('busy', `${endpoint}: ${REQUEST_BUDGET} requests in 5 minutes`);
    }
    window.push(current);
    requests.total += 1;
    requests.byEndpoint[endpoint] = (requests.byEndpoint[endpoint] ?? 0) + 1;
    requests.last = current;
  }

  /**
   * @description Call the API.
   * @param {string} endpoint - ENDPOINTS, for the counters.
   * @param {string} path - The path, after the root.
   * @param {object} [query] - The query parameters (undefined ones left out).
   * @returns {Promise<unknown>} The JSON answer.
   */
  async function call(endpoint, path, query = {}) {
    const key = String(apiKey() ?? '').trim();
    if (!key) {
      throw new NsError('auth', 'no API key');
    }
    take(endpoint);
    const url = new URL(`${baseUrl}${path}`);
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(name, String(value));
      }
    }
    let response;
    try {
      response = await fetchFn(url.toString(), {
        headers: {
          accept: 'application/json',
          'accept-language': API_LANGUAGE,
          'user-agent': USER_AGENT,
          'Ocp-Apim-Subscription-Key': key,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      requests.failed += 1;
      throw new NsError('unreachable', err.cause?.code ?? err.message);
    }
    if (!response.ok) {
      requests.failed += 1;
      let detail = `HTTP ${response.status}`;
      try {
        const text = await response.text();
        if (text.trim()) {
          detail = `${detail}: ${errorDetail(text)}`;
        }
      } catch {
        // No body: the status says enough.
      }
      let kind = 'unreachable';
      if (response.status === 401 || response.status === 403) {
        kind = 'auth';
      } else if (response.status === 429) {
        kind = 'busy';
        const wait = Number(response.headers.get('retry-after'));
        busyUntil = now() + (Number.isFinite(wait) && wait > 0 ? wait * 1000 : BUSY_PAUSE_MS);
      } else if (response.status === 503) {
        kind = 'busy';
      } else if (response.status >= 400 && response.status < 500) {
        kind = 'invalid';
      }
      throw new NsError(kind, detail, { status: response.status });
    }
    try {
      return await response.json();
    } catch (err) {
      requests.failed += 1;
      throw new NsError('invalid', `${endpoint}: ${err.message}`);
    }
  }

  /**
   * @description An answer that must be a list.
   * @param {string} endpoint - ENDPOINTS.
   * @param {unknown} value - The list found in the answer.
   * @returns {object[]} The list.
   */
  function list(endpoint, value) {
    if (!Array.isArray(value)) {
      throw new NsError('invalid', `${endpoint}: not a list`);
    }
    return value.filter((entry) => entry && typeof entry === 'object');
  }

  return {
    requests,
    /**
     * @description Every station NS knows.
     * @returns {Promise<object[]>} `[{ id: { code, uicCode }, names: { long,
     * medium, short, synonyms }, country, stationType }]`.
     */
    stations: async () =>
      list(ENDPOINTS.STATIONS, (await call(ENDPOINTS.STATIONS, '/nsapp-stations/v3'))?.payload),
    /**
     * @description The next departures of one station, cancelled trains included.
     * @param {string} code - The station code ("UT").
     * @returns {Promise<object[]>} `[{ direction, plannedDateTime,
     * actualDateTime, plannedTrack, actualTrack, product, cancelled,
     * routeStations, messages }]`.
     */
    departures: async (code) =>
      list(
        ENDPOINTS.DEPARTURES,
        (
          await call(ENDPOINTS.DEPARTURES, '/reisinformatie-api/api/v2/departures', {
            station: code,
            maxJourneys: 40,
            lang: API_LANGUAGE,
          })
        )?.payload?.departures,
      ),
    /**
     * @description The disruptions, engineering works and calamities about one station.
     * @param {string} code - The station code ("UT").
     * @returns {Promise<object[]>} The disruptions.
     */
    stationDisruptions: async (code) =>
      list(
        ENDPOINTS.STATION_DISRUPTIONS,
        await call(
          ENDPOINTS.STATION_DISRUPTIONS,
          `/disruptions/v3/station/${encodeURIComponent(code)}`,
        ),
      ),
    /**
     * @description Every disruption of the network under way.
     * @returns {Promise<object[]>} The disruptions.
     */
    disruptions: async () =>
      list(
        ENDPOINTS.DISRUPTIONS,
        await call(ENDPOINTS.DISRUPTIONS, '/disruptions/v3', { isActive: true }),
      ),
  };
}

export {
  BASE_URL,
  USER_AGENT,
  ENDPOINTS,
  REQUEST_BUDGET,
  REQUEST_WINDOW_MS,
  NsError,
  errorDetail,
  createNsClient,
};
