// -----------------------------------------------------------------------------
// Times of day.
//
// NS dates carry their offset (departures.js reads them as instants); they are
// written in the timezone of the Gladys instance, which the supervisor
// injects as TZ (Amsterdam time for most users).
// -----------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000;

/**
 * @description The timezone of the instance.
 * @returns {string|undefined} An IANA name, undefined for the system one.
 */
function defaultTimeZone() {
  return process.env.TZ || undefined;
}

/**
 * @description The local date and time of an instant in a timezone.
 * @param {number} instant - The instant, in ms.
 * @param {string} [timeZone] - IANA timezone.
 * @returns {{ date: string, minutes: number }} `YYYY-MM-DD` and minutes since midnight.
 * @example
 * localClock(Date.parse('2026-10-06T07:24:00Z'), 'Europe/Amsterdam'); // 2026-10-06, 564
 */
function localClock(instant, timeZone = defaultTimeZone()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * @description "07:42", in the timezone of the instance.
 * @param {number|null} instant - The instant, in ms.
 * @param {string} [timeZone] - IANA timezone.
 * @returns {string} The time, '' when none.
 */
function formatTime(instant, timeZone = defaultTimeZone()) {
  if (!Number.isFinite(instant)) {
    return '';
  }
  const { minutes } = localClock(instant, timeZone);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * @description "06/10", the day of an instant.
 * @param {number|null} instant - The instant (ms).
 * @param {string} [timeZone] - IANA timezone.
 * @returns {string} The day and month, '' when none.
 */
function formatDay(instant, timeZone = defaultTimeZone()) {
  if (!Number.isFinite(instant)) {
    return '';
  }
  const [, month, day] = localClock(instant, timeZone).date.split('-');
  return `${day}/${month}`;
}

/**
 * @description A date: "21:30" today, "06/10 21:30" another day.
 * @param {number|null} instant - The instant (ms).
 * @param {number} now - Now (ms).
 * @param {string} [timeZone] - IANA timezone.
 * @returns {string} The date, '' when none.
 */
function dateText(instant, now, timeZone = defaultTimeZone()) {
  if (!Number.isFinite(instant)) {
    return '';
  }
  const time = formatTime(instant, timeZone);
  return localClock(instant, timeZone).date === localClock(now, timeZone).date
    ? time
    : `${formatDay(instant, timeZone)} ${time}`;
}

export { MINUTE_MS, defaultTimeZone, localClock, formatTime, formatDay, dateText };
