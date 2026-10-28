// The widget contents pass the validator of the SDK (what the core would
// drop or truncate), in every language.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent, WIDGET_COLORS } from '@gladysassistant/integration-sdk';

import {
  buildDeparturesWidget,
  buildDisruptionsWidget,
  messageContent,
  readCount,
  trainRow,
  periodText,
  BOARD_COUNT,
} from '../src/widgets.js';
import { parsePassages } from '../src/departures.js';
import { parseDisruptions, stationTraffic } from '../src/disruptions.js';
import { LANGUAGES } from '../src/i18n.js';
import { NOW, TZ, DEPARTURES, DISRUPTIONS, departure, disruption } from './helpers/fixtures.js';

const UTRECHT = parsePassages(DEPARTURES.payload.departures);

/**
 * @description Assert that the core would keep the content whole.
 * @param {object} content - The content.
 * @param {string} label - For the message.
 */
function assertValid(content, label) {
  assert.deepEqual(validateWidgetContent(content), [], label);
}

test('departures widget: one row per train, by planned time, in every language', () => {
  for (const language of LANGUAGES) {
    const content = buildDeparturesWidget({
      title: 'Utrecht Centraal',
      passages: UTRECHT,
      readAt: NOW,
      count: 6,
      language,
      now: NOW,
      timeZone: TZ,
    });
    assertValid(content, language);
    const [heading, caption, status] = content.components;
    assert.equal(heading.text, 'Utrecht Centraal');
    assert.match(caption.text, /^NS · .*09:20/);
    assert.equal(status.items.length, 6);
  }
  const { components } = buildDeparturesWidget({
    title: 'Utrecht Centraal',
    passages: UTRECHT,
    readAt: NOW,
    count: 8,
    language: 'en',
    now: NOW,
    timeZone: TZ,
  });
  // The late ICE of 09:02 first (planned order, like the boards).
  assert.deepEqual(
    components[2].items.map((item) => [item.label, item.value, item.color]),
    [
      ['09:02 ICE → Amsterdam Centraal', '+27 · pl. 14', WIDGET_COLORS.WARNING],
      ['09:24 IC → Venlo', '+8 · pl. 15 (new)', WIDGET_COLORS.WARNING],
      ['09:25 SPR → Almere Centrum', '+2 · pl. 1', WIDGET_COLORS.SUCCESS],
      ['09:27 SPR → Driebergen-Zeist', 'pl. 15', WIDGET_COLORS.SUCCESS],
      ['09:28 IC → Den Haag Centraal', 'pl. 8', WIDGET_COLORS.SUCCESS],
      ['09:29 IC → Alkmaar', 'pl. 7', WIDGET_COLORS.SUCCESS],
      ['09:30 SPR → Utrecht Maliebaan', 'pl. 2', WIDGET_COLORS.SUCCESS],
      ['09:31 IC → Rotterdam Centraal', 'pl. 5', WIDGET_COLORS.SUCCESS],
    ],
  );
});

test('departures widget: a cancelled train in red, several stations, nothing announced', () => {
  const [cancelled] = parsePassages([departure({ at: '09:45', cancelled: true })]);
  assert.deepEqual(trainRow(cancelled, { language: 'fr', timeZone: TZ }), {
    label: '09:45 IC → Zwolle',
    value: 'Supprimé',
    color: WIDGET_COLORS.DANGER,
  });
  for (const language of LANGUAGES) {
    const several = buildDeparturesWidget({
      boards: [
        { title: 'Utrecht Centraal', passages: UTRECHT, readAt: NOW },
        { title: 'Amersfoort Centraal', passages: [cancelled], readAt: NOW - 30000 },
      ],
      count: 6,
      language,
      now: NOW,
      timeZone: TZ,
    });
    assertValid(several, language);
    const items = several.components[2].items;
    assert.equal(items[0].icon, 'map-pin');
    assert.ok(items.length <= 10);
    assert.equal(several.components[0].text, 'Utrecht Centraal · Amersfoort Centraal');
    const empty = buildDeparturesWidget({
      title: 'Utrecht Centraal',
      passages: [],
      readAt: NOW,
      count: 6,
      language,
      now: NOW,
      timeZone: TZ,
    });
    assertValid(empty, language);
    assert.equal(empty.components.length, 2);
  }
});

test('disruptions widget: the state of each station and one card per disruption', () => {
  const all = parseDisruptions(DISRUPTIONS);
  for (const language of LANGUAGES) {
    const content = buildDisruptionsWidget({
      stations: [
        { name: 'Rotterdam Centraal', traffic: stationTraffic(all.slice(2, 4), NOW) },
        { name: 'Utrecht Centraal', traffic: stationTraffic([], NOW) },
      ],
      readAt: NOW,
      language,
      now: NOW,
      timeZone: TZ,
    });
    assertValid(content, language);
    const [, status, cards, caption] = content.components;
    assert.deepEqual(
      status.items.map((item) => item.color),
      [WIDGET_COLORS.INFO, WIDGET_COLORS.SUCCESS],
    );
    assert.equal(cards.items.length, 2);
    assert.match(caption.text, /^NS · /);
    const network = buildDisruptionsWidget({
      network: stationTraffic(all, NOW).current,
      readAt: NOW,
      language,
      now: NOW,
      timeZone: TZ,
    });
    assertValid(network, language);
    assert.equal(network.components[1].items.length, 5);
    const calm = buildDisruptionsWidget({
      stations: [{ name: 'Utrecht Centraal', traffic: stationTraffic([], NOW) }],
      readAt: NOW,
      language,
      now: NOW,
      timeZone: TZ,
    });
    assertValid(calm, language);
    assert.equal(calm.components.at(-1).variant, 'body');
  }
  const [card] = buildDisruptionsWidget({
    stations: [
      { name: 'Utrecht Centraal', traffic: stationTraffic(parseDisruptions([disruption()]), NOW) },
    ],
    readAt: NOW,
    language: 'en',
    now: NOW,
    timeZone: TZ,
  }).components[2].items;
  assert.deepEqual(
    [card.title, card.subtitle, card.badge.text],
    ['Utrecht - Amersfoort: fewer trains', 'Disruption · 09:00 → 11:00', 'Utrecht Centraal'],
  );
  assert.match(card.description, /^Between Utrecht Centraal/);
  // A period over several days.
  const [, buses] = all;
  assert.equal(periodText(buses, NOW, TZ, 'fr'), '05/10 04:00 → 12/10 02:00');
});

test('settings and messages', () => {
  assert.equal(readCount(undefined, BOARD_COUNT), BOARD_COUNT.default);
  assert.equal(readCount('25', BOARD_COUNT), BOARD_COUNT.max);
  assert.equal(readCount(0, BOARD_COUNT), BOARD_COUNT.min);
  assertValid(messageContent('No station is followed.'), 'message');
});
