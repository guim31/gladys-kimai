// -----------------------------------------------------------------------------
// From the raw Kimai answers to what Gladys shows: timesheet entries with
// their times in milliseconds, the running timer, and the hours of the local
// day, week and month (the time zone of Gladys, injected by the supervisor as
// TZ).
//
// Definitions, the same in the device, the widget, the scene events and the
// documentation:
//   - an entry counts for the day, week and month it BEGINS in, as in the
//     Kimai reports (an entry from 23:00 to 01:00 is the previous day's);
//   - a stopped entry counts for its `duration` (breaks already taken off by
//     Kimai), a running one for the time elapsed since it began;
//   - the week starts on the user's first weekday in Kimai (Monday or Sunday).
// -----------------------------------------------------------------------------

const time = (value) => {
  if (typeof value !== 'string' || value === '') {
    return null;
  }
  // Kimai writes the offset without a colon (`+0200`): Date.parse accepts it.
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const idOf = (value) =>
  Number.isInteger(value) ? value : Number.isInteger(value?.id) ? value.id : 0;

/**
 * Projects, activities or customers: `{ id, name, parentId }`. `parentId` is
 * the customer of a project, the project of a project-specific activity (0
 * for a global activity).
 * @param {unknown[]} raw answer of GET /api/projects, /api/activities or /api/customers
 * @param {'customer'|'project'|null} parentKey
 */
export function parseNamed(raw, parentKey = null) {
  return (Array.isArray(raw) ? raw : [])
    .filter((item) => item && Number.isInteger(item.id) && item.id > 0)
    .map((item) => ({
      id: item.id,
      name: text(item.name) || `#${item.id}`,
      parentId: parentKey ? idOf(item[parentKey]) : 0,
      visible: item.visible !== false,
    }));
}

/**
 * Timesheet entries, most recent first. `project` and `activity` are ids in
 * GET /api/timesheets and objects in GET /api/timesheets/active: both read.
 * @param {unknown[]} raw
 * @returns {Array<{ id: number, begin: number, end: number|null, duration: number,
 *   breakSeconds: number, projectId: number, activityId: number, description: string }>}
 */
export function parseTimesheets(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((entry) => entry && Number.isInteger(entry.id))
    .map((entry) => ({
      id: entry.id,
      begin: time(entry.begin),
      end: time(entry.end),
      duration: Number.isFinite(entry.duration) ? Math.max(0, entry.duration) : 0,
      breakSeconds: Number.isFinite(entry.break) ? Math.max(0, entry.break) : 0,
      projectId: idOf(entry.project),
      activityId: idOf(entry.activity),
      description: text(entry.description),
    }))
    .filter((entry) => entry.begin !== null)
    .sort((a, b) => b.begin - a.begin || b.id - a.id);
}

/** Seconds an entry counts for at `now` (a running one: the time elapsed). */
export function workedSeconds(entry, now) {
  if (entry.end !== null) {
    return entry.duration;
  }
  return Math.max(0, Math.floor((now - entry.begin) / 1000) - entry.breakSeconds);
}

// --- Local days, weeks, months (adapted from guim31/gladys-vikunja) ---------------

const partsFormatters = new Map();

function zonedParts(ms, timeZone) {
  let format = partsFormatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    partsFormatters.set(timeZone, format);
  }
  return Object.fromEntries(
    format.formatToParts(new Date(ms)).map(({ type, value }) => [type, Number(value)]),
  );
}

/** Offset of `timeZone` from UTC at `ms`, in milliseconds. */
function offsetAt(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** UTC instant of local midnight of a local calendar day (DST-safe). */
function localMidnight(year, month, day, timeZone) {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetAt(guess, timeZone);
  let start = guess - offsetAt(first, timeZone);
  // Where the clocks jump at midnight (Chile, Cuba), 00:00 does not exist and
  // the instant found is 23:00 the day before: the day starts an hour later.
  if (zonedParts(start, timeZone).day !== day) {
    start += 60 * 60_000;
  }
  return start;
}

/** A time zone Intl knows, else the one of the process. */
export function resolveTimeZone(timeZone) {
  try {
    if (timeZone) {
      new Intl.DateTimeFormat('en-US', { timeZone });
      return timeZone;
    }
  } catch {
    // fall through
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const midnightOf = (year, month, day, timeZone) => {
  // Date.UTC normalizes day 0, day 32, month 13…
  const date = new Date(Date.UTC(year, month - 1, day));
  return localMidnight(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), timeZone);
};

/**
 * Start (inclusive) and end (exclusive) of the local day, week and month
 * holding `now`.
 * @param {number} now
 * @param {string} timeZone
 * @param {'monday'|'sunday'} [firstWeekday]
 */
export function periods(now, timeZone, firstWeekday = 'monday') {
  const p = zonedParts(now, timeZone);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); // 0 = Sunday
  const back = firstWeekday === 'sunday' ? weekday : (weekday + 6) % 7;
  return {
    day: {
      start: midnightOf(p.year, p.month, p.day, timeZone),
      end: midnightOf(p.year, p.month, p.day + 1, timeZone),
    },
    week: {
      start: midnightOf(p.year, p.month, p.day - back, timeZone),
      end: midnightOf(p.year, p.month, p.day - back + 7, timeZone),
    },
    month: {
      start: midnightOf(p.year, p.month, 1, timeZone),
      end: midnightOf(p.year, p.month + 1, 1, timeZone),
    },
  };
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * `YYYY-MM-DDTHH:mm:ss` in `timeZone`: the format of the `begin` filter of
 * GET /api/timesheets, read by Kimai in the time zone of the user.
 */
export function localDateTime(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

// --- Totals -----------------------------------------------------------------------

/**
 * Seconds worked in the day, week and month of `now`, and the running entries.
 * @param {ReturnType<typeof parseTimesheets>} entries
 * @param {{ now: number, periods: ReturnType<typeof periods> }} options
 */
export function summarize(entries, { now, periods: p }) {
  const total = (range) =>
    entries
      .filter(
        (entry) => entry.begin >= range.start && entry.begin < range.end && entry.begin <= now,
      )
      .reduce((sum, entry) => sum + workedSeconds(entry, now), 0);
  return {
    todaySeconds: total(p.day),
    weekSeconds: total(p.week),
    monthSeconds: total(p.month),
  };
}

/**
 * The project/activity couples of the most recent entries, most recent first,
 * without repeats: the quick buttons of the widget.
 */
export function recentCouples(entries, limit) {
  const seen = new Set();
  const couples = [];
  for (const entry of entries) {
    const key = `${entry.projectId}/${entry.activityId}`;
    if (entry.projectId > 0 && entry.activityId > 0 && !seen.has(key)) {
      seen.add(key);
      couples.push({ projectId: entry.projectId, activityId: entry.activityId });
      if (couples.length >= limit) {
        break;
      }
    }
  }
  return couples;
}

const fold = (value) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Find an item by its number (`12`, `#12`) or its exact name (case, accents
 * and repeated blanks ignored).
 * @template {{ id: number, name: string }} T
 * @param {T[]} items
 * @param {unknown} query
 * @returns {{ item: T|null, reason?: 'empty'|'not_found'|'ambiguous' }}
 */
export function findByIdOrName(items, query) {
  const wanted = typeof query === 'number' ? String(query) : String(query ?? '').trim();
  if (!wanted) {
    return { item: null, reason: 'empty' };
  }
  const number = wanted.match(/^#?(\d+)$/);
  if (number) {
    const byId = items.find((item) => item.id === Number(number[1]));
    if (byId) {
      return { item: byId };
    }
  }
  const matches = items.filter((item) => fold(item.name) === fold(wanted));
  if (matches.length === 1) {
    return { item: matches[0] };
  }
  return { item: null, reason: matches.length > 1 ? 'ambiguous' : 'not_found' };
}
