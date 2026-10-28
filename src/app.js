// -----------------------------------------------------------------------------
// The Nederlandse Spoorwegen integration: every handler, registered on a
// Gladys client.
//
// Brings the Dutch trains into Gladys, through the official API of NS (a free
// personal key):
//   - devices (device.js): one per followed station — the three of the form
//     and the ones added with the "Add a station" button, filtered by train
//     type and direction — with the next train, the waits, the delay and the
//     disruptions about the station;
//   - scene triggers (events.js): departure soon, train cancelled, train
//     delayed, platform changed, disruption started, disruption over;
//   - scene actions: read the next trains of a station, read its disruptions;
//   - dashboard widgets (widgets.js): departures, disruptions.
//
// The API has no push: each followed station is read (one request per
// station, one after the other) on the integration's own timer (every 30 s to
// 5 min, 1 min by default; every 10 min while no station announces a train in
// the next half hour, at night), its disruptions every 5 min, never on a
// Gladys poll. The stations of NS are kept in /data (stations.js).
// Transport: cloud only.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  readLanguage,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
  MAX_ADDED_STATIONS,
} from './config.js';
import { createNsClient } from './ns-api.js';
import { createStations, fold } from './stations.js';
import { createStore, DEFAULT_PATH } from './store.js';
import { parsePassages, upcomingPassages } from './departures.js';
import { parseDisruptions, stationTraffic } from './disruptions.js';
import {
  stationKey,
  followedName,
  idsOf,
  keyOfExternalId,
  buildStationDevice,
  buildDepartureStates,
  buildTrafficStates,
} from './device.js';
import {
  detectReminders,
  detectTrainChanges,
  detectDisruptionChanges,
  reminderData,
  cancelledData,
  delayedData,
  platformData,
  startedData,
  endedData,
  nextDeparturesOutputs,
  stationDisruptionsOutputs,
  pick,
  TRIGGERS,
  NEXT_DEPARTURES_OUTPUTS,
  STATION_DISRUPTIONS_OUTPUTS,
} from './events.js';
import {
  WIDGETS,
  BOARD_COUNT,
  messageContent,
  readCount,
  buildDeparturesWidget,
  buildDisruptionsWidget,
} from './widgets.js';
import { defaultTimeZone, MINUTE_MS } from './time.js';
import { t, all, trainLabel, passageWhen, LANGUAGES } from './i18n.js';

const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
  SEARCH_STATION: 'search_station',
  ADD_STATION: 'add_station',
  REMOVE_STATION: 'remove_station',
  LIST_STATIONS: 'list_stations',
  DIAGNOSTIC: 'diagnostic',
};
const SCENE_ACTIONS = {
  GET_NEXT_DEPARTURES: 'get_next_departures',
  GET_STATION_DISRUPTIONS: 'get_station_disruptions',
};
// While no station announces a train in QUIET_HORIZON_MS (the night), the
// stations are read this often.
const IDLE_INTERVAL_MS = 10 * MINUTE_MS;
const QUIET_HORIZON_MS = 30 * MINUTE_MS;
const DISRUPTIONS_INTERVAL_MS = 5 * MINUTE_MS;
const REMINDER_TICK_MS = 30 * 1000;
// A widget or a scene action reuses a reading this fresh.
const SNAPSHOT_MAX_AGE_MS = 90 * 1000;
const BOARD_MAX_AGE_MS = 60 * 1000;
const DISRUPTIONS_MAX_AGE_MS = 3 * MINUTE_MS;
// Names that could not be resolved for a network reason are tried again.
const RESOLVE_RETRY_MS = 5 * MINUTE_MS;
const DIAGNOSTIC_CHUNK = 3000;
const ACTION_TEXT_MAX = 1500;
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/**
 * @description Cut a text of several lines at a line break, under a bound.
 * @param {string} text - The text.
 * @param {number} max - The bound.
 * @returns {string} The whole lines that fit, then "…".
 */
function clipLines(text, max) {
  if (text.length <= max) {
    return text;
  }
  const cut = text.lastIndexOf('\n', max - 2);
  return `${text.slice(0, cut > 0 ? cut : max - 2)}\n…`;
}

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - HTTP transport of the API (tests).
 * @param {string} [options.baseUrl] - The gateway root (tests).
 * @param {string} [options.storePath] - The file kept in /data.
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {string} [options.timeZone] - IANA timezone of the times (TZ by default).
 * @param {boolean} [options.timers] - Arm the reading timers (false in tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    fetch: fetchFn,
    baseUrl,
    storePath = DEFAULT_PATH,
    now = () => Date.now(),
    timeZone = defaultTimeZone(),
    timers = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  // The raw values last read, internal keys included: the base of setConfig.
  let rawConfig = {};
  // The stations added with the buttons, one change at a time.
  let writingStations = Promise.resolve();
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`.
  let language = 'en';
  let createdDevices = new Set();
  // The followed stations, resolved, and the names NS does not know.
  let followedList = [];
  // config.stations[i] -> its followed station (null when unknown), for
  // "List the stations".
  let entries = [];
  let notFound = [];
  // station key -> { passages, readAt } of its last reading; the last error of
  // the reading of the departures.
  const snapshots = new Map();
  let departuresError = null;
  let departuresReadAt = 0;
  // station code -> { list, readAt } of its last disruptions reading.
  const disruptions = new Map();
  let disruptionsError = null;
  let disruptionsPending = null;
  let network = { list: null, readAt: 0 };
  // typed station -> { passages, readAt }, for the widgets of other stations.
  const boards = new Map();
  let resolveError = null;
  let lastStatus = null;
  let lastDiscovery = null;
  let departuresTimer = null;
  let disruptionsTimer = null;
  let reminderTimer = null;
  let resolveTimer = null;
  let readingDepartures = null;
  let stopped = false;

  const api = createNsClient({
    apiKey: () => config.apiKey,
    now,
    ...(fetchFn ? { fetch: fetchFn } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });
  const store = createStore({ path: storePath, logger });
  const stations = createStations({ api, store, now, logger });

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language.
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description The message of an error, for a user.
   * @param {Error} err - The error.
   * @param {string} lang - The language.
   * @returns {string} The message.
   */
  function errorText(err, lang) {
    if (err?.kind === 'auth') {
      return t(config.apiKey ? 'errorAuth' : 'errorNoKey', lang);
    }
    return t(err?.kind === 'busy' ? 'errorBusy' : 'errorUnreachable', lang);
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description Work out the connection status from the last readings.
   * @returns {Promise<void>}
   */
  async function refreshStatus() {
    if (!config.apiKey) {
      await reportStatus(false, all('statusNoKey'));
      return;
    }
    const errors = [resolveError, departuresError, disruptionsError].filter(Boolean);
    const refused = errors.find((err) => err.kind === 'auth');
    if (refused) {
      await reportStatus(
        false,
        all('statusAuth', { detail: String(refused.message ?? '').slice(0, 80) }),
      );
      return;
    }
    const failing = (followedList.length && departuresError ? 1 : 0) + (disruptionsError ? 1 : 0);
    if (resolveError || failing >= (followedList.length ? 2 : 1)) {
      const err = resolveError ?? departuresError ?? disruptionsError;
      await reportStatus(
        false,
        all('statusUnreachable', {
          detail: String(err?.message ?? '').slice(0, 80),
          minutes: Math.round(Math.max(config.interval * 1000, MINUTE_MS) / MINUTE_MS),
        }),
      );
      return;
    }
    const unknown = notFound.length
      ? (l) => ` ${t('statusNotFound', l, { names: notFound.join(', ') })}`
      : () => '';
    const key = followedList.length === 0 ? 'statusNothing' : 'statusConnected';
    await reportStatus(
      true,
      Object.fromEntries(
        LANGUAGES.map((l) => [
          l,
          `${t(key, l, { stations: followedList.length, interval: config.interval })}${unknown(l)}`,
        ]),
      ),
    );
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Ask the open widgets to pull their content again.
   * @param {string[]} keys - The widget keys.
   */
  function refreshWidgets(keys) {
    for (const key of keys) {
      Promise.resolve(gladys.requestWidgetRefresh(key)).catch(() => {});
    }
  }

  /**
   * @description Publish scene events, one by one.
   * @param {Array<{ key: string, data: object }>} events - The events.
   * @returns {Promise<void>}
   */
  async function publishEvents(events) {
    for (const { key, data } of events) {
      logger.info(`${data.station_name}: ${key}`);
      try {
        await gladys.publishSceneEvent(key, data);
      } catch (err) {
        logger.warn(`Unable to fire ${key}: ${err.message}`);
      }
    }
  }

  // --- Stations ----------------------------------------------------------------------

  /**
   * @description Resolve one station of the configuration.
   * @param {object} entry - `{ slot, added, station, type, direction }`.
   * @returns {Promise<object>} The followed station, or `{ unknown }`: the
   * typed name NS does not know (or a name shared by two stations).
   */
  async function resolveEntry(entry) {
    const station = await stations.resolve(entry.station);
    if (!station) {
      return { unknown: entry.station };
    }
    const key = stationKey(station, entry.type, entry.direction);
    const followed = {
      slot: entry.slot,
      added: entry.added ?? null,
      station,
      type: entry.type,
      direction: entry.direction,
      key,
    };
    return {
      ...followed,
      name: followedName(followed),
      deviceId: idsOf(gladys, key).device,
    };
  }

  /**
   * @description Resolve the configured stations.
   * @returns {Promise<void>}
   */
  async function resolveConfig() {
    clearTimeout(resolveTimer);
    const resolved = [];
    const resolvedEntries = [];
    const unknown = [];
    if (!config.apiKey) {
      followedList = [];
      entries = [];
      notFound = [];
      resolveError = null;
      return;
    }
    try {
      for (const entry of config.stations) {
        const followed = await resolveEntry(entry);
        if (followed.unknown) {
          unknown.push(followed.unknown);
          resolvedEntries.push(null);
          continue;
        }
        const known = resolved.find((other) => other.key === followed.key);
        if (!known) {
          resolved.push(followed);
        }
        resolvedEntries.push(known ?? followed);
      }
      resolveError = null;
    } catch (err) {
      // Keep what was resolved before; try again later (not with a refused key).
      logger.warn(`Unable to read the stations (${err.kind ?? 'error'}): ${err.message}`);
      resolveError = err;
      if (timers && !stopped && err.kind !== 'auth') {
        resolveTimer = setTimeout(() => {
          applyConfig().catch(() => {});
        }, RESOLVE_RETRY_MS);
        resolveTimer.unref?.();
      }
      return;
    }
    followedList = resolved;
    entries = resolvedEntries;
    notFound = unknown;
    for (const key of [...snapshots.keys()]) {
      if (!followedList.some((followed) => followed.key === key)) {
        snapshots.delete(key);
      }
    }
  }

  /**
   * @description Offer a device per station on the Discovery screen, when
   * they changed.
   * @param {boolean} [force] - Publish even when unchanged.
   * @returns {Promise<number>} How many devices were offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const lang = textLanguage();
    const devices = followedList.map((followed) => buildStationDevice(gladys, followed, lang));
    const signature = JSON.stringify(devices);
    if (force || signature !== lastDiscovery) {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    }
    return devices.length;
  }

  // --- Reading the departures ----------------------------------------------------------

  /**
   * @description Publish the departure states of a station, when its device exists.
   * @param {object} followed - The followed station.
   * @returns {Promise<void>}
   */
  async function publishDepartureStates(followed) {
    const snapshot = snapshots.get(followed.key);
    if (!snapshot || !createdDevices.has(followed.deviceId)) {
      return;
    }
    await gladys
      .publishChangedStates(
        buildDepartureStates(gladys, followed, snapshot.passages, {
          language: textLanguage(),
          now: now(),
          timeZone,
        }),
      )
      .catch((err) =>
        logger.warn(`Unable to publish the states of ${followed.name}: ${err.message}`),
      );
  }

  /**
   * @description The reminders due on the last reading of a station.
   * @param {object} followed - The followed station.
   * @returns {object[]} The events.
   */
  function reminderEvents(followed) {
    const snapshot = snapshots.get(followed.key);
    if (!snapshot) {
      return [];
    }
    const { due, fired } = detectReminders({
      passages: snapshot.passages,
      fired: store.data.seen.reminders[followed.key],
      now: now(),
    });
    store.data.seen.reminders[followed.key] = fired;
    return due.map(({ passage, mark }) => ({
      key: TRIGGERS.DEPARTURE_SOON,
      data: reminderData(followed, passage, mark, { language: textLanguage(), timeZone }),
    }));
  }

  /**
   * @description The cancellations, delays and platform changes not reported
   * yet on the last reading of a station.
   * @param {object} followed - The followed station.
   * @returns {object[]} The events.
   */
  function trainEvents(followed) {
    const snapshot = snapshots.get(followed.key);
    if (!snapshot) {
      return [];
    }
    store.data.seen.trains ??= {};
    const changes = detectTrainChanges({
      passages: snapshot.passages,
      known: store.data.seen.trains[followed.key],
      now: now(),
    });
    store.data.seen.trains[followed.key] = changes.known;
    const options = { language: textLanguage(), timeZone };
    return [
      ...changes.cancelled.map((passage) => ({
        key: TRIGGERS.DEPARTURE_CANCELLED,
        data: cancelledData(followed, passage, options),
      })),
      ...changes.delayed.map(({ passage, mark }) => ({
        key: TRIGGERS.DEPARTURE_DELAYED,
        data: delayedData(followed, passage, mark, options),
      })),
      ...changes.platforms.map((passage) => ({
        key: TRIGGERS.PLATFORM_CHANGED,
        data: platformData(followed, passage, options),
      })),
    ];
  }

  /**
   * @description The passages of a followed (or typed) station in the departures read.
   * @param {object} followed - `{ type, direction }`.
   * @param {object[]} departures - The departures of its station.
   * @returns {object[]} Its passages.
   */
  function passagesOf({ type = '', direction = '' }, departures) {
    return parsePassages(departures, { type, direction });
  }

  /**
   * @description What follows a reading of a station: events, states.
   * @param {object} followed - The followed station.
   * @returns {Promise<void>}
   */
  async function digestDepartures(followed) {
    const events =
      gladys.connected !== false ? [...trainEvents(followed), ...reminderEvents(followed)] : [];
    await store.save();
    await publishEvents(events);
    await publishDepartureStates(followed);
  }

  /**
   * @description Read some followed stations now: one request per station
   * code, one after the other (two devices of one station share a request). A
   * station that fails keeps its last reading; the error is thrown once the
   * others are done.
   * @param {object[]} list - The followed stations.
   * @returns {Promise<void>}
   */
  async function readFollowed(list) {
    let failure = null;
    const read = [];
    for (const code of [...new Set(list.map((followed) => followed.station.code))]) {
      try {
        const departures = await api.departures(code);
        const readAt = now();
        for (const followed of list.filter((item) => item.station.code === code)) {
          snapshots.set(followed.key, { passages: passagesOf(followed, departures), readAt });
          read.push(followed);
        }
      } catch (err) {
        failure = err;
      }
    }
    departuresError = failure;
    if (read.length > 0) {
      departuresReadAt = now();
    }
    for (const followed of read) {
      await digestDepartures(followed);
    }
    if (failure) {
      throw failure;
    }
  }

  /**
   * @description Whether the stations are due for a reading.
   * @returns {boolean} True when due.
   */
  function departuresDue() {
    if (departuresError || followedList.some((followed) => !snapshots.has(followed.key))) {
      return true;
    }
    const age = now() - departuresReadAt;
    // At night no station announces a train soon: read them less often.
    const quiet = followedList.every((followed) =>
      upcomingPassages(snapshots.get(followed.key).passages, now()).every(
        (passage) => passage.at - now() > QUIET_HORIZON_MS,
      ),
    );
    return age >= (quiet ? IDLE_INTERVAL_MS : config.interval * 1000) - 1000;
  }

  /**
   * @description Read every followed station when due (one reading at a time).
   * @param {object} [options] - `{ force }`: read even when not due.
   * @returns {Promise<void>}
   */
  function readDepartures({ force = false } = {}) {
    if (!readingDepartures) {
      readingDepartures = (async () => {
        if (followedList.length > 0 && (force || departuresDue())) {
          try {
            await readFollowed(followedList);
            refreshWidgets([WIDGETS.DEPARTURES]);
          } catch (err) {
            logger.warn(`NS departures (${err.kind ?? 'error'}): ${err.message}`);
          }
        }
        await refreshStatus();
      })().finally(() => {
        readingDepartures = null;
      });
    }
    return readingDepartures;
  }

  /**
   * @description The snapshots of followed stations, read again (together)
   * when older than `maxAgeMs`.
   * @param {object[]} list - The followed stations.
   * @param {number} maxAgeMs - The freshness wanted.
   * @returns {Promise<object[]>} Their snapshots, in the same order.
   */
  async function snapshotsOf(list, maxAgeMs) {
    const stale = list.filter((followed) => {
      const snapshot = snapshots.get(followed.key);
      return !snapshot || now() - snapshot.readAt > maxAgeMs;
    });
    if (stale.length > 0) {
      await readFollowed(stale);
    }
    return list.map((followed) => snapshots.get(followed.key));
  }

  /**
   * @description Check the reminders on the last readings (between readings).
   * @returns {Promise<void>}
   */
  async function checkReminders() {
    // Disconnected, the event would be lost while marked as fired.
    if (gladys.connected === false) {
      return;
    }
    const events = followedList.flatMap((followed) => reminderEvents(followed));
    if (events.length) {
      await store.save();
      await publishEvents(events);
    }
  }

  // --- Reading the disruptions --------------------------------------------------------

  /**
   * @description The traffic of a station code from the last reading.
   * @param {string} code - The station code.
   * @returns {object} stationTraffic().
   */
  const trafficOf = (code) => stationTraffic(disruptions.get(code)?.list ?? null, now());

  /**
   * @description Publish what a disruptions reading changed: events and
   * states of the followed stations.
   * @returns {Promise<void>}
   */
  async function digestDisruptions() {
    const lang = textLanguage();
    const current = now();
    if (gladys.connected !== false) {
      store.data.seen.disruptions ??= {};
      const events = [];
      for (const followed of followedList) {
        const read = disruptions.get(followed.station.code);
        if (!read) {
          continue;
        }
        const changes = detectDisruptionChanges({
          traffic: stationTraffic(read.list, current),
          seen: store.data.seen.disruptions[followed.key],
          now: current,
        });
        store.data.seen.disruptions[followed.key] = changes.seen;
        const options = { language: lang, timeZone, now: current };
        events.push(
          ...changes.started.map((disruption) => ({
            key: TRIGGERS.DISRUPTION_STARTED,
            data: startedData(followed, disruption, options),
          })),
          ...changes.ended.map((entry) => ({
            key: TRIGGERS.DISRUPTION_ENDED,
            data: endedData(followed, entry, options),
          })),
        );
      }
      await store.save();
      await publishEvents(events);
    }
    const states = followedList
      .filter((followed) => createdDevices.has(followed.deviceId))
      .filter((followed) => disruptions.has(followed.station.code))
      .flatMap((followed) =>
        buildTrafficStates(gladys, followed, trafficOf(followed.station.code), lang),
      );
    if (states.length > 0) {
      await gladys
        .publishChangedStates(states)
        .catch((err) => logger.warn(`Unable to publish the traffic states: ${err.message}`));
    }
    refreshWidgets([WIDGETS.DISRUPTIONS]);
  }

  /**
   * @description Read the disruptions of the followed stations now (one
   * reading at a time). A station that fails keeps its last reading.
   * @returns {Promise<void>}
   */
  function readDisruptionsNow() {
    if (!disruptionsPending) {
      disruptionsPending = (async () => {
        let failure = null;
        for (const code of [...new Set(followedList.map((followed) => followed.station.code))]) {
          try {
            const list = parseDisruptions(await api.stationDisruptions(code));
            disruptions.set(code, { list, readAt: now() });
          } catch (err) {
            failure = err;
          }
        }
        disruptionsError = failure;
        await digestDisruptions();
        if (failure) {
          throw failure;
        }
      })().finally(() => {
        disruptionsPending = null;
      });
    }
    return disruptionsPending;
  }

  /**
   * @description The regular reading of the disruptions.
   * @returns {Promise<void>}
   */
  async function disruptionsTick() {
    if (followedList.length > 0) {
      await readDisruptionsNow().catch((err) =>
        logger.warn(`NS disruptions (${err.kind ?? 'error'}): ${err.message}`),
      );
    }
    await refreshStatus();
  }

  /**
   * @description The disruptions of followed stations, read again when older
   * than `maxAgeMs`.
   * @param {object[]} list - The followed stations.
   * @param {number} maxAgeMs - The freshness wanted.
   * @returns {Promise<void>}
   */
  async function freshDisruptions(list, maxAgeMs) {
    const stale = list.some((followed) => {
      const read = disruptions.get(followed.station.code);
      return !read || now() - read.readAt > maxAgeMs;
    });
    if (stale) {
      await readDisruptionsNow();
    }
  }

  /**
   * @description The disruptions of the whole network, read again when older
   * than DISRUPTIONS_MAX_AGE_MS.
   * @returns {Promise<object>} `{ list, readAt }`.
   */
  async function networkDisruptions() {
    if (!network.list || now() - network.readAt > DISRUPTIONS_MAX_AGE_MS) {
      network = { list: parseDisruptions(await api.disruptions()), readAt: now() };
    }
    return network;
  }

  // --- Timers ------------------------------------------------------------------------

  /**
   * @description (Re)arm the timers.
   */
  function schedule() {
    clearInterval(departuresTimer);
    clearInterval(disruptionsTimer);
    clearInterval(reminderTimer);
    if (!timers || stopped) {
      return;
    }
    // A short tick: departuresDue() decides whether the stations are due.
    departuresTimer = setInterval(
      () => {
        readDepartures().catch((err) => logger.error('Departures', err));
      },
      Math.min(config.interval * 1000, 30000),
    );
    disruptionsTimer = setInterval(() => {
      disruptionsTick().catch((err) => logger.error('Disruptions', err));
    }, DISRUPTIONS_INTERVAL_MS);
    reminderTimer = setInterval(() => {
      checkReminders().catch((err) => logger.warn(`Reminders: ${err.message}`));
    }, REMINDER_TICK_MS);
    [departuresTimer, disruptionsTimer, reminderTimer].forEach((timer) => timer.unref?.());
  }

  /**
   * @description Resolve the configuration, offer the devices, read everything.
   * @returns {Promise<void>}
   */
  async function applyConfig() {
    await resolveConfig();
    logger.info(
      `${followedList.length} station(s): ${followedList.map((f) => f.name).join(', ') || 'none'}` +
        (notFound.length ? `; unknown: ${notFound.join(', ')}` : ''),
    );
    await publishDiscoveredDevices().catch((err) =>
      logger.warn(`Unable to offer the devices: ${err.message}`),
    );
    await readDepartures({ force: true });
    await disruptionsTick();
    schedule();
  }

  // --- Dashboard widgets -------------------------------------------------------------

  /**
   * @description What a widget or a scene action targets, by device external id.
   * @param {unknown} externalId - The `source: "devices"` value.
   * @returns {object|null} The followed station, the first one by default.
   */
  function target(externalId) {
    const key = keyOfExternalId(externalId);
    const found = key ? followedList.find((item) => item.key === key) : null;
    return found ?? followedList[0] ?? null;
  }

  /**
   * @description The trains of a station typed in a widget.
   * @param {string} typed - The station.
   * @param {string} type - Its optional train types.
   * @param {string} lang - The language.
   * @returns {Promise<object>} `{ title, passages, readAt }` or `{ message }`.
   */
  async function typedBoard(typed, type, lang) {
    const station = await stations.resolve(typed);
    if (!station) {
      return { message: t('statusNotFound', lang, { names: typed.slice(0, 60) }) };
    }
    const key = stationKey(station, type, '');
    let board = boards.get(key);
    if (!board || now() - board.readAt > BOARD_MAX_AGE_MS) {
      const departures = await api.departures(station.code);
      board = { readAt: now(), passages: passagesOf({ type }, departures) };
      boards.set(key, board);
    }
    return { title: followedName({ station, type, direction: '' }), ...board };
  }

  /**
   * @description The followed stations chosen in a multi-select setting, by
   * device external id.
   * @param {unknown} raw - The `multi_select` value.
   * @returns {object[]} The followed stations, in the order chosen.
   */
  function chosen(raw) {
    const list = [];
    for (const id of Array.isArray(raw) ? raw : []) {
      const key = keyOfExternalId(id);
      const followed = key ? followedList.find((item) => item.key === key) : null;
      if (followed && !list.includes(followed)) {
        list.push(followed);
      }
    }
    return list;
  }

  /**
   * @description The followed stations chosen in the `stations` setting of a
   * widget, grouped by station: devices of one station (one per type or
   * direction) make one board, their trains merged.
   * @param {unknown} raw - The `multi_select` value: device external ids.
   * @returns {Promise<object[]>} `[{ title, label, passages, readAt }]`, in the
   * order chosen; empty when no chosen device is followed any more.
   */
  async function followedBoards(raw) {
    const groups = new Map();
    for (const followed of chosen(raw)) {
      const code = followed.station.code;
      groups.set(code, [...(groups.get(code) ?? []), followed]);
    }
    // Every chosen device in one request when they need a new reading.
    await snapshotsOf([...groups.values()].flat(), SNAPSHOT_MAX_AGE_MS);
    const result = [];
    for (const members of groups.values()) {
      const read = members.map((followed) => snapshots.get(followed.key));
      // A train of two chosen devices (all the trains and the IC only) once.
      const passages = new Map();
      for (const passage of read.flatMap((snapshot) => snapshot.passages)) {
        passages.set(passage.trip, passage);
      }
      const [first] = members;
      result.push({
        title: members.length > 1 ? first.station.name : first.name,
        label: first.station.name,
        passages: [...passages.values()].sort((a, b) => a.at - b.at),
        readAt: Math.min(...read.map((snapshot) => snapshot.readAt)),
      });
    }
    return result;
  }

  gladys.onWidgetGet(WIDGETS.DEPARTURES, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    if (!config.apiKey || resolveError?.kind === 'auth') {
      return messageContent(errorText(resolveError ?? { kind: 'auth' }, lang));
    }
    const count = readCount(settings.count, BOARD_COUNT);
    const typed = typeof settings.station_name === 'string' ? settings.station_name.trim() : '';
    const typedType = typeof settings.type === 'string' ? settings.type.trim() : '';
    try {
      let board;
      if (typed) {
        board = await typedBoard(typed, typedType, lang);
        if (board.message) {
          return messageContent(board.message);
        }
      } else {
        const several = await followedBoards(settings.stations);
        if (several.length > 1) {
          board = { boards: several };
        } else if (several.length === 1) {
          board = several[0];
        } else {
          const followed = target(settings.station);
          if (!followed) {
            return messageContent(t('widgetNoStation', lang));
          }
          const [snapshot] = await snapshotsOf([followed], SNAPSHOT_MAX_AGE_MS);
          board = { title: followed.name, ...snapshot };
        }
      }
      return buildDeparturesWidget({ ...board, count, language: lang, now: now(), timeZone });
    } catch (err) {
      logger.warn(`Widget: unable to read the departures: ${err.message}`);
      return messageContent(errorText(err, lang), 60);
    }
  });

  gladys.onWidgetGet(WIDGETS.DISRUPTIONS, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    if (!config.apiKey || resolveError?.kind === 'auth') {
      return messageContent(errorText(resolveError ?? { kind: 'auth' }, lang));
    }
    try {
      if (settings.network === true || followedList.length === 0) {
        const read = await networkDisruptions();
        return buildDisruptionsWidget({
          network: stationTraffic(read.list, now()).current,
          readAt: read.readAt,
          language: lang,
          now: now(),
          timeZone,
        });
      }
      const picked = chosen(settings.stations);
      const list = picked.length > 0 ? picked : followedList;
      await freshDisruptions(list, DISRUPTIONS_MAX_AGE_MS);
      // One row per station, whatever the devices of it chosen.
      const codes = [...new Set(list.map((followed) => followed.station.code))];
      const shown = codes.map((code) => {
        const followed = list.find((item) => item.station.code === code);
        return { name: followed.station.name, traffic: trafficOf(code) };
      });
      const readAt = Math.min(...codes.map((code) => disruptions.get(code)?.readAt ?? now()));
      return buildDisruptionsWidget({
        stations: shown,
        readAt,
        language: lang,
        now: now(),
        timeZone,
      });
    } catch (err) {
      logger.warn(`Widget: unable to read the disruptions: ${err.message}`);
      return messageContent(errorText(err, lang), 60);
    }
  });

  // --- Scene actions -----------------------------------------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_NEXT_DEPARTURES, async (fields = {}) => {
    const followed = target(fields.station);
    if (!followed) {
      throw new Error('No NS station is followed');
    }
    const [snapshot] = await snapshotsOf([followed], SNAPSHOT_MAX_AGE_MS);
    return pick(
      nextDeparturesOutputs({
        followed,
        passages: snapshot.passages,
        now: now(),
        language: textLanguage(),
        timeZone,
      }),
      NEXT_DEPARTURES_OUTPUTS,
    );
  });

  gladys.onSceneAction(SCENE_ACTIONS.GET_STATION_DISRUPTIONS, async (fields = {}) => {
    const followed = target(fields.station);
    if (!followed) {
      throw new Error('No NS station is followed');
    }
    await freshDisruptions([followed], SNAPSHOT_MAX_AGE_MS);
    return pick(
      stationDisruptionsOutputs({
        followed,
        traffic: trafficOf(followed.station.code),
        language: textLanguage(),
      }),
      STATION_DISRUPTIONS_OUTPUTS,
    );
  });

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!config.apiKey) {
      await refreshStatus();
      return all('errorNoKey');
    }
    const messages = [];
    try {
      const known = await stations.list(true);
      messages.push(all('testOk', { count: known.length }));
    } catch (err) {
      resolveError = err;
      await refreshStatus();
      return all('testError', (l) => ({ error: errorText(err, l) }));
    }
    await resolveConfig();
    await publishDiscoveredDevices().catch(() => {});
    let failure = null;
    if (followedList.length > 0) {
      try {
        await readFollowed(followedList);
      } catch (err) {
        failure = err;
      }
    }
    for (const followed of followedList) {
      const snapshot = snapshots.get(followed.key);
      if (!snapshot || (failure && now() - snapshot.readAt > SNAPSHOT_MAX_AGE_MS)) {
        messages.push(
          all('testStationError', (l) => ({
            station: followed.name,
            error: errorText(failure, l),
          })),
        );
        continue;
      }
      const [first] = upcomingPassages(snapshot.passages, now());
      messages.push(
        all('testStation', (l) => ({
          station: followed.name,
          count: snapshot.passages.length,
          next: first
            ? `${trainLabel(first)} ${passageWhen(first, { language: l, now: now(), timeZone })}`
            : '–',
        })),
      );
    }
    await readDisruptionsNow().catch((err) => {
      messages.push(all('testError', (l) => ({ error: errorText(err, l) })));
    });
    notFound.forEach((name) => messages.push(all('unknownEntry', { name })));
    refreshWidgets(Object.values(WIDGETS));
    await refreshStatus();
    return Object.fromEntries(
      LANGUAGES.map((l) => [
        l,
        messages
          .map((entry) => entry[l])
          .join(' · ')
          .slice(0, 1000),
      ]),
    );
  });

  gladys.onAction(ACTIONS.SEARCH_STATION, async (fields = {}) => {
    const query = typeof fields.query === 'string' ? fields.query.trim() : '';
    if (query.length < 2) {
      return all('searchTooShort');
    }
    if (!config.apiKey) {
      return all('errorNoKey');
    }
    let found;
    try {
      found = await stations.search(query);
    } catch (err) {
      return all('testError', (l) => ({ error: errorText(err, l) }));
    }
    if (found.length === 0) {
      return all('searchNone', { query: query.slice(0, 60) });
    }
    const lines = found.map((station) => {
      const country = station.country && station.country !== 'NL' ? ` (${station.country})` : '';
      return `• ${station.name}${country} [${station.code}]`;
    });
    return all('searchFound', { list: clipLines(lines.join('\n'), ACTION_TEXT_MAX - 300) });
  });

  // --- Stations added with the buttons ----------------------------------------------

  const field = (value) => (typeof value === 'string' ? value.trim() : '');

  /**
   * @description Change the added stations, one change after the other: two
   * quick buttons never lose a station. Applied in memory once Gladys saved it.
   * @param {Function} change - `(added) => Promise<{ next?, message }>`: the new
   * list (none: nothing to save) and the answer, or a function of nothing
   * giving it once the stations are read.
   * @returns {Promise<object>} The answer.
   */
  function changeAddedStations(change) {
    const run = writingStations.then(async () => {
      const { next, message } = await change(config.addedStations);
      if (next) {
        await gladys.setConfig({ [INTERNAL_KEYS.addedStations]: next });
        rawConfig = { ...rawConfig, [INTERNAL_KEYS.addedStations]: next };
        config = normalizeConfig(rawConfig);
        await resolveConfig();
        await publishDiscoveredDevices().catch((err) =>
          logger.warn(`Unable to offer the devices: ${err.message}`),
        );
        // Only the new station is due: it has no reading yet.
        await readDepartures();
      }
      return typeof message === 'function' ? message() : message;
    });
    writingStations = run.catch(() => {});
    return run;
  }

  /**
   * @description How a station of the configuration reads in "List the stations".
   * @param {object} entry - A station of `config.stations`.
   * @param {number} index - Its position.
   * @param {string} lang - The language.
   * @returns {string} "2. Utrecht Centraal (IC) (form, station 2)".
   */
  function entryText(entry, index, lang) {
    const followed = entries[index];
    const typed = [entry.station, entry.type, entry.direction && `→ ${entry.direction}`]
      .filter(Boolean)
      .join(' ');
    const notes = [
      entry.slot ? t('stationFromForm', lang, { slot: entry.slot }) : '',
      entries.length && !followed ? t('stationUnknownMark', lang) : '',
    ].filter(Boolean);
    const name = followed?.name ?? typed;
    return `${index + 1}. ${name}${notes.length ? ` (${notes.join(', ')})` : ''}`;
  }

  gladys.onAction(ACTIONS.ADD_STATION, async (fields = {}) => {
    const entry = {
      station: field(fields.station),
      type: field(fields.type),
      direction: field(fields.direction),
    };
    if (entry.station.length < 2) {
      return all('searchTooShort');
    }
    if (!config.apiKey) {
      return all('errorNoKey');
    }
    return changeAddedStations(async (added) => {
      if (added.length >= MAX_ADDED_STATIONS) {
        return { message: all('stationsFull', { max: MAX_ADDED_STATIONS }) };
      }
      let followed;
      try {
        followed = await resolveEntry(entry);
      } catch (err) {
        return { message: all('testError', (l) => ({ error: errorText(err, l) })) };
      }
      if (followed.unknown) {
        return { message: all('statusNotFound', { names: followed.unknown.slice(0, 60) }) };
      }
      if (followedList.some((other) => other.key === followed.key)) {
        return { message: all('stationAlreadyFollowed', { name: followed.name }) };
      }
      // Stored as resolved: the code of the station.
      const stored = {
        station: followed.station.code,
        type: entry.type,
        direction: entry.direction,
      };
      logger.info(`Station added: ${followed.name}`);
      return {
        next: [...added, stored],
        message: () => all('stationAdded', { name: followed.name, count: followedList.length }),
      };
    });
  });

  gladys.onAction(ACTIONS.REMOVE_STATION, async (fields = {}) => {
    const query = field(fields.station);
    if (!query) {
      return all('stationRemoveUnknown', { query });
    }
    return changeAddedStations(async (added) => {
      const number =
        /^#?\d+$/.test(query) && query.length <= 3 ? Number(query.replace('#', '')) : null;
      let found;
      if (number !== null) {
        found = config.stations[number - 1] ? [number - 1] : [];
      } else {
        const wanted = fold(query);
        found = config.stations
          .map((entry, index) => ({ entry, index, followed: entries[index] }))
          .filter(
            ({ entry, followed }) =>
              fold(entry.station) === wanted ||
              (followed &&
                (fold(followed.name) === wanted ||
                  fold(followed.station.name) === wanted ||
                  fold(followed.station.code) === wanted)),
          )
          .map(({ index }) => index);
        // The same name in the form and in the added stations: the added one.
        const fromButtons = found.filter((index) => !config.stations[index].slot);
        found = fromButtons.length > 0 ? fromButtons : found;
      }
      if (found.length === 0) {
        return { message: all('stationRemoveUnknown', { query: query.slice(0, 60) }) };
      }
      if (found.length > 1) {
        return { message: all('stationRemoveAmbiguous', { query: query.slice(0, 60) }) };
      }
      const entry = config.stations[found[0]];
      const name = entries[found[0]]?.name ?? entry.station;
      if (entry.slot) {
        return { message: all('stationInForm', { name, slot: entry.slot }) };
      }
      logger.info(`Station removed: ${name}`);
      return {
        next: added.filter((_, index) => index !== entry.added - 1),
        message: all('stationRemoved', { name }),
      };
    });
  });

  gladys.onAction(ACTIONS.LIST_STATIONS, async () => {
    if (config.stations.length === 0) {
      return all('stationsNone');
    }
    return all('stationsList', (l) => ({
      count: config.stations.length,
      list: clipLines(
        config.stations.map((entry, index) => entryText(entry, index, l)).join('\n'),
        ACTION_TEXT_MAX - 100,
      ),
    }));
  });

  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    const report = {
      version: VERSION,
      timeZone: timeZone ?? null,
      interval: config.interval,
      language: config.language,
      apiKey: config.apiKey ? `set (${config.apiKey.length} characters)` : 'missing',
      stations: followedList.map((followed) => {
        const snapshot = snapshots.get(followed.key);
        const traffic = trafficOf(followed.station.code);
        return {
          slot: followed.slot,
          added: followed.added,
          key: followed.key,
          station: followed.station.code,
          type: followed.type,
          direction: followed.direction,
          created: createdDevices.has(followed.deviceId),
          readAt: snapshot ? new Date(snapshot.readAt).toISOString() : null,
          passages: snapshot?.passages
            .slice(0, 6)
            .map(
              (p) =>
                `${trainLabel(p)}>${p.destination} ${new Date(p.scheduled).toISOString().slice(11, 16)}Z` +
                `${p.cancelled ? ' cancelled' : ` +${p.delay}`} pl.${p.platform || '?'}`,
            ),
          traffic: traffic.state,
          disruptions: traffic.current.map((entry) => entry.id),
        };
      }),
      departuresError: departuresError?.message ?? null,
      disruptionsError: disruptionsError?.message ?? null,
      notFound,
      stationList: {
        count: store.data.stations.list?.length ?? null,
        readAt: store.data.stations.readAt
          ? new Date(store.data.stations.readAt).toISOString()
          : null,
      },
      resolveError: resolveError?.message ?? null,
      requests: api.requests,
    };
    const json = JSON.stringify(report);
    const count = Math.max(1, Math.ceil(json.length / DIAGNOSTIC_CHUNK));
    for (let chunk = 0; chunk < count; chunk += 1) {
      logger.info(
        `NS diagnostic ${chunk + 1}/${count}: ${json.slice(chunk * DIAGNOSTIC_CHUNK, (chunk + 1) * DIAGNOSTIC_CHUNK)}`,
      );
    }
    return all('diagnosticDone', { count });
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await resolveConfig();
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    for (const followed of followedList) {
      await publishDepartureStates(followed);
    }
    if (disruptions.size > 0) {
      await digestDisruptions();
    }
    refreshWidgets(Object.values(WIDGETS));
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      rawConfig = raw ?? {};
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        // The form values may lack the internal keys: never forget the added
        // stations, the next button would save the list without them.
        rawConfig = {
          [INTERNAL_KEYS.addedStations]: rawConfig[INTERNAL_KEYS.addedStations],
          ...fallback,
        };
        config = normalizeConfig(rawConfig);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (raw) => {
    await loadConfig(raw);
    lastDiscovery = null;
    boards.clear();
    snapshots.clear();
    disruptions.clear();
    network = { list: null, readAt: 0 };
    departuresError = null;
    disruptionsError = null;
    logger.info('Configuration updated');
    await applyConfig();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each (re)connection resynchronizes; the promise lets the tests wait for it.
  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      await loadConfig();
      await store.load();
      await refreshCreatedDevices();
      lastStatus = null;
      lastDiscovery = null;
      await applyConfig();
    })().catch((err) => logger.error('Startup', err));
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    clearInterval(departuresTimer);
    clearInterval(disruptionsTimer);
    clearInterval(reminderTimer);
    clearTimeout(resolveTimer);
    await store.save();
  });

  return {
    store,
    api,
    readDepartures,
    disruptionsTick,
    checkReminders,
    applyConfig,
    getConfig: () => config,
    getStations: () => followedList,
    getSnapshot: (key) => snapshots.get(key),
    getTraffic: (code) => trafficOf(code),
    whenReady: () => startup,
  };
}

export {
  createApp,
  ACTIONS,
  SCENE_ACTIONS,
  IDLE_INTERVAL_MS,
  DISRUPTIONS_INTERVAL_MS,
  SNAPSHOT_MAX_AGE_MS,
};
