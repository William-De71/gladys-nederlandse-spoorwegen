// -----------------------------------------------------------------------------
// The disruptions of NS, read every 5 minutes for each followed station.
//
// Three kinds (`type`): DISRUPTION (an incident: signal failure, broken-down
// train…), MAINTENANCE (engineering works, planned) and CALAMITY (a national
// message: storm, strike). A disruption or works give a title (the route,
// "Alkmaar - Hoorn."), a period (`start`, `end`), an impact from 1 to 5, the
// consequence ("buses are running"), and per timespan the situation (a
// sentence), the cause ("signal failure", "engineering works"), advices and
// the extra travel time; a calamity gives a title, a description and a link.
// Works announced for later come with `isActive: false`.
//
// States of a station, from the mildest: `unknown` (nothing read yet),
// `normal`, `info` (light works under way), `disrupted`, `major`.
// -----------------------------------------------------------------------------

import { parseNsDate } from './departures.js';
import { MINUTE_MS } from './time.js';

const KINDS = { DISRUPTION: 'disruption', MAINTENANCE: 'maintenance', CALAMITY: 'calamity' };
const STATES = ['unknown', 'normal', 'info', 'disrupted', 'major'];
const SERIOUS = ['disrupted', 'major'];
// Works starting this soon are shown as coming.
const UPCOMING_MS = 3 * 24 * 60 * MINUTE_MS;
// From this impact (out of 5) an incident is major, works are a disruption.
const HIGH_IMPACT = 4;
const TEXT_MAX = 2000;
const TITLE_MAX = 140;

/**
 * @description A plain text: no tags, spaces squeezed.
 * @param {unknown} value - The text.
 * @param {number} [max] - Its longest length.
 * @returns {string} The text.
 */
function plainText(value, max = TEXT_MAX) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * @description A link, when on https.
 * @param {unknown} value - The URL.
 * @returns {string} The URL, '' when none.
 */
function linkOf(value) {
  const url = String(value ?? '').trim();
  return /^https:\/\/\S+$/i.test(url) && url.length <= 2048 ? url : '';
}

/**
 * @description The state a disruption gives.
 * @param {string} kind - KINDS.
 * @param {number} impact - From 1 to 5, 0 when unknown.
 * @returns {string} `info`, `disrupted` or `major`.
 */
function stateOf(kind, impact) {
  if (kind === KINDS.CALAMITY) {
    return 'major';
  }
  if (kind === KINDS.DISRUPTION) {
    return impact >= HIGH_IMPACT ? 'major' : 'disrupted';
  }
  return impact >= HIGH_IMPACT ? 'disrupted' : 'info';
}

/**
 * @description What is kept of a disruption.
 * @param {object} raw - A disruption of the API.
 * @returns {object|null} `{ id, kind, state, active, title, consequence,
 * text, cause, advice, extraTime, expected, start, end, stations, url }`,
 * null when unreadable.
 */
function disruptionOf(raw) {
  const kind = KINDS[String(raw?.type ?? '').toUpperCase()];
  if (!kind || raw.id === undefined || raw.id === null) {
    return null;
  }
  const impact = Number(raw.impact?.value) || 0;
  const [span = {}] = Array.isArray(raw.timespans) ? raw.timespans : [];
  const sections = Array.isArray(raw.publicationSections) ? raw.publicationSections : [];
  const consequence = plainText(sections[0]?.consequence?.description, TITLE_MAX);
  const title = plainText(raw.title, TITLE_MAX).replace(/\.$/, '');
  const situation = plainText(span.situation?.label);
  const advice = (Array.isArray(span.advices) ? span.advices : []).map((entry) => plainText(entry));
  const expected = plainText(raw.expectedDuration?.description, TITLE_MAX);
  const extraTime = plainText(
    raw.summaryAdditionalTravelTime?.shortLabel ?? span.additionalTravelTime?.shortLabel,
    TITLE_MAX,
  );
  const text =
    kind === KINDS.CALAMITY
      ? plainText(raw.description)
      : [situation, ...advice, expected].filter(Boolean).join(' ').slice(0, TEXT_MAX);
  const stations = [
    ...new Set(
      sections.flatMap((section) =>
        (section?.section?.stations ?? []).map((station) => String(station?.stationCode ?? '')),
      ),
    ),
  ].filter(Boolean);
  return {
    id: `${kind}:${raw.id}`,
    kind,
    impact,
    state: stateOf(kind, impact),
    active: raw.isActive !== false,
    title: title || consequence,
    consequence,
    text,
    cause: plainText(span.cause?.label, TITLE_MAX),
    extraTime,
    expected,
    start: parseNsDate(raw.start),
    end: parseNsDate(raw.end ?? raw.expectedDuration?.endTime),
    stations,
    url: linkOf(raw.url),
  };
}

/**
 * @description Read a list of disruptions.
 * @param {object[]} list - The answer of the API.
 * @returns {object[]} The disruptions, unreadable ones left out.
 */
const parseDisruptions = (list) =>
  (Array.isArray(list) ? list : []).map(disruptionOf).filter(Boolean);

/**
 * @description The rank of a state, for comparisons.
 * @param {string} state - A state.
 * @returns {number} Its position in STATES.
 */
const rank = (state) => STATES.indexOf(state);

/**
 * @description The traffic of a station.
 * @param {object[]|null} disruptions - parseDisruptions(), null when not read.
 * @param {number} now - Now (ms).
 * @returns {{ state: string, current: object[], upcoming: object[] }} Its
 * state, the disruptions under way (the most serious first) and the ones
 * coming in the next three days (soonest first).
 */
function stationTraffic(disruptions, now) {
  if (!disruptions) {
    return { state: 'unknown', current: [], upcoming: [] };
  }
  const notOver = disruptions.filter((entry) => entry.end === null || entry.end > now);
  const current = notOver
    .filter((entry) => entry.active && (entry.start === null || entry.start <= now))
    .sort((a, b) => rank(b.state) - rank(a.state) || (b.start ?? 0) - (a.start ?? 0));
  const upcoming = notOver
    .filter((entry) => !current.includes(entry))
    .filter(
      (entry) => entry.start !== null && entry.start > now && entry.start - now <= UPCOMING_MS,
    )
    .sort((a, b) => a.start - b.start);
  const state = current.reduce(
    (worst, entry) => (rank(entry.state) > rank(worst) ? entry.state : worst),
    'normal',
  );
  return { state, current, upcoming };
}

/**
 * @description The one-line label of a disruption: "Alkmaar - Hoorn: buses are running".
 * @param {object} disruption - The disruption.
 * @returns {string} The label.
 */
function headline(disruption) {
  const { title, consequence } = disruption;
  if (consequence && title && consequence !== title) {
    return `${title}: ${consequence}`;
  }
  return title || consequence;
}

export {
  KINDS,
  STATES,
  SERIOUS,
  UPCOMING_MS,
  HIGH_IMPACT,
  plainText,
  linkOf,
  stateOf,
  disruptionOf,
  parseDisruptions,
  rank,
  stationTraffic,
  headline,
};
