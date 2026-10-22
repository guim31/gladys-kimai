// -----------------------------------------------------------------------------
// Kimai API client: the calls the integration needs, on `/api`, as one Kimai
// user. Checked against a real kimai/kimai2:apache 2.70.2 with MariaDB 11 in
// Docker, October 2026.
//
// Authentication, two ways:
//   - an API token (Kimai 2.14+: user menu, API access, Create) in
//     `Authorization: Bearer`, the current way;
//   - the old "API password" with the username, in `X-AUTH-USER` and
//     `X-AUTH-TOKEN`: deprecated by Kimai, still accepted by 2.70, used when
//     a username is filled in the configuration.
//
//   GET   /api/version                     { version, versionId }
//   GET   /api/users/me                    the user: id, username, alias, timezone, preferences
//   GET   /api/config/timesheet            { activeEntriesHardLimit, … }
//   GET   /api/timesheets/active           running entries, project and activity as objects
//   GET   /api/timesheets?begin=&size=&page=   the user's entries, most recent first
//   GET   /api/projects, /api/activities, /api/customers
//   POST  /api/timesheets                  start (no `end`): { project, activity, description }
//   PATCH /api/timesheets/:id/stop         stop
//   PATCH /api/timesheets/:id/restart      a new running copy of an entry
//
// Behaviour found on the real server:
//   - `begin` of GET /api/timesheets is a local date-time without offset, read
//     in the time zone of the user; it keeps the entries that BEGIN after it.
//   - The answers carry the offset without a colon: `2026-10-22T02:41:00+0200`.
//   - A running entry has `end: null` and `duration: 0`; the begin is rounded
//     down to the minute (default rounding rules).
//   - With the default limit of one active entry (`activeEntriesHardLimit`),
//     starting a timer STOPS the running one on the server's side.
//   - Stopping an entry already stopped answers 200 with the entry unchanged.
//   - A wrong token is a 401 (Bearer) or a 403 (X-AUTH); an unknown project
//     or activity a 400 `Validation Failed` with the faulty field.
//   - The web app redirects (302) outside the API; an unknown API path is a
//     404 in JSON.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // missing, wrong or expired token, or a permission it lacks
  NOT_KIMAI: 'not_kimai', // something answers, but not the Kimai API
  REDIRECT: 'redirect', // HTTP redirected to HTTPS, or a login portal
  RATE_LIMIT: 'rate_limit', // 429: the server's request limit
  HTTP: 'http', // any other unexpected answer
});

export class KimaiError extends Error {
  constructor(kind, message, status, fields) {
    super(message);
    this.name = 'KimaiError';
    this.kind = kind;
    this.status = status;
    /** Fields refused by a 400 `Validation Failed` (`project`, `activity`…). */
    this.fields = fields ?? [];
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

const PAGE_SIZE = 250;
const MAX_PAGES = 10;

function networkError(err) {
  if (TLS_CODES.has(err.code)) {
    return new KimaiError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
  }
  return new KimaiError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
}

/** The fields named by a 400 `Validation Failed`, with their messages. */
function validationErrors(parsed) {
  const children = parsed?.errors?.children;
  if (!children || typeof children !== 'object') {
    return [];
  }
  return Object.entries(children)
    .filter(([, child]) => Array.isArray(child?.errors) && child.errors.length > 0)
    .map(([field, child]) => ({ field, message: String(child.errors[0]).slice(0, 100) }));
}

export class KimaiClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, without trailing slash
   * @param {string} options.token API token, or the API password with `username`
   * @param {string} [options.username] set: the old X-AUTH-USER / X-AUTH-TOKEN pair
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {Function} [options.request] HTTP seam (src/kimai/http.js)
   */
  constructor({ url, token, username = '', insecure = false, request = httpRequest }) {
    this.url = url;
    this.headers = username
      ? { 'x-auth-user': username, 'x-auth-token': token }
      : { authorization: `Bearer ${token}` };
    this.insecure = insecure;
    this.request = request;
  }

  async call(path, { method = 'GET', json } = {}) {
    let response;
    try {
      response = await this.request(`${this.url}/api${path}`, {
        method,
        json,
        insecure: this.insecure,
        headers: this.headers,
      });
    } catch (err) {
      throw networkError(err);
    }
    const { status, body, headers = {} } = response;
    let parsed;
    let parsedOk = true;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsedOk = false;
    }
    // The server's own message, short; it never echoes the token.
    const said =
      parsedOk && typeof parsed?.message === 'string' ? ` ${parsed.message.slice(0, 200)}` : '';
    if (status === 401 || status === 403) {
      throw new KimaiError(ERROR_KINDS.AUTH, `HTTP ${status}${said}`, status);
    }
    if (status === 429) {
      throw new KimaiError(ERROR_KINDS.RATE_LIMIT, 'HTTP 429', status);
    }
    if (status >= 300 && status < 400) {
      throw new KimaiError(ERROR_KINDS.REDIRECT, `HTTP ${status}`, status);
    }
    if (!parsedOk) {
      throw new KimaiError(
        status === 200 || status === 404 ? ERROR_KINDS.NOT_KIMAI : ERROR_KINDS.HTTP,
        `HTTP ${status}, not JSON`,
        status,
      );
    }
    if (status < 200 || status >= 300) {
      const fields = validationErrors(parsed);
      const detail = fields.map(({ field, message }) => ` ${field}: ${message}`).join(';');
      throw new KimaiError(ERROR_KINDS.HTTP, `HTTP ${status}${said}${detail}`, status, fields);
    }
    return { data: parsed, headers };
  }

  /** `{ version }`; throws NOT_KIMAI when the answer is not Kimai's. */
  async version() {
    let data;
    try {
      ({ data } = await this.call('/version'));
    } catch (err) {
      // Another JSON API, or a path prefix missing from the address.
      if (err instanceof KimaiError && err.status === 404) {
        throw new KimaiError(ERROR_KINDS.NOT_KIMAI, 'no /api/version', 404);
      }
      throw err;
    }
    if (!data || typeof data !== 'object' || typeof data.version !== 'string') {
      throw new KimaiError(ERROR_KINDS.NOT_KIMAI, 'no version in /api/version', 200);
    }
    return data;
  }

  async me() {
    const { data } = await this.call('/users/me');
    if (!data || !Number.isInteger(data.id)) {
      throw new KimaiError(ERROR_KINDS.NOT_KIMAI, 'no user in /api/users/me', 200);
    }
    return data;
  }

  /** The timesheet settings; `{}` when the route is missing (older Kimai). */
  async timesheetConfig() {
    try {
      const { data } = await this.call('/config/timesheet');
      return data && typeof data === 'object' ? data : {};
    } catch (err) {
      if (err instanceof KimaiError && err.status === 404) {
        return {};
      }
      throw err;
    }
  }

  async active() {
    const { data } = await this.call('/timesheets/active');
    return Array.isArray(data) ? data : [];
  }

  /** The user's entries that begin after `begin` (local date-time of the user), every page. */
  async timesheets(begin) {
    const page = (n) =>
      this.call(
        `/timesheets?${new URLSearchParams({ begin, size: String(PAGE_SIZE), page: String(n) })}`,
      );
    const first = await page(1);
    const items = Array.isArray(first.data) ? [...first.data] : [];
    const pages = Math.min(MAX_PAGES, Number.parseInt(first.headers['x-total-pages'], 10) || 1);
    for (let n = 2; n <= pages; n += 1) {
      const { data } = await page(n);
      if (!Array.isArray(data) || data.length === 0) {
        break;
      }
      items.push(...data);
    }
    // Offset pages are not stable: an entry created meanwhile may come twice.
    const seen = new Set();
    return items.filter((item) => {
      if (!item || seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
  }

  async list(path) {
    const { data } = await this.call(path);
    return Array.isArray(data) ? data : [];
  }

  projects() {
    return this.list('/projects');
  }

  /** Every activity, or the ones a project accepts (its own and the global ones). */
  activities(projectId) {
    return this.list(
      projectId
        ? `/activities?${new URLSearchParams({ project: String(projectId) })}`
        : '/activities',
    );
  }

  customers() {
    return this.list('/customers');
  }

  /** Start a timer now. */
  async start({ project, activity, description }) {
    const { data } = await this.call('/timesheets', {
      method: 'POST',
      json: { project, activity, ...(description ? { description } : {}) },
    });
    return data;
  }

  async stop(id) {
    const { data } = await this.call(`/timesheets/${encodeURIComponent(id)}/stop`, {
      method: 'PATCH',
    });
    return data;
  }

  /** A new running entry, copy of `id` (project, activity, description, tags). */
  async restart(id) {
    const { data } = await this.call(`/timesheets/${encodeURIComponent(id)}/restart`, {
      method: 'PATCH',
      json: { copy: 'all' },
    });
    return data;
  }
}
