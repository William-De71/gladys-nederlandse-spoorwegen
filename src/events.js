// -----------------------------------------------------------------------------
// Scene triggers (pure logic) and scene action outputs.
//
// Triggers (one event per transition, never a periodic snapshot):
//   - `departure_soon`       a train of a followed station leaves in N minutes
//                            (2, 5, 10, 15, 20 or 30), counted on its real-time
//                            estimate: checked on each reading and every 30
//                            seconds on the last one, fired close to the mark,
//                            once per train;
//   - `departure_cancelled`  a train of a followed station leaving in the next
//                            two hours is cancelled, once per train;
//   - `departure_delayed`    the delay of a train of a followed station
//                            leaving in the next two hours reaches 5, 10, 15
//                            or 30 minutes: the highest mark reached, once per
//                            mark (a delay growing from 5 to 20 fires 5, then
//                            15);
//   - `platform_changed`     a train of a followed station leaving in the next
//                            two hours leaves from another platform, once per
//                            new platform;
//   - `disruption_started`   a disruption, works or a calamity about a
//                            followed station begins (or is published);
//   - `disruption_ended`     it is over.
//
// What was seen is kept in /data (`seen`): a restart never fires the same
// event twice, and the first reading of a station is a baseline (no event
// replays what was already there). A scene action or a widget never fires an
// event.
// -----------------------------------------------------------------------------

import { t, passageWhen, trainLabel, stateText, kindText } from './i18n.js';
import { minutesLeft, upcomingPassages, cancelledPassages } from './departures.js';
import { SERIOUS, headline } from './disruptions.js';
import { formatTime, dateText } from './time.js';

const TRIGGERS = {
  DEPARTURE_SOON: 'departure_soon',
  DEPARTURE_CANCELLED: 'departure_cancelled',
  DEPARTURE_DELAYED: 'departure_delayed',
  PLATFORM_CHANGED: 'platform_changed',
  DISRUPTION_STARTED: 'disruption_started',
  DISRUPTION_ENDED: 'disruption_ended',
};
const REMINDER_MINUTES = [2, 5, 10, 15, 20, 30];
const DELAY_MARKS = [5, 10, 15, 30];
const REMINDER_KEEP_MS = 10 * 60 * 1000;
// Cancellations, delays and platform changes are reported for trains leaving
// within this time.
const WATCH_HORIZON_MS = 2 * 60 * 60 * 1000;
const TRAIN_KEEP_MS = 4 * 60 * 60 * 1000;
// A disruption seen is remembered this long after it disappeared: one the API
// drops for a moment must not fire again.
const DISRUPTION_KEEP_MS = 3 * 24 * 3600 * 1000;
const MAX_DISRUPTIONS_PER_READING = 5;
const SUMMARY_MAX = 1000;
const MESSAGE_MAX = 1000;
const OUTPUT_MAX = 10000;
const NEXT_DEPARTURES_OUTPUTS = [
  'station_name',
  'found',
  'train',
  'destination',
  'minutes',
  'time',
  'platform',
  'delay_minutes',
  'following_minutes',
  'summary',
];
const STATION_DISRUPTIONS_OUTPUTS = [
  'station_name',
  'state',
  'state_label',
  'disrupted',
  'count',
  'title',
  'message',
  'summary',
];

/**
 * @description Truncate a text, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description How close to a mark a reminder may fire (minutes before it).
 * @param {number} mark - The mark (minutes).
 * @returns {number} The tolerance: the marks never overlap.
 */
function tolerance(mark) {
  if (mark <= 2) {
    return 1;
  }
  return mark <= 5 ? 2 : 3;
}

/**
 * @description The reminders due on the passages of a station.
 * @param {object} options - Options.
 * @param {object[]} options.passages - The passages of the station.
 * @param {object[]} [options.fired] - The reminders already fired `[{ trip, mark, at }]`,
 * undefined before the first reading of the station: a baseline, the
 * reminders already due are remembered without firing.
 * @param {number} options.now - Now (ms).
 * @returns {{ due: Array<{ passage: object, mark: number }>, fired: object[] }}
 * The reminders to fire and the memory to keep.
 */
function detectReminders({ passages, fired, now }) {
  const baseline = !Array.isArray(fired);
  const memory = (fired ?? []).filter((entry) => entry.at > now - REMINDER_KEEP_MS);
  const due = [];
  for (const passage of upcomingPassages(passages, now)) {
    const left = (passage.at - now) / 60000;
    for (const mark of REMINDER_MINUTES) {
      if (left > mark || left <= mark - tolerance(mark)) {
        continue;
      }
      if (!memory.some((entry) => entry.mark === mark && entry.trip === passage.trip)) {
        memory.push({ trip: passage.trip, mark, at: passage.at });
        if (!baseline) {
          due.push({ passage, mark });
        }
      }
    }
  }
  return { due, fired: memory };
}

/**
 * @description The trains of the next two hours, cancelled ones included.
 * @param {object[]} passages - The passages.
 * @param {number} now - Now (ms).
 * @returns {object[]} The passages watched.
 */
const watched = (passages, now) =>
  [...upcomingPassages(passages, now), ...cancelledPassages(passages, now)].filter(
    (passage) => passage.scheduled - now <= WATCH_HORIZON_MS,
  );

/**
 * @description What changed on the trains of a station: cancellations, delay
 * marks reached, platform changes.
 * @param {object} options - Options.
 * @param {object[]} options.passages - The passages of the station.
 * @param {object} [options.known] - `{ trains: { [trip]: { at, cancelled,
 * mark, platform } } }`, undefined before the first reading: a baseline.
 * @param {number} options.now - Now (ms).
 * @returns {{ cancelled: object[], delayed: Array<{ passage, mark }>,
 * platforms: object[], known: object }} The events due and the memory to keep.
 */
function detectTrainChanges({ passages, known, now }) {
  const baseline = !known || typeof known !== 'object';
  const trains = {};
  for (const [trip, entry] of Object.entries(known?.trains ?? {})) {
    if (entry && entry.at > now - TRAIN_KEEP_MS) {
      trains[trip] = entry;
    }
  }
  const result = { cancelled: [], delayed: [], platforms: [] };
  for (const passage of watched(passages, now)) {
    const before = trains[passage.trip];
    const mark = DELAY_MARKS.filter((value) => passage.delay >= value).pop() ?? 0;
    const entry = {
      at: passage.scheduled,
      cancelled: passage.cancelled || Boolean(before?.cancelled),
      mark: Math.max(mark, before?.mark ?? 0),
      platform: passage.platform || before?.platform || '',
    };
    trains[passage.trip] = entry;
    if (baseline) {
      continue;
    }
    if (passage.cancelled && !before?.cancelled) {
      result.cancelled.push(passage);
      continue;
    }
    if (passage.cancelled) {
      continue;
    }
    if (mark > (before?.mark ?? 0)) {
      result.delayed.push({ passage, mark });
    }
    // A change against what was announced: the planned platform the first
    // time, the last one seen after.
    const reference = before?.platform || passage.plannedPlatform;
    if (passage.platform && reference && passage.platform !== reference) {
      result.platforms.push({ ...passage, previousPlatform: reference });
    }
  }
  return { ...result, known: { trains } };
}

/**
 * @description What changed in the disruptions of a station.
 * @param {object} options - Options.
 * @param {object} options.traffic - stationTraffic().
 * @param {object} [options.seen] - `{ current: { [id]: entry }, gone: { [id]: at } }`,
 * undefined before the first reading: a baseline.
 * @param {number} options.now - Now (ms).
 * @returns {{ started: object[], ended: object[], seen: object }} The
 * disruptions begun and over, and the memory to keep.
 */
function detectDisruptionChanges({ traffic, seen, now }) {
  const baseline = !seen || typeof seen !== 'object';
  const before = seen?.current ?? {};
  const gone = {};
  for (const [id, at] of Object.entries(seen?.gone ?? {})) {
    if (at > now - DISRUPTION_KEEP_MS) {
      gone[id] = at;
    }
  }
  const current = {};
  for (const disruption of traffic.current) {
    current[disruption.id] = {
      kind: disruption.kind,
      state: disruption.state,
      title: headline(disruption),
    };
  }
  const started = baseline
    ? []
    : traffic.current
        .filter((disruption) => !before[disruption.id] && !gone[disruption.id])
        .slice(0, MAX_DISRUPTIONS_PER_READING);
  const ended = [];
  for (const [id, entry] of Object.entries(before)) {
    if (!current[id]) {
      gone[id] = now;
      ended.push({ id, ...entry });
    }
  }
  // One that comes back after a short absence is under way again, quietly.
  for (const id of Object.keys(current)) {
    delete gone[id];
  }
  return { started, ended: ended.slice(0, MAX_DISRUPTIONS_PER_READING), seen: { current, gone } };
}

// --- Payloads ------------------------------------------------------------------------

/**
 * @description The variables shared by the train events.
 * @param {object} followed - The followed station (`name`, `deviceId`).
 * @param {object} passage - The passage.
 * @param {string} [timeZone] - IANA timezone.
 * @returns {object} Flat scalars.
 */
const trainBase = (followed, passage, timeZone) => ({
  station: followed.deviceId,
  station_name: followed.name,
  train: trainLabel(passage),
  type: passage.category,
  destination: passage.destination,
  time: formatTime(passage.cancelled ? passage.scheduled : passage.at, timeZone),
  platform: passage.platform,
});

/**
 * @description The data of a `departure_soon` event.
 * @param {object} followed - The followed station.
 * @param {object} passage - The passage.
 * @param {number} mark - The minutes of the reminder.
 * @param {object} options - `{ language, timeZone }`.
 * @returns {object} Flat scalars.
 */
function reminderData(followed, passage, mark, { language, timeZone }) {
  const base = trainBase(followed, passage, timeZone);
  return {
    ...base,
    minutes: String(mark),
    delay_minutes: Math.max(0, passage.delay),
    summary: clip(
      t(passage.delay > 0 ? 'summarySoonLate' : 'summarySoon', language, {
        train: base.train,
        destination: passage.destination,
        station: followed.station.name,
        minutes: mark,
        time: base.time,
        delay: passage.delay,
        platform: passage.platform || '?',
      }),
      SUMMARY_MAX,
    ),
  };
}

/**
 * @description The data of a `departure_cancelled` event.
 * @param {object} followed - The followed station.
 * @param {object} passage - The cancelled passage.
 * @param {object} options - `{ language, timeZone }`.
 * @returns {object} Flat scalars.
 */
function cancelledData(followed, passage, { language, timeZone }) {
  const base = trainBase(followed, passage, timeZone);
  return {
    ...base,
    message: clip(passage.messages.join(' '), MESSAGE_MAX),
    summary: clip(
      t('summaryCancelled', language, {
        train: base.train,
        destination: passage.destination,
        station: followed.station.name,
        time: base.time,
      }),
      SUMMARY_MAX,
    ),
  };
}

/**
 * @description The data of a `departure_delayed` event.
 * @param {object} followed - The followed station.
 * @param {object} passage - The late passage.
 * @param {number} mark - The mark reached (minutes).
 * @param {object} options - `{ language, timeZone }`.
 * @returns {object} Flat scalars.
 */
function delayedData(followed, passage, mark, { language, timeZone }) {
  const base = trainBase(followed, passage, timeZone);
  const planned = formatTime(passage.scheduled, timeZone);
  return {
    ...base,
    minutes: String(mark),
    delay_minutes: passage.delay,
    planned_time: planned,
    summary: clip(
      t('summaryDelayed', language, {
        train: base.train,
        destination: passage.destination,
        station: followed.station.name,
        planned,
        time: base.time,
        delay: passage.delay,
      }),
      SUMMARY_MAX,
    ),
  };
}

/**
 * @description The data of a `platform_changed` event.
 * @param {object} followed - The followed station.
 * @param {object} passage - The passage, with `previousPlatform`.
 * @param {object} options - `{ language, timeZone }`.
 * @returns {object} Flat scalars.
 */
function platformData(followed, passage, { language, timeZone }) {
  const base = trainBase(followed, passage, timeZone);
  return {
    ...base,
    previous_platform: passage.previousPlatform,
    summary: clip(
      t('summaryPlatform', language, {
        train: base.train,
        destination: passage.destination,
        station: followed.station.name,
        time: base.time,
        platform: passage.platform,
        previous: passage.previousPlatform,
      }),
      SUMMARY_MAX,
    ),
  };
}

/**
 * @description The data of a `disruption_started` event.
 * @param {object} followed - The followed station.
 * @param {object} disruption - The disruption.
 * @param {object} options - `{ language, timeZone, now }`.
 * @returns {object} Flat scalars.
 */
function startedData(followed, disruption, { language, timeZone, now }) {
  const title = headline(disruption);
  return {
    station: followed.deviceId,
    station_name: followed.name,
    kind: disruption.kind,
    title: clip(title, 300),
    message: clip(disruption.text, MESSAGE_MAX),
    cause: disruption.cause,
    end: dateText(disruption.end, now, timeZone),
    summary: clip(
      t(SERIOUS.includes(disruption.state) ? 'summaryDisrupted' : 'summaryWorks', language, {
        station: followed.station.name,
        kind: kindText(disruption.kind, language),
        title,
      }),
      SUMMARY_MAX,
    ),
  };
}

/**
 * @description The data of a `disruption_ended` event.
 * @param {object} followed - The followed station.
 * @param {object} entry - What was kept of the disruption (`kind`, `title`).
 * @param {object} options - `{ language }`.
 * @returns {object} Flat scalars.
 */
function endedData(followed, entry, { language }) {
  return {
    station: followed.deviceId,
    station_name: followed.name,
    kind: entry.kind,
    title: clip(entry.title, 300),
    summary: clip(
      t('summaryEnded', language, {
        station: followed.station.name,
        kind: kindText(entry.kind, language),
        title: entry.title,
      }),
      SUMMARY_MAX,
    ),
  };
}

// --- Scene action outputs ------------------------------------------------------------

/**
 * @description The outputs of `get_next_departures`.
 * @param {object} options - Options.
 * @param {object} options.followed - The followed station.
 * @param {object[]} options.passages - Its passages.
 * @param {number} options.now - Now (ms).
 * @param {string} options.language - Language of the summary.
 * @param {string} [options.timeZone] - IANA timezone.
 * @returns {object} The outputs.
 */
function nextDeparturesOutputs({ followed, passages, now, language, timeZone }) {
  const [first, second] = upcomingPassages(passages, now);
  const outputs = {
    station_name: followed.name,
    found: Boolean(first),
    train: first ? trainLabel(first) : '',
    destination: first?.destination ?? '',
    minutes: first ? minutesLeft(first, now) : -1,
    time: first ? formatTime(first.at, timeZone) : '',
    platform: first?.platform ?? '',
    delay_minutes: first ? Math.max(0, first.delay) : 0,
    following_minutes: second ? minutesLeft(second, now) : -1,
  };
  let summary;
  if (first) {
    summary = t('outputNext', language, {
      station: followed.station.name,
      train: trainLabel(first),
      destination: first.destination,
      when: passageWhen(first, { language, now, timeZone }),
      platform: first.platform || '?',
    });
    if (second) {
      summary += ` ${t('outputFollowing', language, { when: passageWhen(second, { language, now, timeZone }) })}`;
    }
  } else {
    summary = t('outputNone', language, { station: followed.station.name });
  }
  return { ...outputs, summary: clip(summary, OUTPUT_MAX) };
}

/**
 * @description The outputs of `get_station_disruptions`.
 * @param {object} options - `{ followed, traffic, language }`.
 * @returns {object} The outputs.
 */
function stationDisruptionsOutputs({ followed, traffic, language }) {
  const [first] = traffic.current;
  const label = stateText(traffic.state, language);
  const title = first ? headline(first) : '';
  const summary = first
    ? t('summaryStationState', language, { station: followed.station.name, state: label, title })
    : t('summaryStationStateOnly', language, { station: followed.station.name, state: label });
  return {
    station_name: followed.name,
    state: traffic.state,
    state_label: label,
    disrupted: SERIOUS.includes(traffic.state),
    count: traffic.current.length,
    title: clip(title, 300),
    message: clip(first?.text ?? '', OUTPUT_MAX),
    summary: clip(summary, OUTPUT_MAX),
  };
}

/**
 * @description Keep only the declared outputs.
 * @param {object} outputs - The outputs.
 * @param {string[]} keys - The declared keys.
 * @returns {object} The outputs.
 */
const pick = (outputs, keys) => Object.fromEntries(keys.map((key) => [key, outputs[key]]));

export {
  TRIGGERS,
  REMINDER_MINUTES,
  DELAY_MARKS,
  WATCH_HORIZON_MS,
  NEXT_DEPARTURES_OUTPUTS,
  STATION_DISRUPTIONS_OUTPUTS,
  tolerance,
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
};
