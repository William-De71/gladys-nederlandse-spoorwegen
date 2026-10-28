// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in
// /data/nederlandse-spoorwegen.json (the only writable place of the container):
//   - `stations`  the stations of NS (read again weekly), so a restart reads
//                 nothing but the departures and the disruptions;
//   - `seen`      what the scene triggers already know, per followed station:
//                 the reminders fired, the trains watched (cancelled, delay
//                 mark reached, platform), the disruptions under way.
//                 A restart never fires the same event twice.
// The departures themselves are not kept: they are read again at start.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/nederlandse-spoorwegen.json';
const EMPTY = () => ({
  stations: { list: null, readAt: 0 },
  seen: { reminders: {}, trains: {}, disruptions: {} },
});

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger }`.
 * @returns {object} `{ data, load, save }`.
 */
function createStore({ path = DEFAULT_PATH, logger } = {}) {
  const store = {
    data: EMPTY(),
    /**
     * @description Read the file; an absent or broken file is an empty store.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const raw = JSON.parse(await readFile(path, 'utf8'));
        const base = EMPTY();
        const value = raw && typeof raw === 'object' ? raw : {};
        const part = (name) => (value[name] && typeof value[name] === 'object' ? value[name] : {});
        store.data = {
          stations: { ...base.stations, ...part('stations') },
          seen: { ...base.seen, ...part('seen') },
        };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger?.warn(`Unable to read ${path}: ${err.message}`);
        }
        store.data = EMPTY();
      }
    },
    /**
     * @description Write the file (atomically: a temporary file, then a rename).
     * @returns {Promise<void>}
     */
    async save() {
      try {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await writeFile(temporary, JSON.stringify(store.data));
        await rename(temporary, path);
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
  };
  return store;
}

export { DEFAULT_PATH, createStore };
