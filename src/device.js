// -----------------------------------------------------------------------------
// The devices of the integration, offered on the Discovery screen.
//
// "NS <station> (<types> → <direction>)": one per followed station. Read-only
// features:
//   - `next`          text: the next train, "IC → Venlo · 09:32 (+8) · platform 15";
//   - `wait`          duration (minutes): the wait of the next train;
//   - `following`     duration (minutes): the wait of the one after;
//   - `delay`         duration (minutes): the delay of the next train (an
//                     early one counts 0);
//   - `traffic`       text: the disruptions about the station, "Disrupted:
//                     Utrecht - Amersfoort: fewer trains";
//   - `disruptions`   counter: the disruptions and works under way there.
//
// External ids: the code of the station, then the train types and the
// direction typed (`ext:nederlandse-spoorwegen:station:c-ut_t-ic_to-amersfoort`).
// `should_poll` stays false: the integration reads on its own timer.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { t, passageText, stateText } from './i18n.js';
import { slug } from './stations.js';
import { minutesLeft, upcomingPassages } from './departures.js';
import { headline } from './disruptions.js';

const DEVICE_TYPE = 'station';
const FEATURE_KEYS = {
  NEXT: 'next',
  WAIT: 'wait',
  FOLLOWING: 'following',
  DELAY: 'delay',
  TRAFFIC: 'traffic',
  DISRUPTIONS: 'disruptions',
};
const MAX_WAIT = 180;
const MAX_DELAY = 180;
const MAX_COUNT = 20;
const TEXT_MAX = 250;

/**
 * @description The identifier of a followed station.
 * @param {{ code: string }} station - The resolved station.
 * @param {string} type - The train types typed, '' when none.
 * @param {string} direction - The direction typed, '' when none.
 * @returns {string} "c-ut_t-ic_to-amersfoort".
 * @example
 * stationKey({ code: 'UT' }, 'IC', ''); // 'c-ut_t-ic'
 */
function stationKey(station, type, direction) {
  const parts = [`c-${slug(station.code, 12)}`];
  const types = slug(type, 16);
  if (types) {
    parts.push(`t-${types}`);
  }
  const words = slug(direction, 24);
  if (words) {
    parts.push(`to-${words}`);
  }
  return parts.join('_');
}

/**
 * @description The name of a followed station: "Utrecht Centraal (IC → Amersfoort)".
 * @param {object} followed - `{ station, type, direction }`.
 * @returns {string} The name.
 */
function followedName({ station, type, direction }) {
  const detail = [type, direction && `→ ${direction}`].filter(Boolean).join(' ');
  return detail ? `${station.name} (${detail})` : station.name;
}

/**
 * @description The external ids of a followed station.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} key - The station key.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const idsOf = (gladys, key) => gladys.externalIds(DEVICE_TYPE, String(key).toLowerCase());

/**
 * @description The station key of a device external id.
 * @param {unknown} externalId - A device (or feature) external id.
 * @returns {string|null} The key.
 * @example
 * keyOfExternalId('ext:nederlandse-spoorwegen:station:c-ut'); // -> 'c-ut'
 */
function keyOfExternalId(externalId) {
  // A feature id ends with ":<feature key>": the device key stops before it.
  const match = /:station:([a-z0-9_-]+)(?::[a-z_]+)?$/.exec(String(externalId ?? ''));
  return match ? match[1] : null;
}

/**
 * @description A read-only feature.
 * @param {object} feature - Its fields.
 * @returns {object} The feature.
 */
const sensor = (feature) => ({
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...feature,
});

const textShape = {
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  keep_history: false,
  min: 0,
  max: 0,
};
const minutesShape = {
  category: DEVICE_FEATURE_CATEGORIES.DURATION,
  type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
  unit: DEVICE_FEATURE_UNITS.MINUTES,
  keep_history: false,
  min: 0,
  max: MAX_WAIT,
};
const delayShape = {
  category: DEVICE_FEATURE_CATEGORIES.DURATION,
  type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
  unit: DEVICE_FEATURE_UNITS.MINUTES,
  keep_history: true,
  min: 0,
  max: MAX_DELAY,
};
const counterShape = {
  category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
  type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
  min: 0,
  max: MAX_COUNT,
};

/**
 * @description Build the device of a followed station.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} followed - The followed station (`key`, `name`, `station`, `type`, `direction`).
 * @param {string} [language] - Language of the names.
 * @returns {object} The discovered device.
 */
function buildStationDevice(gladys, followed, language = 'en') {
  const ids = idsOf(gladys, followed.key);
  const params = [{ name: 'NS_STATION', value: followed.station.code }];
  if (followed.type) {
    params.push({ name: 'NS_TRAIN_TYPES', value: followed.type });
  }
  if (followed.direction) {
    params.push({ name: 'NS_DIRECTION', value: followed.direction });
  }
  const feature = (key, name, shape) =>
    sensor({ name: t(name, language), external_id: ids.feature(key), ...shape });
  return {
    name: t('stationDeviceName', language, { station: followed.name }),
    external_id: ids.device,
    model: 'NS',
    should_poll: false,
    params,
    features: [
      feature(FEATURE_KEYS.NEXT, 'featureNext', textShape),
      feature(FEATURE_KEYS.WAIT, 'featureWait', minutesShape),
      feature(FEATURE_KEYS.FOLLOWING, 'featureFollowing', minutesShape),
      feature(FEATURE_KEYS.DELAY, 'featureDelay', delayShape),
      feature(FEATURE_KEYS.TRAFFIC, 'featureTraffic', textShape),
      feature(FEATURE_KEYS.DISRUPTIONS, 'featureDisruptions', counterShape),
    ],
  };
}

/**
 * @description The departure states of a followed station. Without a train
 * (the night), the waits and the delay are left untouched: a 0 would fake a
 * train now; the delay too when the next train has no real time.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} followed - The followed station.
 * @param {object[]} passages - Its passages (parsePassages).
 * @param {object} options - `{ language, now, timeZone }`.
 * @returns {object[]} The states.
 */
function buildDepartureStates(gladys, followed, passages, { language, now, timeZone }) {
  const ids = idsOf(gladys, followed.key);
  const upcoming = upcomingPassages(passages, now);
  const states = [
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.NEXT),
      text: (upcoming[0]
        ? passageText(upcoming[0], { language, now, timeZone })
        : t('noPassage', language)
      ).slice(0, TEXT_MAX),
    },
  ];
  [FEATURE_KEYS.WAIT, FEATURE_KEYS.FOLLOWING].forEach((key, index) => {
    if (upcoming[index]) {
      states.push({
        device_feature_external_id: ids.feature(key),
        state: Math.min(MAX_WAIT, minutesLeft(upcoming[index], now)),
      });
    }
  });
  if (upcoming[0]?.realtime) {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_KEYS.DELAY),
      state: Math.min(MAX_DELAY, Math.max(0, upcoming[0].delay)),
    });
  }
  return states;
}

/**
 * @description The one-line traffic of a station: "Disrupted: Utrecht -
 * Amersfoort: fewer trains".
 * @param {{ state: string, current: object[] }} traffic - stationTraffic().
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function trafficText(traffic, language) {
  const state = stateText(traffic.state, language);
  const [first] = traffic.current;
  return first ? t('stateWithTitle', language, { state, title: headline(first) }) : state;
}

/**
 * @description The traffic states of a followed station.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} followed - The followed station.
 * @param {object} traffic - stationTraffic().
 * @param {string} language - Language of the text.
 * @returns {object[]} The states.
 */
function buildTrafficStates(gladys, followed, traffic, language) {
  const ids = idsOf(gladys, followed.key);
  return [
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.TRAFFIC),
      text: trafficText(traffic, language).slice(0, TEXT_MAX),
    },
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.DISRUPTIONS),
      state: Math.min(MAX_COUNT, traffic.current.length),
    },
  ];
}

export {
  DEVICE_TYPE,
  FEATURE_KEYS,
  MAX_WAIT,
  MAX_DELAY,
  MAX_COUNT,
  stationKey,
  followedName,
  idsOf,
  keyOfExternalId,
  buildStationDevice,
  buildDepartureStates,
  trafficText,
  buildTrafficStates,
};
