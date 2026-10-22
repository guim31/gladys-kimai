// -----------------------------------------------------------------------------
// An in-memory Kimai, answering the routes the integration calls the way the
// real server does (checked on kimai/kimai2:apache 2.70.2): Bearer or
// X-AUTH-USER/X-AUTH-TOKEN, 401/403 on a wrong token, `begin` read as a local
// date-time of the user (Europe/Paris, +02:00 in October), entries most
// recent first with the X-Total-Pages header, the active list with project
// and activity as objects, a start that stops the running timer when one
// timer at a time is allowed, a 400 `Validation Failed` for an unknown
// project or activity, a redirect outside /api.
//
// Its starting data are real answers of that server (test/fixtures/kimai/
// real-*.json, captured on 22/10/2026 at 02:42 Paris time): one customer,
// two projects, three activities (one only for "Maintenance"), eight entries
// from 30/09 to 22/10, the last one (#4) running since 02:42.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/kimai/${name}.json`, import.meta.url), 'utf8'));

export const TOKEN = 'kimai_test_token_0123456789abcdef0123456789';
export const LEGACY = { username: 'tester', password: 'legacy-api-password' };

// Paris in October 2026 (summer time until the 25th).
const OFFSET_MS = 2 * 60 * 60_000;
const pad = (n) => String(n).padStart(2, '0');

/** `2026-10-22T02:42:00+0200`, the way Kimai writes a date. */
export function kimaiDate(ms) {
  const d = new Date(ms + OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+0200`;
}

/** A local date-time of the user (`2026-10-01T00:00:00`), in ms. */
const fromLocal = (text) => Date.parse(`${text}Z`) - OFFSET_MS;

const json = (status, value, headers = {}) => ({
  status,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(value),
});

const invalid = (field) => {
  const children = Object.fromEntries(
    ['begin', 'end', 'project', 'activity', 'description', 'tags'].map((key) => [
      key,
      key === field ? { errors: ['The selected choice is invalid.'] } : {},
    ]),
  );
  return json(400, { code: 400, message: 'Validation Failed', errors: { children } });
};

export class FakeKimai {
  constructor({ now = () => Date.now(), token = TOKEN } = {}) {
    this.now = now;
    this.token = token;
    this.version = fixture('real-version');
    this.user = fixture('real-users-me');
    this.projects = fixture('real-projects');
    this.activities = fixture('real-activities');
    this.customers = fixture('real-customers');
    this.entries = fixture('real-timesheets');
    this.hardLimit = 1;
    this.online = true;
    this.requests = [];
    this.nextId = 100;
    this.legacy = { ...LEGACY };
  }

  entry(id) {
    return this.entries.find((entry) => entry.id === id);
  }

  get running() {
    return this.entries.filter((entry) => entry.end === null);
  }

  authorized(headers) {
    if (headers.authorization) {
      return headers.authorization === `Bearer ${this.token}` ? true : 401;
    }
    if (headers['x-auth-user'] || headers['x-auth-token']) {
      return headers['x-auth-user'] === this.legacy.username &&
        headers['x-auth-token'] === this.legacy.password
        ? true
        : 403;
    }
    return 401;
  }

  /** Stop an entry the way Kimai does (end rounded down to the minute). */
  stopEntry(entry) {
    if (entry.end !== null) {
      return;
    }
    const end = Math.floor(this.now() / 60_000) * 60_000;
    entry.end = kimaiDate(end);
    entry.duration = Math.max(0, Math.round((end - Date.parse(entry.begin)) / 1000));
  }

  /** A new running entry, begin rounded down to the minute. */
  startEntry({ project, activity, description = null }) {
    for (const running of this.running.slice(this.hardLimit - 1)) {
      // One timer at a time by default: Kimai stops the running one.
      this.stopEntry(running);
    }
    const entry = {
      activity,
      project,
      user: this.user.id,
      tags: [],
      id: this.nextId++,
      begin: kimaiDate(Math.floor(this.now() / 60_000) * 60_000),
      end: null,
      duration: 0,
      break: 0,
      description,
      exported: false,
      billable: true,
      metaFields: [],
    };
    this.entries.unshift(entry);
    return entry;
  }

  /** The /active form: project (with its customer) and activity as objects. */
  expanded(entry) {
    const project = this.projects.find((item) => item.id === entry.project);
    const customer = this.customers.find((item) => item.id === project?.customer);
    const activity = this.activities.find((item) => item.id === entry.activity);
    return {
      ...entry,
      user: { id: this.user.id, username: this.user.username },
      project: project ? { ...project, customer } : entry.project,
      activity: activity ?? entry.activity,
    };
  }

  /** The `request` seam of src/kimai/http.js. */
  async handle(url, { method = 'GET', headers = {}, json: body } = {}) {
    const target = new URL(url);
    this.requests.push({ method, path: target.pathname, search: target.search, body });
    if (!this.online) {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }
    const path = target.pathname;
    if (!path.startsWith('/api/')) {
      return { status: 302, headers: { location: '/en/login' }, body: '' };
    }
    const auth = this.authorized(headers);
    if (auth !== true) {
      return json(
        auth,
        auth === 401 ? { code: 401, message: 'Unauthorized' } : { message: 'Invalid credentials' },
      );
    }
    const search = target.searchParams;
    const route = `${method} ${path.replace(/\/\d+(?=\/|$)/, '/:id')}`;
    const id = Number(path.match(/\/(\d+)(?=\/|$)/)?.[1]);
    switch (route) {
      case 'GET /api/version':
        return json(200, this.version);
      case 'GET /api/users/me':
        return json(200, this.user);
      case 'GET /api/config/timesheet':
        return json(200, {
          trackingMode: 'default',
          defaultBeginTime: 'now',
          activeEntriesHardLimit: this.hardLimit,
          isAllowFutureTimes: true,
          isAllowOverlapping: true,
        });
      case 'GET /api/timesheets/active':
        return json(
          200,
          this.running.map((entry) => this.expanded(entry)),
        );
      case 'GET /api/timesheets': {
        const begin = search.get('begin') ? fromLocal(search.get('begin')) : -Infinity;
        const size = Number(search.get('size')) || 50;
        const page = Number(search.get('page')) || 1;
        const items = this.entries
          .filter((entry) => Date.parse(entry.begin) >= begin)
          .sort((a, b) => Date.parse(b.begin) - Date.parse(a.begin) || b.id - a.id);
        const pages = Math.max(1, Math.ceil(items.length / size));
        return json(200, items.slice((page - 1) * size, page * size), {
          'x-page': String(page),
          'x-total-count': String(items.length),
          'x-total-pages': String(pages),
          'x-per-page': String(size),
        });
      }
      case 'GET /api/projects':
        return json(
          200,
          this.projects.filter((project) => project.visible),
        );
      case 'GET /api/activities': {
        const project = Number(search.get('project'));
        return json(
          200,
          this.activities.filter(
            (activity) =>
              activity.visible &&
              (activity.project === null || !project || activity.project === project),
          ),
        );
      }
      case 'GET /api/customers':
        return json(200, this.customers);
      case 'POST /api/timesheets': {
        const project = this.projects.find((item) => item.id === body?.project && item.visible);
        if (!project) {
          return invalid('project');
        }
        const activity = this.activities.find(
          (item) =>
            item.id === body?.activity && (item.project === null || item.project === project.id),
        );
        if (!activity) {
          return invalid('activity');
        }
        return json(
          200,
          this.startEntry({
            project: project.id,
            activity: activity.id,
            description: body.description ?? null,
          }),
        );
      }
      case 'PATCH /api/timesheets/:id/stop': {
        const entry = this.entry(id);
        if (!entry) {
          return json(404, { code: 404, message: 'Not Found' });
        }
        this.stopEntry(entry);
        return json(200, entry);
      }
      case 'PATCH /api/timesheets/:id/restart': {
        const entry = this.entry(id);
        if (!entry) {
          return json(404, { code: 404, message: 'Not Found' });
        }
        return json(
          200,
          this.startEntry({
            project: entry.project,
            activity: entry.activity,
            description: body?.copy === 'all' ? entry.description : null,
          }),
        );
      }
      default:
        return json(404, { code: 404, message: 'Not Found' });
    }
  }
}

/** A fake network: base URL → server; anything else does not answer. */
export function createNetwork(servers) {
  return {
    async request(url, options) {
      const origin = new URL(url).origin;
      const server = servers[origin];
      if (!server) {
        const error = new Error('connect EHOSTUNREACH');
        error.code = 'EHOSTUNREACH';
        throw error;
      }
      return server.handle(url, options);
    },
  };
}
