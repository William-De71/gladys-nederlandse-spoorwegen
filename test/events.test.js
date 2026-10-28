// Scene triggers: one event per transition, a baseline on the first reading,
// flat payloads within the limits of the core; scene action outputs.

import { test } from 'node:test';
import assert from 'node:assert/strict';

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
  tolerance,
  REMINDER_MINUTES,
  NEXT_DEPARTURES_OUTPUTS,
  STATION_DISRUPTIONS_OUTPUTS,
} from '../src/events.js';
import { parsePassages } from '../src/departures.js';
import { parseDisruptions, stationTraffic } from '../src/disruptions.js';
import { LANGUAGES } from '../src/i18n.js';
import { NOW, TZ, DEPARTURES, departure, disruption } from './helpers/fixtures.js';

const MINUTE = 60 * 1000;
const FOLLOWED = {
  key: 'c-ut',
  name: 'Utrecht Centraal',
  deviceId: 'ext:nederlandse-spoorwegen:station:c-ut',
  station: { code: 'UT', name: 'Utrecht Centraal' },
};

/**
 * @description Assert that a payload holds what the core accepts.
 * @param {object} data - The payload.
 */
function assertFlat(data) {
  assert.ok(Object.keys(data).length <= 30);
  for (const [key, value] of Object.entries(data)) {
    assert.ok(
      value === null ||
        ['boolean'].includes(typeof value) ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.length <= 1000),
      key,
    );
  }
}

test('reminders: once per train and mark, near the mark, after a baseline', () => {
  const passages = parsePassages([departure({ at: '09:30' })]);
  // 09:20:30: the 09:30 train leaves in 9.5 min.
  const first = detectReminders({ passages, fired: undefined, now: NOW });
  assert.deepEqual(first.due, [], 'the first reading is a baseline');
  assert.equal(first.fired.length, 1);
  const quiet = detectReminders({ passages, fired: first.fired, now: NOW + 10000 });
  assert.deepEqual(quiet.due, []);
  // 09:25:10: 4.8 min left, the 5 min mark.
  const five = detectReminders({ passages, fired: quiet.fired, now: NOW + 4 * MINUTE + 40000 });
  assert.deepEqual(
    five.due.map(({ mark }) => mark),
    [5],
  );
  const again = detectReminders({ passages, fired: five.fired, now: NOW + 5 * MINUTE });
  assert.deepEqual(again.due, []);
  // The marks never overlap.
  for (const [index, mark] of REMINDER_MINUTES.entries()) {
    if (index > 0) {
      assert.ok(mark - tolerance(mark) >= REMINDER_MINUTES[index - 1], `${mark}`);
    }
  }
});

test('trains: a cancellation, a delay mark, a platform change, once each', () => {
  const known = detectTrainChanges({
    passages: parsePassages([
      departure({ at: '09:40' }),
      departure({ at: '10:10', number: '3542' }),
    ]),
    known: undefined,
    now: NOW,
  });
  assert.deepEqual([known.cancelled, known.delayed, known.platforms], [[], [], []]);
  // The 09:40 is 6 min late and moved to platform 19; the 10:10 is cancelled.
  const changed = detectTrainChanges({
    passages: parsePassages([
      departure({ at: '09:40', actual: '09:46', actualTrack: '19' }),
      departure({ at: '10:10', number: '3542', cancelled: true, messages: ['Cancelled'] }),
    ]),
    known: known.known,
    now: NOW + MINUTE,
  });
  assert.deepEqual(
    changed.cancelled.map((p) => p.number),
    ['3542'],
  );
  assert.deepEqual(
    changed.delayed.map(({ passage, mark }) => [passage.number, mark]),
    [['3540', 5]],
  );
  assert.deepEqual(
    changed.platforms.map((p) => [p.platform, p.previousPlatform]),
    [['19', '18']],
  );
  // The same reading again: nothing new. A delay growing to 17 min: mark 15.
  const same = detectTrainChanges({
    passages: parsePassages([
      departure({ at: '09:40', actual: '09:57', actualTrack: '19' }),
      departure({ at: '10:10', number: '3542', cancelled: true }),
    ]),
    known: changed.known,
    now: NOW + 2 * MINUTE,
  });
  assert.deepEqual(same.cancelled, []);
  assert.deepEqual(same.platforms, []);
  assert.deepEqual(
    same.delayed.map(({ mark }) => mark),
    [15],
  );
  // A train first seen already 20 min late on a new platform, after the
  // baseline: one event each, with the highest mark.
  const late = detectTrainChanges({
    passages: parsePassages([
      departure({ at: '09:50', actual: '10:10', number: '9', track: '5', actualTrack: '7' }),
    ]),
    known: same.known,
    now: NOW + 3 * MINUTE,
  });
  assert.deepEqual(
    late.delayed.map(({ mark }) => mark),
    [15],
  );
  assert.equal(late.platforms.length, 1);
  // Trains beyond two hours are not watched.
  const far = detectTrainChanges({
    passages: parsePassages([departure({ at: '12:00', cancelled: true, number: '11' })]),
    known: late.known,
    now: NOW,
  });
  assert.deepEqual(far.cancelled, []);
});

test('disruptions: started and ended, a baseline first, a short absence is quiet', () => {
  const traffic = (list, now = NOW) => stationTraffic(parseDisruptions(list), now);
  const base = detectDisruptionChanges({ traffic: traffic([disruption()]), now: NOW });
  assert.deepEqual([base.started, base.ended], [[], []]);
  const works = disruption({ id: '8', type: 'MAINTENANCE', impact: { value: 2 } });
  const added = detectDisruptionChanges({
    traffic: traffic([disruption(), works]),
    seen: base.seen,
    now: NOW + MINUTE,
  });
  assert.deepEqual(
    added.started.map((entry) => entry.id),
    ['maintenance:8'],
  );
  const over = detectDisruptionChanges({
    traffic: traffic([works]),
    seen: added.seen,
    now: NOW + 2 * MINUTE,
  });
  assert.deepEqual(
    over.ended.map((entry) => [entry.id, entry.kind, entry.title]),
    [['disruption:7100001', 'disruption', 'Utrecht - Amersfoort: fewer trains']],
  );
  // It comes back a minute later: not a new disruption.
  const back = detectDisruptionChanges({
    traffic: traffic([disruption(), works]),
    seen: over.seen,
    now: NOW + 3 * MINUTE,
  });
  assert.deepEqual(back.started, []);
});

test('payloads: flat, with a summary in every language', () => {
  const [late] = parsePassages([departure({ at: '09:40', actual: '09:52', actualTrack: '19' })]);
  const [cancelled] = parsePassages([departure({ cancelled: true, messages: ['Cancelled'] })]);
  const [started] = parseDisruptions([disruption()]);
  for (const language of LANGUAGES) {
    const options = { language, timeZone: TZ, now: NOW };
    const payloads = [
      reminderData(FOLLOWED, late, 5, options),
      cancelledData(FOLLOWED, cancelled, options),
      delayedData(FOLLOWED, late, 10, options),
      platformData(FOLLOWED, { ...late, previousPlatform: '18' }, options),
      startedData(FOLLOWED, started, options),
      endedData(FOLLOWED, { kind: 'maintenance', title: 'Alkmaar - Hoorn' }, options),
    ];
    payloads.forEach(assertFlat);
    payloads.forEach((data) => assert.ok(data.summary.length > 10, language));
    assert.equal(payloads[0].station, FOLLOWED.deviceId);
  }
  const options = { language: 'en', timeZone: TZ, now: NOW };
  assert.deepEqual(reminderData(FOLLOWED, late, 5, options), {
    station: FOLLOWED.deviceId,
    station_name: 'Utrecht Centraal',
    train: 'IC 3540',
    type: 'IC',
    destination: 'Zwolle',
    time: '09:52',
    platform: '19',
    minutes: '5',
    delay_minutes: 12,
    summary:
      'IC 3540 to Zwolle leaves Utrecht Centraal in 5 min (09:52, 12 min late, platform 19).',
  });
  assert.equal(
    delayedData(FOLLOWED, late, 10, { language: 'fr', timeZone: TZ }).summary,
    'Le IC 3540 de 09:40 au départ de Utrecht Centraal pour Zwolle a 12 min de retard : départ à 09:52.',
  );
  assert.equal(
    platformData(FOLLOWED, { ...late, previousPlatform: '18' }, options).summary,
    'The 09:52 IC 3540 from Utrecht Centraal to Zwolle now leaves from platform 19 (instead of 18).',
  );
  assert.deepEqual(cancelledData(FOLLOWED, cancelled, options), {
    station: FOLLOWED.deviceId,
    station_name: 'Utrecht Centraal',
    train: 'IC 3540',
    type: 'IC',
    destination: 'Zwolle',
    time: '09:40',
    platform: '18',
    message: 'Cancelled',
    summary: 'The 09:40 IC 3540 from Utrecht Centraal to Zwolle is cancelled.',
  });
  const data = startedData(FOLLOWED, started, options);
  assert.equal(data.kind, 'disruption');
  assert.equal(data.cause, 'signal failure');
  assert.equal(data.end, '11:00');
  assert.equal(data.summary, 'Disruption at Utrecht Centraal: Utrecht - Amersfoort: fewer trains.');
});

test('scene action outputs: only the declared keys', () => {
  const passages = parsePassages(DEPARTURES.payload.departures);
  const next = pick(
    nextDeparturesOutputs({ followed: FOLLOWED, passages, now: NOW, language: 'en', timeZone: TZ }),
    NEXT_DEPARTURES_OUTPUTS,
  );
  assert.deepEqual(next, {
    station_name: 'Utrecht Centraal',
    found: true,
    train: 'SPR 4928',
    destination: 'Almere Centrum',
    minutes: 6,
    time: '09:27',
    platform: '1',
    delay_minutes: 2,
    following_minutes: 6,
    summary:
      'Next train from Utrecht Centraal: SPR 4928 to Almere Centrum in 6 min, platform 1. The following one in 6 min.',
  });
  const none = nextDeparturesOutputs({
    followed: FOLLOWED,
    passages: [],
    now: NOW,
    language: 'de',
  });
  assert.equal(none.found, false);
  assert.equal(none.minutes, -1);
  assert.equal(none.summary, 'Kein Zug ab Utrecht Centraal angekündigt.');
  const traffic = stationTraffic(parseDisruptions([disruption()]), NOW);
  assert.deepEqual(
    pick(
      stationDisruptionsOutputs({ followed: FOLLOWED, traffic, language: 'es' }),
      STATION_DISRUPTIONS_OUTPUTS,
    ),
    {
      station_name: 'Utrecht Centraal',
      state: 'disrupted',
      state_label: 'Servicio alterado',
      disrupted: true,
      count: 1,
      title: 'Utrecht - Amersfoort: fewer trains',
      message:
        'Between Utrecht Centraal and Amersfoort Centraal fewer trains run. Allow for extra travel time. Expect disruptions until around 11:00.',
      summary: 'Utrecht Centraal: Servicio alterado. Utrecht - Amersfoort: fewer trains.',
    },
  );
  const calm = stationDisruptionsOutputs({
    followed: FOLLOWED,
    traffic: stationTraffic([], NOW),
    language: 'fr',
  });
  assert.equal(calm.summary, 'Utrecht Centraal : Trafic normal.');
  assert.equal(calm.disrupted, false);
});
