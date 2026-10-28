// -----------------------------------------------------------------------------
// The stations of NS, kept in /data and read again every seven days.
//
// A station is typed by its code ("UT", "ASD", the codes of the NS screens),
// its UIC code ("8400621"), its name ("Utrecht Centraal"), its short name
// ("Utrecht C") or a synonym NS gives ("Utrecht", "Den Bosch"). A name typed
// with other words resolves when one station only holds them all
// ("hollands spoor" -> "Den Haag HS").
//
// Names are compared folded: no case, no accent, no punctuation.
// -----------------------------------------------------------------------------

const STATIONS_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

/**
 * @description Fold a text for comparisons.
 * @param {unknown} value - The text.
 * @returns {string} Lower case, no accent, words separated by one space.
 * @example
 * fold("'s-Hertogenbosch"); // -> 's hertogenbosch'
 */
function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * @description A slug for an external id.
 * @param {unknown} value - The text.
 * @param {number} [max] - Its longest length.
 * @returns {string} "den-haag".
 */
function slug(value, max = 40) {
  return fold(value).replace(/ /g, '-').slice(0, max).replace(/-$/, '');
}

/**
 * @description What is kept of a station.
 * @param {object} raw - A station of the API.
 * @returns {object} `{ code, uic, name, short, synonyms, country }`.
 */
const stationOf = (raw) => ({
  code: String(raw.id?.code ?? '').toUpperCase(),
  uic: String(raw.id?.uicCode ?? ''),
  name: String(raw.names?.long ?? raw.id?.code ?? '').trim(),
  short: String(raw.names?.medium ?? raw.names?.short ?? '').trim(),
  synonyms: (Array.isArray(raw.names?.synonyms) ? raw.names.synonyms : [])
    .map((entry) => String(entry).trim())
    .filter(Boolean),
  country: String(raw.country ?? ''),
});

/**
 * @description The names a station answers to, folded.
 * @param {object} station - A known station.
 * @returns {string[]} Its long name first, then the short one and the synonyms.
 */
const namesOf = (station) =>
  [station.name, station.short, ...station.synonyms].map(fold).filter(Boolean);

/**
 * @description The order of stations: the Netherlands first, then by name.
 * @param {object} a - A station.
 * @param {object} b - Another one.
 * @returns {number} The order.
 */
const byCountry = (a, b) =>
  Number(a.country !== 'NL') - Number(b.country !== 'NL') || a.name.localeCompare(b.name, 'nl');

/**
 * @description The station of a list, when there is one only.
 * @param {object[]} found - Candidate stations.
 * @returns {object|null} The station.
 */
const single = (found) => (found.length === 1 ? found[0] : null);

/**
 * @description Find a station among the known ones.
 * @param {object[]} stations - The known stations.
 * @param {string} typed - A code, a UIC code or a name.
 * @returns {object|null} The station.
 * @example
 * findStation(stations, 'utrecht'); // -> { code: 'UT', name: 'Utrecht Centraal', … }
 */
function findStation(stations, typed) {
  const raw = String(typed ?? '').trim();
  if (!raw) {
    return null;
  }
  const upper = raw.toUpperCase();
  const byCode = stations.find((station) => station.code === upper || station.uic === raw);
  if (byCode) {
    return byCode;
  }
  const wanted = fold(raw);
  if (!wanted) {
    return null;
  }
  const byName = stations.filter((station) => fold(station.name) === wanted);
  if (byName.length > 0) {
    return single(byName);
  }
  const byOther = stations.filter((station) => namesOf(station).includes(wanted));
  if (byOther.length > 0) {
    return single(byOther);
  }
  // A unique station holding every typed word ("hollands spoor").
  const words = wanted.split(' ');
  const holds = (name) => words.every((word) => ` ${name} `.includes(` ${word}`));
  return single(stations.filter((station) => namesOf(station).some(holds)));
}

/**
 * @description Search stations by name, for the "Find a station" button.
 * @param {object[]} stations - The known stations.
 * @param {string} query - Words of the name.
 * @param {number} [max] - The most stations returned.
 * @returns {object[]} The stations, exact names first, the Netherlands first.
 */
function searchStations(stations, query, max = 8) {
  const words = fold(query).split(' ').filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const wanted = words.join(' ');
  const rank = (station) => {
    const names = namesOf(station);
    if (station.code === query.trim().toUpperCase() || names.includes(wanted)) {
      return 0;
    }
    return names.some((name) => name.startsWith(wanted)) ? 1 : 2;
  };
  return stations
    .filter(
      (station) =>
        station.code === query.trim().toUpperCase() ||
        namesOf(station).some((name) => words.every((word) => ` ${name} `.includes(` ${word}`))),
    )
    .sort((a, b) => rank(a) - rank(b) || byCountry(a, b))
    .slice(0, max);
}

/**
 * @description The stations, read through the API and kept in the store.
 * @param {object} options - Options.
 * @param {object} options.api - The NS client.
 * @param {object} options.store - The store (`data.stations`).
 * @param {Function} options.now - `() => number` in ms.
 * @param {object} [options.logger] - Logger.
 * @returns {object} The stations.
 */
function createStations({ api, store, now, logger }) {
  const data = () => {
    if (!store.data.stations || typeof store.data.stations !== 'object') {
      store.data.stations = { list: null, readAt: 0 };
    }
    return store.data.stations;
  };

  /**
   * @description The stations, read again weekly. A failed reading keeps what
   * is known.
   * @param {boolean} [force] - Read even when fresh.
   * @returns {Promise<object[]>} The stations.
   */
  async function list(force = false) {
    const kept = data();
    const fresh = kept.list && now() - kept.readAt < STATIONS_MAX_AGE_MS;
    if (fresh && !force) {
      return kept.list;
    }
    try {
      const read = (await api.stations())
        .map(stationOf)
        .filter((station) => station.code && station.name);
      if (read.length === 0) {
        throw new Error('no station');
      }
      kept.list = read;
      kept.readAt = now();
      await store.save();
    } catch (err) {
      // A refused key must be told, even with an old list.
      if (!kept.list || err.kind === 'auth') {
        throw err;
      }
      logger?.warn(`NS stations not read again (${err.kind ?? 'error'}): ${err.message}`);
    }
    return kept.list;
  }

  return {
    list,
    /**
     * @description A station known without reading anything.
     * @param {string} code - Its code ("UT").
     * @returns {object|null} The station.
     */
    peek: (code) => data().list?.find((station) => station.code === String(code)) ?? null,
    /**
     * @description Resolve a typed station.
     * @param {string} typed - A code or a name.
     * @returns {Promise<object|null>} The station, null when unknown or ambiguous.
     */
    resolve: async (typed) => findStation(await list(), typed),
    /**
     * @description Search stations by name.
     * @param {string} query - Words of the name.
     * @returns {Promise<object[]>} The stations.
     */
    search: async (query) => searchStations(await list(), query),
  };
}

export {
  STATIONS_MAX_AGE_MS,
  fold,
  slug,
  stationOf,
  namesOf,
  findStation,
  searchStations,
  createStations,
};
