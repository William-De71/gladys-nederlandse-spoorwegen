// -----------------------------------------------------------------------------
// Dashboard widgets of the Nederlandse Spoorwegen integration.
//
//   - `departures`   the next trains of a station, like the departure boards:
//                    one row per train — time, type and destination, then
//                    the delay and the platform ("+8 · pl. 15") —, orange
//                    when late or moved to another platform, red when
//                    cancelled. A followed station (chosen among the
//                    devices), several (the devices of one station merged, a
//                    row per station otherwise), or any station typed in the
//                    widget settings;
//   - `disruptions`  the state of the followed stations — normal, works,
//                    disrupted, major disruption — then the disruptions and
//                    works under way and coming; a tap opens the full text.
//                    Without a followed station, the disruptions of the whole
//                    network.
// Every content credits NS and the time of the reading.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t, stateText, kindText, trainLabel } from './i18n.js';
import { upcomingPassages, cancelledPassages } from './departures.js';
import { rank, headline } from './disruptions.js';
import { formatTime, dateText } from './time.js';

const WIDGETS = {
  DEPARTURES: 'departures',
  DISRUPTIONS: 'disruptions',
};

const TTL_SECONDS = {
  departures: 60,
  idle: 300,
  disruptions: 180,
  message: 300,
};

const BOARD_COUNT = { min: 1, max: 10, default: 6 };
const MAX_LIST_ITEMS = 8;
const MAX_STATUS_ITEMS = 10;
const STATE_COLORS = {
  unknown: WIDGET_COLORS.NEUTRAL,
  normal: WIDGET_COLORS.SUCCESS,
  info: WIDGET_COLORS.INFO,
  disrupted: WIDGET_COLORS.WARNING,
  major: WIDGET_COLORS.DANGER,
};
// A train this late colours its row.
const LATE_MINUTES = 5;
// Cancelled trains shown when due within this time.
const CANCELLED_SHOWN_MS = 60 * 60 * 1000;

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('Amsterdam Centraal', 12); // -> 'Amsterdam C…'
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description Read a bounded integer setting.
 * @param {unknown} raw - The raw setting.
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 */
function readCount(raw, bounds) {
  const value = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL_SECONDS.message) {
  return { ttl_seconds: ttl, components: [{ type: 'text', variant: 'body', text: message }] };
}

/**
 * @description The row of one train: "09:24 IC → Venlo", "+8 · pl. 15".
 * @param {object} passage - The passage.
 * @param {object} options - `{ language, timeZone }`.
 * @returns {object} The status item.
 */
function trainRow(passage, { language, timeZone }) {
  const time = formatTime(passage.scheduled, timeZone);
  const label = clip(`${time} ${passage.line} → ${passage.destination}`, 40);
  const platform = passage.platform
    ? t(passage.platformChanged ? 'platformChangedShort' : 'platformShort', language, {
        platform: passage.platform,
      })
    : '';
  if (passage.cancelled) {
    return { label, value: t('cancelledShort', language), color: WIDGET_COLORS.DANGER };
  }
  // On time, the green dot says it: the value keeps the platform.
  const delay =
    passage.realtime && passage.delay > 0
      ? t('delayShort', language, { delay: passage.delay })
      : '';
  const late = passage.delay >= LATE_MINUTES || passage.platformChanged;
  return {
    label,
    value: clip([delay, platform].filter(Boolean).join(' · ') || t('onTimeShort', language), 40),
    color: late ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
  };
}

/**
 * @description The "departures" widget: the station, then one row per train,
 * like the departure boards. With several stations (`boards`), still one
 * heading and one list (the content budget of the core allows one status
 * list and two texts): each station opens with a row of its own — its name
 * and the time of its reading —, then its trains.
 * @param {object} options - Options.
 * @param {string} [options.title] - The name of the station.
 * @param {object[]} [options.passages] - Its passages.
 * @param {number} [options.readAt] - When they were read (ms).
 * @param {object[]} [options.boards] - Several stations instead:
 * `[{ title, label, passages, readAt }]`, `label` the short name of the station.
 * @param {number} options.count - How many trains to show per station.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now (ms).
 * @param {string} [options.timeZone] - IANA timezone.
 * @returns {object} The content.
 */
function buildDeparturesWidget({
  title,
  passages,
  readAt,
  boards = [{ title, passages, readAt }],
  count,
  language,
  now,
  timeZone,
}) {
  const options = { language, now, timeZone };
  // A station takes a row of its own and at least one train.
  const shown = boards.slice(0, Math.floor(MAX_STATUS_ITEMS / 2));
  const several = shown.length > 1;
  const nameOf = (board) => board.label ?? board.title;
  const headingText = several ? [...new Set(shown.map(nameOf))].join(' · ') : shown[0].title;
  const heading = { type: 'text', variant: 'heading', text: clip(headingText, 40) };
  // The oldest reading: the widget never claims fresher data than it shows.
  const oldest = Math.min(...shown.map((board) => board.readAt));
  const updated = t('updatedAt', language, { time: formatTime(oldest, timeZone) });
  const upcomingOf = (board) => upcomingPassages(board.passages, now);
  // The trains, with the ones cancelled in the next hour.
  const rowsOf = (board) =>
    [
      ...upcomingOf(board),
      ...cancelledPassages(board.passages, now).filter(
        (passage) => passage.scheduled - now <= CANCELLED_SHOWN_MS,
      ),
    ].sort((a, b) => a.scheduled - b.scheduled);
  if (shown.every((board) => upcomingOf(board).length === 0)) {
    return {
      ttl_seconds: TTL_SECONDS.idle,
      components: [
        heading,
        { type: 'text', variant: 'body', text: `${t('noPassage', language)}. ${updated}.` },
      ],
    };
  }
  // The trains of each station share what the station rows leave of the list.
  const perStation = several
    ? Math.max(1, Math.min(count, Math.floor((MAX_STATUS_ITEMS - shown.length) / shown.length)))
    : Math.min(count, MAX_STATUS_ITEMS);
  const items = [];
  for (const board of shown) {
    if (several) {
      items.push({
        icon: 'map-pin',
        label: clip(nameOf(board), 40),
        value: clip(
          upcomingOf(board).length
            ? t('readAt', language, { time: formatTime(board.readAt, timeZone) })
            : t('noPassage', language),
          40,
        ),
        color: WIDGET_COLORS.NEUTRAL,
      });
    }
    items.push(
      ...rowsOf(board)
        .slice(0, perStation)
        .map((passage) => trainRow(passage, options)),
    );
  }
  // With several stations, each station row carries its own reading time.
  return {
    ttl_seconds: TTL_SECONDS.departures,
    components: [
      heading,
      { type: 'text', variant: 'caption', text: clip(several ? 'NS' : `NS · ${updated}`, 80) },
      { type: 'status', items },
    ],
  };
}

/**
 * @description The period of a disruption: "since 08:06, until 09:30".
 * @param {object} disruption - The disruption.
 * @param {number} now - Now (ms).
 * @param {string} [timeZone] - IANA timezone.
 * @param {string} language - The language.
 * @returns {string} The period.
 */
function periodText(disruption, now, timeZone, language) {
  const start = dateText(disruption.start, now, timeZone);
  const end = dateText(disruption.end, now, timeZone);
  if (start && end) {
    return t('periodFromTo', language, { start, end });
  }
  return start ? t('periodFrom', language, { start }) : '';
}

/**
 * @description The "disruptions" widget.
 * @param {object} options - Options.
 * @param {Array<{ name: string, traffic: object }>} [options.stations] - The
 * stations and their traffic (stationTraffic), empty for the whole network.
 * @param {object[]} [options.network] - The disruptions of the whole network,
 * when no station is shown.
 * @param {number|null} options.readAt - When they were read.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now (ms).
 * @param {string} [options.timeZone] - IANA timezone.
 * @returns {object} The content.
 */
function buildDisruptionsWidget({ stations = [], network = [], readAt, language, now, timeZone }) {
  const components = [
    {
      type: 'text',
      variant: 'heading',
      text: t(stations.length ? 'disruptionsTitle' : 'networkTitle', language),
    },
  ];
  if (stations.length > 0) {
    components.push({
      type: 'status',
      items: stations.slice(0, MAX_STATUS_ITEMS).map(({ name, traffic }) => ({
        label: clip(name, 40),
        value: clip(stateText(traffic.state, language), 40),
        color: STATE_COLORS[traffic.state] ?? WIDGET_COLORS.NEUTRAL,
      })),
    });
  }
  // One card per disruption, even when it is about several of the stations;
  // the ones under way, then the coming ones.
  const grouped = new Map();
  const add = (disruption, coming, name) => {
    const entry = grouped.get(disruption.id) ?? { disruption, coming, names: [] };
    if (name && !entry.names.includes(name)) {
      entry.names.push(name);
    }
    grouped.set(disruption.id, entry);
  };
  for (const { label, name, traffic } of stations) {
    traffic.current.forEach((disruption) => add(disruption, false, label ?? name));
    traffic.upcoming.forEach((disruption) => add(disruption, true, label ?? name));
  }
  network.forEach((disruption) => add(disruption, false, ''));
  const items = [...grouped.values()].sort(
    (a, b) =>
      Number(a.coming) - Number(b.coming) ||
      rank(b.disruption.state) - rank(a.disruption.state) ||
      (b.disruption.start ?? 0) - (a.disruption.start ?? 0),
  );
  if (items.length > 0) {
    components.push({
      type: 'card-list',
      display: 'list',
      items: items.slice(0, MAX_LIST_ITEMS).map(({ disruption, coming, names }) => {
        const item = {
          title: clip(headline(disruption), 60),
          subtitle: clip(
            [
              coming ? t('upcomingState', language) : kindText(disruption.kind, language),
              periodText(disruption, now, timeZone, language),
            ]
              .filter(Boolean)
              .join(' · '),
            60,
          ),
          badge: {
            text: clip(names.length ? names.join(' · ') : kindText(disruption.kind, language), 16),
            color: coming
              ? WIDGET_COLORS.NEUTRAL
              : (STATE_COLORS[disruption.state] ?? WIDGET_COLORS.NEUTRAL),
          },
        };
        const description = [
          disruption.text,
          disruption.extraTime && t('extraTime', language, { text: disruption.extraTime }),
        ]
          .filter(Boolean)
          .join(' ');
        if (description) {
          item.description = clip(description, 2000);
        }
        if (disruption.url) {
          item.links = [{ url: disruption.url, label: clip(t('moreInfo', language), 24) }];
        }
        return item;
      }),
    });
  }
  // Two texts at most: without a disruption, the body carries the update time.
  const updated = readAt ? t('updatedAt', language, { time: formatTime(readAt, timeZone) }) : '';
  if (items.length === 0) {
    components.push({
      type: 'text',
      variant: 'body',
      text: [t('noDisruption', language), updated && `NS · ${updated}.`].filter(Boolean).join(' '),
    });
  } else if (updated) {
    components.push({ type: 'text', variant: 'caption', text: `NS · ${updated}` });
  }
  return { ttl_seconds: TTL_SECONDS.disruptions, components };
}

export {
  WIDGETS,
  TTL_SECONDS,
  BOARD_COUNT,
  STATE_COLORS,
  LATE_MINUTES,
  clip,
  messageContent,
  readCount,
  trainRow,
  trainLabel,
  periodText,
  buildDeparturesWidget,
  buildDisruptionsWidget,
};
