// -----------------------------------------------------------------------------
// The departures of a station -> its passages.
//
// NS answers one entry per train leaving the station: its destination
// (`direction`), the stations it calls at next (`routeStations`, short
// names), its product (`categoryCode` "IC", "SPR", "ICE", "ICD"…, its number,
// its operator: NS, Arriva, Keolis, NS International…), the timetable
// (`plannedDateTime`) and the real-time estimate (`actualDateTime`), the
// platform planned and the one used (`plannedTrack`, `actualTrack`),
// `cancelled`, and short messages ("Does not stop at …", "Rear trainset till
// Eindhoven C."). Dates carry their offset ("2026-10-06T09:24:00+0200").
// The delay is the gap between the two times: NS gives no other.
// -----------------------------------------------------------------------------

import { fold } from './stations.js';

const MESSAGE_MAX = 300;

/**
 * @description Read a date of NS.
 * @param {unknown} value - "2026-10-06T09:24:00+0200".
 * @returns {number|null} The instant (ms), null when absent or invalid.
 * @example
 * parseNsDate('2026-10-06T09:24:00+0200'); // -> Date.parse('2026-10-06T07:24:00Z')
 */
function parseNsDate(value) {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  const instant = Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isFinite(instant) ? instant : null;
}

/**
 * @description Split a typed list ("IC | Sprinter", "Amersfoort | Zwolle").
 * @param {string} value - The typed text.
 * @returns {string[]} The folded alternatives.
 * @example
 * terms('IC | Sprinter'); // -> ['ic', 'sprinter']
 */
function terms(value) {
  return String(value ?? '')
    .split(/[|,;]/)
    .map(fold)
    .filter(Boolean);
}

/**
 * @description The names a train type answers to.
 * @param {object} passage - A passage.
 * @returns {string[]} Folded: "ic", "intercity", "ns intercity".
 */
const typeNames = (passage) =>
  [passage.category, passage.categoryName, passage.productName].map(fold).filter(Boolean);

/**
 * @description One departure of the API -> a passage.
 * @param {object} raw - The departure.
 * @returns {object|null} The passage, null without a planned time.
 */
function passageOf(raw) {
  const scheduled = parseNsDate(raw?.plannedDateTime);
  if (scheduled === null) {
    return null;
  }
  const actual = parseNsDate(raw.actualDateTime);
  const product = raw.product && typeof raw.product === 'object' ? raw.product : {};
  const category = String(product.categoryCode || raw.trainCategory || '').trim();
  const plannedPlatform = String(raw.plannedTrack ?? '').trim();
  const platform = String(raw.actualTrack || raw.plannedTrack || '').trim();
  const number = String(product.number ?? '').trim();
  return {
    trip: `${number || category}|${scheduled}`,
    number,
    category,
    categoryName: String(product.longCategoryName ?? '').trim(),
    productName: String(product.shortCategoryName ?? '').trim(),
    operator: String(product.operatorName ?? '').trim(),
    // The label of the screens: "IC", "SPR", "ICE".
    line: category || String(product.shortCategoryName ?? '').trim(),
    destination: String(raw.direction ?? '').trim(),
    via: (Array.isArray(raw.routeStations) ? raw.routeStations : [])
      .map((station) => String(station?.mediumName ?? '').trim())
      .filter(Boolean),
    at: actual ?? scheduled,
    scheduled,
    realtime: actual !== null,
    delay: actual !== null ? Math.round((actual - scheduled) / 60000) : 0,
    cancelled: raw.cancelled === true,
    platform,
    plannedPlatform,
    platformChanged: Boolean(plannedPlatform && platform && platform !== plannedPlatform),
    messages: (Array.isArray(raw.messages) ? raw.messages : [])
      .map((message) => String(message?.message ?? '').trim())
      .filter(Boolean)
      .map((message) => message.slice(0, MESSAGE_MAX)),
  };
}

/**
 * @description The passages of a station, soonest first.
 * @param {object[]} departures - The answer of the departures.
 * @param {object} [filter] - `{ type, direction }`: the optional train types
 * ("IC | SPR") and destinations or calling stations ("Amersfoort | Zwolle").
 * @returns {object[]} The passages, cancelled ones included.
 */
function parsePassages(departures, { type = '', direction = '' } = {}) {
  const types = terms(type);
  const places = terms(direction);
  return (Array.isArray(departures) ? departures : [])
    .map(passageOf)
    .filter(Boolean)
    .filter((passage) => types.length === 0 || typeNames(passage).some((n) => types.includes(n)))
    .filter((passage) => {
      if (places.length === 0) {
        return true;
      }
      const names = [passage.destination, ...passage.via].map(fold);
      return places.some((place) => names.some((name) => ` ${name} `.includes(` ${place}`)));
    })
    .sort((a, b) => a.at - b.at);
}

/**
 * @description The minutes left before a passage.
 * @param {object} passage - The passage.
 * @param {number} now - Now (ms).
 * @returns {number} Whole minutes (rounded down, like the screens).
 */
function minutesLeft(passage, now) {
  return Math.max(0, Math.floor((passage.at - now) / 60000));
}

/**
 * @description The passages not gone yet, cancelled ones left out.
 * @param {object[]} passages - The passages.
 * @param {number} now - Now (ms).
 * @returns {object[]} The passages to come.
 */
const upcomingPassages = (passages, now) =>
  passages.filter((passage) => !passage.cancelled && passage.at > now - 30000);

/**
 * @description The cancelled passages not gone yet.
 * @param {object[]} passages - The passages.
 * @param {number} now - Now (ms).
 * @returns {object[]} The cancelled passages to come.
 */
const cancelledPassages = (passages, now) =>
  passages.filter((passage) => passage.cancelled && passage.scheduled > now - 30000);

/**
 * @description Who a passage is, across readings: type and destination.
 * @param {object} passage - The passage.
 * @returns {string} "IC|venlo".
 */
const routeOf = (passage) => `${passage.line}|${fold(passage.destination)}`;

export {
  parseNsDate,
  terms,
  passageOf,
  parsePassages,
  minutesLeft,
  upcomingPassages,
  cancelledPassages,
  routeOf,
};
