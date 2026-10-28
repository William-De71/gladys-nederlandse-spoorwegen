// -----------------------------------------------------------------------------
// Configuration of the Nederlandse Spoorwegen integration.
//
// Fields of the config_schema:
//   - `api_key`                 the personal key of the NS API portal
//                               (secret, product "Ns-App");
//   - `station_<n>`             a followed station (`<n>` from 1 to 3): its
//                               code ("UT") or its name ("Utrecht Centraal");
//   - `station_<n>_type`        only these train types ("IC", "SPR", "IC |
//                               ICE"), empty for every train;
//   - `station_<n>_direction`   only the trains going to, or calling at, these
//                               stations ("Amersfoort | Zwolle"), empty for
//                               every direction;
//   - `interval`                seconds between two readings of the stations;
//   - `language`                language of the texts Gladys does not ask for
//                               in a language (device names, scene
//                               summaries): `auto` follows the last widget
//                               request.
//
// Internal keys, outside the config_schema (never shown in the UI, stored by
// setConfig):
//   - `added_stations`          the stations added with the "Add a station"
//                               button, `[{ station, type, direction }]` (the
//                               station as its code), next to the three of
//                               the form. Kept in the Gladys database, so
//                               they follow its backups;
//   - `last_language`           language of the last widget request.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

const MAX_STATIONS = 3;
// Each followed station is one request per reading, and NS allows 300
// requests per 5 minutes: a home, a workplace, a school and a few more.
const MAX_ADDED_STATIONS = 10;
const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { addedStations: 'added_stations', language: 'last_language' };
const INTERVALS = [30, 60, 120, 300];
const DEFAULT_INTERVAL = 60;

const readString = (raw) => (typeof raw === 'string' ? raw.trim() : '');

/**
 * @description Read the reading interval.
 * @param {unknown} raw - The raw value ("60", 60).
 * @returns {number} Seconds, one of INTERVALS.
 */
function readInterval(raw) {
  const value = Number(raw);
  return INTERVALS.includes(value) ? value : DEFAULT_INTERVAL;
}

/**
 * @description Read the stations added with the configuration buttons.
 * @param {unknown} raw - The stored value: an array (or its JSON text).
 * @returns {Array<{ station: string, type: string, direction: string }>} The
 * valid entries, MAX_ADDED_STATIONS at most.
 * @example
 * parseAddedStations([{ station: 'UT', type: 'IC', direction: '' }]);
 */
function parseAddedStations(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return (Array.isArray(list) ? list : [])
    .filter((entry) => entry && typeof entry === 'object' && readString(entry.station))
    .map((entry) => ({
      station: readString(entry.station),
      type: readString(entry.type),
      direction: readString(entry.direction),
    }))
    .slice(0, MAX_ADDED_STATIONS);
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} `{ apiKey, stations: [{ slot, added, station, type,
 * direction }], addedStations, interval, language }`; a slot without a
 * station is left out. `stations` holds the three slots of the form, then the
 * added stations (`slot` null, `added` their position from 1).
 * @example
 * normalizeConfig({ api_key: 'k', station_1: 'UT', station_1_type: 'IC' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const stations = [];
  for (let slot = 1; slot <= MAX_STATIONS; slot += 1) {
    const station = readString(config[`station_${slot}`]);
    if (station) {
      stations.push({
        slot,
        added: null,
        station,
        type: readString(config[`station_${slot}_type`]),
        direction: readString(config[`station_${slot}_direction`]),
      });
    }
  }
  const addedStations = parseAddedStations(config[INTERNAL_KEYS.addedStations]);
  addedStations.forEach((entry, index) =>
    stations.push({ slot: null, added: index + 1, ...entry }),
  );
  return {
    apiKey: readString(config.api_key),
    stations,
    addedStations,
    interval: readInterval(config.interval),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  MAX_STATIONS,
  MAX_ADDED_STATIONS,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  INTERVALS,
  DEFAULT_INTERVAL,
  readInterval,
  parseAddedStations,
  normalizeConfig,
  readLanguage,
};
