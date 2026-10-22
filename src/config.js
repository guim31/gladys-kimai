// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Kimai (self-hosted or Kimai Cloud), one user: the one of the API token.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['30', '60', '120', '300'];

export const DEFAULT_CONFIG = {
  url: '',
  api_token: '',
  username: '',
  daily_limit: '8',
  allow_self_signed: false,
  poll_interval: '60',
  language: 'fr',
};

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10:8001`), or the URL copied from the browser
 * (`https://demo.kimai.cloud/en/timesheet/`). HTTP by default, HTTPS for
 * kimai.cloud. A path prefix is kept (Kimai behind a reverse proxy under
 * `/kimai`), the API path and the screens of the web app (`/en/…`) are dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/prefix]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const scheme = /\.kimai\.cloud(?::|\/|$)/i.test(text) ? 'https' : 'http';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `${scheme}://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  const path = url.pathname
    .replace(/\/api(\/.*)?$/, '')
    .replace(/\/(index\.php)(\/.*)?$/, '')
    .replace(
      /\/[a-z]{2}(_[A-Za-z]{2,4})?\/(homepage|timesheet|dashboard|login|team|admin|profile|reporting|invoice|export|calendar|wizard)(\/.*)?$/,
      '',
    )
    .replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

/**
 * The daily limit typed by the user, in hours: `8`, `7.5`, `7,5`, `7:30`,
 * `7h30`. Empty or 0: no limit (the trigger never fires).
 * @param {unknown} raw
 * @returns {number|null} seconds, null when none
 */
export function parseDailyLimit(raw) {
  const text = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!text) {
    return null;
  }
  let hours;
  const clock = text.match(/^(\d{1,2})\s*(?::|h)\s*(\d{1,2})?$/);
  if (clock) {
    const minutes = clock[2] === undefined ? 0 : Number(clock[2]);
    if (minutes >= 60) {
      return null;
    }
    hours = Number(clock[1]) + minutes / 60;
  } else if (/^\d{1,2}(?:[.,]\d+)?$/.test(text)) {
    hours = Number(text.replace(',', '.'));
  } else {
    return null;
  }
  if (!(hours > 0) || hours > 24) {
    return null;
  }
  return Math.round(hours * 3600);
}

const bool = (value) => value === true || value === 'true';
const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typed = trimmed(source.url);
  const poll = String(source.poll_interval ?? '');
  const limitTyped = trimmed(String(source.daily_limit ?? DEFAULT_CONFIG.daily_limit));
  return {
    url: parseServerUrl(typed),
    urlTyped: typed !== '',
    // Kept as typed, minus the blanks a copy and paste adds around them.
    token: trimmed(source.api_token),
    username: trimmed(source.username),
    dailyLimitSeconds: parseDailyLimit(limitTyped),
    dailyLimitInvalid:
      limitTyped !== '' && limitTyped !== '0' && parseDailyLimit(limitTyped) === null,
    allowSelfSigned: bool(source.allow_self_signed),
    pollIntervalMs:
      Number(POLL_INTERVALS.includes(poll) ? poll : DEFAULT_CONFIG.poll_interval) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
