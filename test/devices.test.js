// The traps of the Gladys core that the fake Gladys does not catch
// (community feedback, thread 11005): a device is only polled with
// should_poll AND poll_frequency, every feature needs min / max / read_only /
// has_feedback, a wrong category / type pair shows no icon nor label, and a
// single invalid field rejects the whole discovery batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

import {
  stationKey,
  followedName,
  idsOf,
  keyOfExternalId,
  buildStationDevice,
  buildDepartureStates,
  buildTrafficStates,
  trafficText,
} from '../src/device.js';
import { parsePassages } from '../src/departures.js';
import { parseDisruptions, stationTraffic } from '../src/disruptions.js';
import { LANGUAGES } from '../src/i18n.js';
import {
  fakeGladys,
  NOW,
  TZ,
  DEPARTURES,
  DISRUPTIONS,
  departure,
  disruption,
} from './helpers/fixtures.js';

/**
 * @description A followed station.
 * @param {object} station - `{ code, name }`.
 * @param {string} type - The train types typed.
 * @param {string} direction - The direction typed.
 * @returns {object} The followed station.
 */
function follow(station, type, direction) {
  const entry = { station, type, direction, key: stationKey(station, type, direction) };
  return { ...entry, name: followedName(entry) };
}

const UT_IC = follow({ code: 'UT', name: 'Utrecht Centraal' }, 'IC', 'Eindhoven');
const UT = follow({ code: 'UT', name: 'Utrecht Centraal' }, '', '');
const RAW = DEPARTURES.payload.departures;

const devices = (language) => [
  buildStationDevice(fakeGladys, UT_IC, language),
  buildStationDevice(fakeGladys, UT, language),
];

// Pairs with an icon and a label in the Gladys front (front/src/utils/consts.js).
const PAIRS = [
  [DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, undefined],
  [
    DEVICE_FEATURE_CATEGORIES.DURATION,
    DEVICE_FEATURE_TYPES.DURATION.INTEGER,
    DEVICE_FEATURE_UNITS.MINUTES,
  ],
  [DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.INTEGER, undefined],
];

const values = (states) =>
  Object.fromEntries(
    states.map((s) => [s.device_feature_external_id.split(':').pop(), s.state ?? s.text]),
  );

test('devices are never polled by Gladys: the integration has its own timer', () => {
  for (const device of devices('en')) {
    assert.equal(device.should_poll, false, device.external_id);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('every feature carries min, max, read_only and has_feedback, in every language', () => {
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      for (const feature of device.features) {
        for (const key of ['min', 'max']) {
          assert.equal(typeof feature[key], 'number', `${feature.external_id}.${key}`);
        }
        assert.ok(feature.min <= feature.max, feature.external_id);
        assert.equal(feature.read_only, true, feature.external_id);
        assert.equal(feature.has_feedback, false, feature.external_id);
        assert.ok(feature.name.length > 0 && feature.name.length <= 255);
      }
      const names = new Set(device.features.map((feature) => feature.name));
      assert.equal(names.size, device.features.length, 'every feature has its own name');
    }
  }
});

test('category / type / unit pairs known to the Gladys front, from the SDK constants', () => {
  for (const feature of devices('en').flatMap((device) => device.features)) {
    assert.ok(
      PAIRS.some(
        ([category, type, unit]) =>
          feature.category === category && feature.type === type && feature.unit === unit,
      ),
      `${feature.external_id}: ${feature.category}/${feature.type}/${feature.unit}`,
    );
  }
});

test('ids from the station code, the train types and the direction; read back', () => {
  const [filtered, whole] = devices('fr');
  assert.equal(filtered.external_id, 'ext:nederlandse-spoorwegen:station:c-ut_t-ic_to-eindhoven');
  assert.equal(filtered.name, 'NS Utrecht Centraal (IC → Eindhoven)');
  assert.equal(whole.external_id, 'ext:nederlandse-spoorwegen:station:c-ut');
  assert.equal(whole.name, 'NS Utrecht Centraal');
  assert.equal(keyOfExternalId(`${filtered.external_id}:wait`), 'c-ut_t-ic_to-eindhoven');
  assert.equal(keyOfExternalId(whole.external_id), 'c-ut');
  assert.equal(keyOfExternalId('something'), null);
  // Other case or spaces in what is typed: the same device.
  assert.equal(stationKey(UT_IC.station, ' ic ', 'EINDHOVEN'), UT_IC.key);
  assert.equal(stationKey(UT.station, '', 'IC'), 'c-ut_to-ic', 'a direction is never a type');
  assert.deepEqual(
    filtered.params.map((param) => [param.name, param.value]),
    [
      ['NS_STATION', 'UT'],
      ['NS_TRAIN_TYPES', 'IC'],
      ['NS_DIRECTION', 'Eindhoven'],
    ],
  );
});

test('departure states: the next train, the two waits and the delay', () => {
  const passages = parsePassages(RAW, { type: 'IC', direction: 'Eindhoven' });
  const now = Date.parse('2026-10-06T07:20:30Z');
  const one = values(
    buildDepartureStates(fakeGladys, UT_IC, passages, { language: 'fr', now, timeZone: TZ }),
  );
  // The Venlo Intercity of 09:24, 8 min late (09:32), now from platform 15;
  // no other train: the following wait is left untouched.
  assert.deepEqual(one, {
    next: 'IC 3529 → Venlo · 11 min (+8 min de retard) · voie 15 (changée)',
    wait: 11,
    delay: 8,
  });
  const all = values(
    buildDepartureStates(fakeGladys, UT, parsePassages(RAW), {
      language: 'en',
      now: NOW,
      timeZone: TZ,
    }),
  );
  assert.deepEqual(all, {
    next: 'SPR 4928 → Almere Centrum · 6 min (+2 min late) · platform 1',
    wait: 6,
    following: 6,
    delay: 2,
  });
  // A train without real time: no delay published.
  const planned = parsePassages([departure({ actual: '' })]);
  assert.deepEqual(
    Object.keys(
      values(buildDepartureStates(fakeGladys, UT, planned, { language: 'de', now: NOW })),
    ),
    ['next', 'wait'],
  );
  // Nothing announced: the waits are left untouched.
  assert.deepEqual(
    buildDepartureStates(fakeGladys, UT, [], { language: 'es', now: NOW }).map((s) => s.text),
    ['Ningún tren anunciado'],
  );
});

test('traffic states: the worst disruption first, the count', () => {
  const all = stationTraffic(parseDisruptions(DISRUPTIONS), NOW);
  assert.deepEqual(values(buildTrafficStates(fakeGladys, UT, all, 'fr')), {
    // Two disruptions of the same weight: the latest one first.
    traffic: 'Trafic perturbé : Sittard - Heerlen: restrictions lifted',
    disruptions: 5,
  });
  const quiet = stationTraffic([], NOW);
  assert.deepEqual(values(buildTrafficStates(fakeGladys, UT, quiet, 'en')), {
    traffic: 'Normal service',
    disruptions: 0,
  });
  const severe = stationTraffic(parseDisruptions([disruption({ impact: { value: 4 } })]), NOW);
  assert.equal(trafficText(severe, 'de'), 'Große Störung: Utrecht - Amersfoort: fewer trains');
  assert.equal(trafficText(stationTraffic(null, NOW), 'es'), 'Sin información');
});

test('the discovery batch and the states pass the checks of the fake host API', async (t) => {
  const gladys = createFakeGladys({});
  t.after(() => gladys.fake.shutdown());
  await gladys.connect();
  for (const language of LANGUAGES) {
    await gladys.publishDiscoveredDevices([
      buildStationDevice(gladys, UT_IC, language),
      buildStationDevice(gladys, UT, language),
    ]);
  }
  const [device] = gladys.fake.discoveredDevices;
  await gladys.fake.deviceCreated(device);
  await gladys.publishStates(
    buildDepartureStates(gladys, UT, parsePassages(RAW), { language: 'en', now: NOW }),
  );
  await gladys.publishStates(
    buildTrafficStates(gladys, UT_IC, stationTraffic(parseDisruptions(DISRUPTIONS), NOW), 'en'),
  );
  assert.equal(idsOf(gladys, UT_IC.key).device, device.external_id);
  assert.equal(gladys.fake.lastState(`${device.external_id}:disruptions`), 5);
});
