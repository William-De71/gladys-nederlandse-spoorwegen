// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, and a
// fake gateway of NS serving real (reduced) answers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS, IDLE_INTERVAL_MS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import {
  fakeNs,
  storePath,
  silent,
  departure,
  disruption,
  NOW,
  TZ,
  KEY,
} from './helpers/fixtures.js';

const CONFIG = {
  api_key: KEY,
  station_1: 'Utrecht',
  station_1_type: 'IC',
  station_1_direction: 'Eindhoven',
  station_2: 'rtd',
  station_3: 'Nowhere',
  interval: '60',
  language: 'fr',
};
const PREFIX = 'ext:test-integration';
const UT_IC = `${PREFIX}:station:c-ut_t-ic_to-eindhoven`;
const RTD = `${PREFIX}:station:c-rtd`;
const MINUTE = 60 * 1000;

/**
 * @description The integration, connected to a fake Gladys and a fake gateway.
 * @param {object} [options] - `{ config, path, api, logger }`.
 * @returns {Promise<object>} `{ gladys, app, api, clock, path }`.
 */
async function startApp({
  config = CONFIG,
  path = storePath(),
  api = fakeNs(),
  logger = silent,
} = {}) {
  const clock = { now: NOW };
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    fetch: api,
    storePath: path,
    now: () => clock.now,
    timeZone: TZ,
    timers: false,
    logger,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, api, clock, path };
}

const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);
const widget = async (gladys, key, args) => {
  const answer = await gladys.fake.widgetGet(key, args);
  assert.equal(answer.success, true, JSON.stringify(answer));
  return answer.data.content;
};
const sceneAction = async (gladys, key, fields) => {
  const answer = await gladys.fake.sceneAction(key, fields);
  assert.equal(answer.success, true, JSON.stringify(answer));
  return answer.data.outputs;
};
const paths = (api) => api.calls.map((call) => `${call.path} ${call.params.station ?? ''}`.trim());

test('two stations become two devices; the unknown name is reported', async (t) => {
  const { gladys, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => [device.external_id, device.name]),
    [
      [UT_IC, 'NS Utrecht Centraal (IC → Eindhoven)'],
      [RTD, 'NS Rotterdam Centraal'],
    ],
  );
  const status = gladys.fake.connectionStatus;
  assert.equal(status.connected, true);
  assert.equal(
    status.message.fr,
    'Connecté à NS : 2 gare(s), lues toutes les 60 s. Inconnu ou ambigu : Nowhere.',
  );
  // The stations once, one request per station, then their disruptions.
  assert.deepEqual(paths(api), [
    '/nsapp-stations/v3',
    '/reisinformatie-api/api/v2/departures UT',
    '/reisinformatie-api/api/v2/departures RTD',
    '/disruptions/v3/station/UT',
    '/disruptions/v3/station/RTD',
  ]);
  // The first readings are a baseline: nothing fires.
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('the states of a created device: next train, waits, delay, traffic', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await created(gladys, UT_IC);
  await created(gladys, RTD);
  assert.equal(
    gladys.fake.lastState(`${UT_IC}:next`),
    'IC 3529 → Venlo · 11 min (+8 min de retard) · voie 15 (changée)',
  );
  assert.equal(gladys.fake.lastState(`${UT_IC}:wait`), 11);
  assert.equal(gladys.fake.lastState(`${UT_IC}:delay`), 8);
  assert.equal(gladys.fake.lastState(`${UT_IC}:traffic`), 'Trafic normal');
  assert.equal(gladys.fake.lastState(`${UT_IC}:disruptions`), 0);
  assert.equal(gladys.fake.lastState(`${RTD}:next`), 'Aucun train annoncé');
  assert.equal(gladys.fake.lastState(`${RTD}:disruptions`), 2);
  // Two works of the same weight: the latest one first.
  assert.equal(
    gladys.fake.lastState(`${RTD}:traffic`),
    'Travaux : Amsterdam - Schiphol - Rotterdam: adjusted international schedule',
  );
});

test('no key: nothing is read, the status says what to do', async (t) => {
  const { gladys, api } = await startApp({ config: { station_1: 'UT' } });
  t.after(() => gladys.fake.shutdown());
  assert.equal(api.calls.length, 0);
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /^Enter your NS API key/);
  assert.match(await textOf(gladys, ACTIONS.TEST_CONNECTION), /^No NS API key/);
});

test('a refused key: disconnected, told, and not retried in a loop', async (t) => {
  const api = fakeNs();
  api.state.key = 'another';
  const { gladys } = await startApp({ api });
  t.after(() => gladys.fake.shutdown());
  assert.equal(api.calls.length, 1);
  const status = gladys.fake.connectionStatus;
  assert.equal(status.connected, false);
  assert.match(status.message.de, /^NS lehnt den API-Schlüssel ab \(HTTP 401/);
  const board = await widget(gladys, WIDGETS.DEPARTURES, { settings: {}, language: 'en' });
  assert.match(board.components[0].text, /^NS refuses the API key/);
});

test('a train cancelled, delayed, moved; a disruption begins then ends', async (t) => {
  const { gladys, app, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  api.state.departures.UT = [
    ...api.state.departures.UT,
    departure({ at: '09:50', direction: 'Maastricht', via: ['Eindhoven C.'], number: '3550' }),
    departure({ at: '10:20', direction: 'Heerlen', via: ['Eindhoven C.'], number: '3560' }),
  ];
  clock.now += MINUTE;
  await app.readDepartures({ force: true });
  // New trains are not changes (only the 30 min reminder of the 09:50).
  assert.deepEqual(
    gladys.fake.sceneEvents.map((event) => event.key),
    [TRIGGERS.DEPARTURE_SOON],
  );
  api.state.departures.UT = [
    ...api.state.departures.UT.slice(0, 8),
    departure({
      at: '09:50',
      actual: '10:02',
      actualTrack: '20',
      direction: 'Maastricht',
      via: ['Eindhoven C.'],
      number: '3550',
    }),
    departure({
      at: '10:20',
      cancelled: true,
      direction: 'Heerlen',
      via: ['Eindhoven C.'],
      number: '3560',
      messages: ['This train is cancelled'],
    }),
  ];
  clock.now += MINUTE;
  await app.readDepartures({ force: true });
  const cancelled = eventsOf(gladys, TRIGGERS.DEPARTURE_CANCELLED);
  assert.equal(cancelled.length, 1);
  assert.equal(cancelled[0].data.station, UT_IC);
  assert.equal(
    cancelled[0].data.summary,
    'Le IC 3560 de 10:20 au départ de Utrecht Centraal pour Heerlen est supprimé.',
  );
  assert.deepEqual(
    eventsOf(gladys, TRIGGERS.DEPARTURE_DELAYED).map((event) => [
      event.data.train,
      event.data.minutes,
      event.data.delay_minutes,
    ]),
    [['IC 3550', '10', 12]],
  );
  assert.deepEqual(
    eventsOf(gladys, TRIGGERS.PLATFORM_CHANGED).map((event) => [
      event.data.platform,
      event.data.previous_platform,
    ]),
    [['20', '18']],
  );
  // The same reading again: nothing new.
  const count = gladys.fake.sceneEvents.length;
  clock.now += MINUTE;
  await app.readDepartures({ force: true });
  assert.equal(gladys.fake.sceneEvents.length, count);
  // A disruption at Utrecht, then its end.
  api.state.disruptions.push(disruption());
  await app.disruptionsTick();
  const started = eventsOf(gladys, TRIGGERS.DISRUPTION_STARTED);
  assert.deepEqual(
    started.map((event) => [event.data.station, event.data.kind, event.data.title]),
    [[UT_IC, 'disruption', 'Utrecht - Amersfoort: fewer trains']],
  );
  api.state.disruptions.pop();
  await app.disruptionsTick();
  assert.equal(eventsOf(gladys, TRIGGERS.DISRUPTION_ENDED).length, 1);
});

test('reminders between readings, and a restart never fires twice', async (t) => {
  const path = storePath();
  const first = await startApp({ path });
  // 09:28:40: the Venlo Intercity (09:32:25) leaves in less than 5 minutes.
  first.clock.now = NOW + 8 * MINUTE + 10000;
  await first.app.checkReminders();
  const soon = eventsOf(first.gladys, TRIGGERS.DEPARTURE_SOON);
  assert.deepEqual(
    soon.map((event) => [event.data.train, event.data.minutes, event.data.platform]),
    [['IC 3529', '5', '15']],
  );
  await first.gladys.fake.shutdown();
  const second = await startApp({ path });
  t.after(() => second.gladys.fake.shutdown());
  second.clock.now = NOW + 8 * MINUTE + 20000;
  await second.app.checkReminders();
  assert.deepEqual(eventsOf(second.gladys, TRIGGERS.DEPARTURE_SOON), []);
  // The stations are kept in /data: no new reading of the list.
  assert.ok(!second.api.calls.some((call) => call.path === '/nsapp-stations/v3'));
});

test('at night the stations are read every 10 minutes', async (t) => {
  const { gladys, app, api, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  api.state.departures.UT = [];
  api.state.departures.RTD = [];
  clock.now += MINUTE;
  await app.readDepartures({ force: true });
  const reads = () => api.calls.filter((call) => call.path.endsWith('/departures')).length;
  const before = reads();
  clock.now += 2 * MINUTE;
  await app.readDepartures();
  assert.equal(reads(), before);
  clock.now += IDLE_INTERVAL_MS;
  await app.readDepartures();
  assert.equal(reads(), before + 2);
});

test('widgets: a followed station, several, a typed one, the disruptions', async (t) => {
  const { gladys, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const content of [
      await widget(gladys, WIDGETS.DEPARTURES, { settings: {}, language }),
      await widget(gladys, WIDGETS.DEPARTURES, {
        settings: { stations: [UT_IC, RTD] },
        language,
      }),
      await widget(gladys, WIDGETS.DISRUPTIONS, { settings: {}, language }),
      await widget(gladys, WIDGETS.DISRUPTIONS, { settings: { network: true }, language }),
    ]) {
      assert.deepEqual(validateWidgetContent(content), [], language);
    }
  }
  const first = await widget(gladys, WIDGETS.DEPARTURES, { settings: {}, language: 'en' });
  assert.equal(first.components[0].text, 'Utrecht Centraal (IC → Eindhoven)');
  assert.equal(first.components[2].items.length, 1);
  const typed = await widget(gladys, WIDGETS.DEPARTURES, {
    settings: { station_name: 'Utrecht Centraal', type: 'SPR', count: 2 },
    language: 'en',
  });
  assert.equal(typed.components[0].text, 'Utrecht Centraal (SPR)');
  assert.deepEqual(
    typed.components[2].items.map((item) => item.label),
    ['09:25 SPR → Almere Centrum', '09:27 SPR → Driebergen-Zeist'],
  );
  const unknown = await widget(gladys, WIDGETS.DEPARTURES, {
    settings: { station_name: 'Nowhere' },
    language: 'fr',
  });
  assert.equal(unknown.components[0].text, 'Inconnu ou ambigu : Nowhere.');
  const network = await widget(gladys, WIDGETS.DISRUPTIONS, {
    settings: { network: true },
    language: 'en',
  });
  assert.equal(network.components[0].text, 'NS network');
  assert.equal(network.components[1].items.length, 5);
  assert.ok(api.calls.some((call) => call.path === '/disruptions/v3'));
  const mine = await widget(gladys, WIDGETS.DISRUPTIONS, {
    settings: {},
    language: 'en',
  });
  assert.deepEqual(
    mine.components[1].items.map((item) => [item.label, item.value]),
    [
      ['Utrecht Centraal', 'Normal service'],
      ['Rotterdam Centraal', 'Engineering works'],
    ],
  );
});

test('scene actions: the next trains and the disruptions of a station', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const next = await sceneAction(gladys, SCENE_ACTIONS.GET_NEXT_DEPARTURES, {
    station: UT_IC,
  });
  assert.equal(next.train, 'IC 3529');
  assert.equal(next.platform, '15');
  assert.equal(next.minutes, 11);
  const traffic = await sceneAction(gladys, SCENE_ACTIONS.GET_STATION_DISRUPTIONS, {
    station: RTD,
  });
  assert.equal(traffic.state, 'info');
  assert.equal(traffic.count, 2);
  // Empty: the first station.
  const first = await sceneAction(gladys, SCENE_ACTIONS.GET_NEXT_DEPARTURES, {});
  assert.equal(first.station_name, 'Utrecht Centraal (IC → Eindhoven)');
});

/**
 * @description The English answer of a configuration action.
 * @param {object} gladys - The fake Gladys.
 * @param {string} key - The action.
 * @param {object} [fields] - Its fields.
 * @returns {Promise<string>} The text.
 */
async function textOf(gladys, key, fields) {
  const answer = await gladys.fake.action(key, fields);
  assert.equal(answer.success, true, JSON.stringify(answer));
  return answer.data.message.en;
}

test('configuration actions: test, search, diagnostic without the key', async (t) => {
  const logs = [];
  const logger = { ...silent, info: (line) => logs.push(line) };
  const { gladys } = await startApp({ logger });
  t.after(() => gladys.fake.shutdown());
  const tested = await textOf(gladys, ACTIONS.TEST_CONNECTION);
  assert.match(
    tested,
    /^API key accepted: 31 stations known\. · Utrecht Centraal \(IC → Eindhoven\): 1 train\(s\), next IC 3529 in 11 min/,
  );
  assert.match(tested, /unknown or ambiguous: Nowhere$/);
  assert.equal(
    await textOf(gladys, ACTIONS.SEARCH_STATION, { query: 'den haag' }),
    'Stations found (name [code]):\n• Den Haag Centraal [GVC]\n• Den Haag HS [GV]',
  );
  assert.match(await textOf(gladys, ACTIONS.SEARCH_STATION, { query: 'r' }), /two letters/);
  assert.match(await textOf(gladys, ACTIONS.SEARCH_STATION, { query: 'zzz' }), /^No station/);
  assert.match(await textOf(gladys, ACTIONS.DIAGNOSTIC), /^Diagnostic written/);
  const report = logs.filter((line) => String(line).startsWith('NS diagnostic')).join('');
  assert.match(report, /"apiKey":"set \(32 characters\)"/);
  assert.ok(!report.includes(KEY), 'the key never reaches the logs');
});

test('stations added with the buttons, listed and removed', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const added = await textOf(gladys, ACTIONS.ADD_STATION, { station: 'gvc', direction: 'Leiden' });
  assert.match(added, /^Den Haag Centraal \(→ Leiden\) is followed \(3 station\(s\) in all\)/);
  assert.deepEqual(gladys.fake.config.added_stations, [
    { station: 'GVC', type: '', direction: 'Leiden' },
  ]);
  assert.ok(
    gladys.fake.discoveredDevices.some(
      (device) => device.external_id === `${PREFIX}:station:c-gvc_to-leiden`,
    ),
  );
  assert.match(
    await textOf(gladys, ACTIONS.ADD_STATION, {
      station: 'Den Haag Centraal',
      direction: 'leiden',
    }),
    /already followed/,
  );
  assert.match(await textOf(gladys, ACTIONS.ADD_STATION, { station: 'Nowhere' }), /^Unknown/);
  assert.equal(
    await textOf(gladys, ACTIONS.LIST_STATIONS),
    '4 followed station(s):\n' +
      '1. Utrecht Centraal (IC → Eindhoven) (form, station 1)\n' +
      '2. Rotterdam Centraal (form, station 2)\n' +
      '3. Nowhere (form, station 3, unknown to NS)\n' +
      '4. Den Haag Centraal (→ Leiden)',
  );
  assert.match(
    await textOf(gladys, ACTIONS.REMOVE_STATION, { station: '2' }),
    /station 2 of the form/,
  );
  assert.match(
    await textOf(gladys, ACTIONS.REMOVE_STATION, { station: '4' }),
    /no longer followed/,
  );
  assert.deepEqual(gladys.fake.config.added_stations, []);
  assert.match(await textOf(gladys, ACTIONS.REMOVE_STATION, { station: 'xyz' }), /^No followed/);
});

test('a new configuration is applied: devices and readings again', async (t) => {
  const { gladys, api } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await gladys.fake.configUpdated({ ...CONFIG, station_2: '', station_3: '', interval: '30' });
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.external_id),
    [UT_IC],
  );
  assert.match(gladys.fake.connectionStatus.message.en, /1 station\(s\), read every 30 s\.$/);
  // NS out of reach: the stations are known in /data, but the departures and
  // the disruptions fail: disconnected, with the reason.
  api.state.fail = 'network';
  await gladys.fake.configUpdated({ ...CONFIG });
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.external_id),
    [UT_IC, RTD],
  );
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /^NS cannot be reached \(ECONNREFUSED\)/);
});
