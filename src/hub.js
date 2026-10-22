// -----------------------------------------------------------------------------
// The Kimai hub: reads the running timer and the entries of the month on a
// timer of the container, publishes the device states when they change,
// fires the scene events (a timer started, a timer stopped, the daily limit
// reached), and starts or stops timers for the switch, the widget and the
// scene actions.
//
// Gladys never polls the device (should_poll: false): the scene events must
// fire even when no device was added, and a device created without
// should_poll is never polled (GladysAssistant/Gladys#3198). Between two
// readings, a tick every minute moves the running duration, the hours of the
// day and the daily limit forward from what is known, without a request.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { hostOf } from './config.js';
import { FEATURE_KEYS, buildUserDevice, featureStates, userIds } from './devices.js';
import { ERROR_KINDS, KimaiClient, KimaiError } from './kimai/client.js';
import {
  findByIdOrName,
  localDateTime,
  parseNamed,
  parseTimesheets,
  periods,
  recentCouples,
  resolveTimeZone,
  summarize,
  workedSeconds,
} from './kimai/model.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  DONE_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  allLanguages,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'kimai-hub' });

export const WIDGET_KEY = 'timer';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  STARTED: 'timer_started',
  STOPPED: 'timer_stopped',
  DAILY_LIMIT: 'daily_limit_reached',
});

export const HUB_TIMINGS = {
  // A failed read is tried again this soon, whatever the interval.
  retryMs: 30_000,
  // The tick without request: running duration, hours of the day, limit.
  tickMs: 60_000,
  // Projects, activities and customers are read again this often (and as
  // soon as an entry names one not known yet).
  catalogMs: 30 * 60_000,
  // Re-send unchanged values this often: Gladys shows "no recent value" after 48 h.
  heartbeatMs: 12 * 60 * 60_000,
  // After a 429, the next reading waits at least this long.
  rateLimitMs: 5 * 60_000,
  // A start this old when first seen (Gladys or the integration was down) fires nothing.
  maxLateMs: 60 * 60_000,
};

// The reading after a command is awaited at most this long: the scene action,
// the widget button and the switch answer within their time limits.
const REFRESH_WAIT_MS = 3_000;
const RECENT_COUPLES = 4;
const NO_DESCRIPTION = '';

export class KimaiHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/kimai/http.js)
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   * @param {string} [options.timeZone] defaults to TZ, set by the Gladys supervisor
   */
  constructor({ gladys, store, request, timers = true, timings, now, timeZone }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.timeZone = resolveTimeZone(timeZone ?? process.env.TZ);
    this.config = null;
    this.client = null;
    this.reset();
    this.saved = { scope: null, active: [], limitDay: 0 };
    this.connection = null;
    this.devicesSignature = null;
    this.widgetSignature = null;
    this.transport = null;
    this.timer = null;
    this.ticker = null;
    this.polling = null;
    this.commands = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  reset() {
    /** The user of the token: `{ id, username, alias, timeZone, firstWeekday }`. */
    this.user = null;
    this.version = null;
    this.hardLimit = 1;
    /** Entries that began since the start of the week or month, most recent first. */
    this.entries = [];
    /** The running entries (usually one). */
    this.active = [];
    this.projects = new Map();
    this.activities = new Map();
    this.customers = new Map();
    this.catalogAt = 0;
    this.catalogMissing = new Set();
    this.error = null;
    this.downSince = null;
    this.readAt = 0;
    this.connectedLogged = false;
  }

  // --- Logs ------------------------------------------------------------------
  // Info keeps the lifecycle only (connected, lost, back, user commands). A
  // problem that repeats is logged once, then at debug until it clears.

  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  get language() {
    return this.config?.language ?? 'en';
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = {
      scope: typeof saved.scope === 'string' ? saved.scope : null,
      active: Array.isArray(saved.active) ? saved.active.filter(Number.isInteger) : [],
      limitDay: Number.isFinite(saved.limitDay) ? saved.limitDay : 0,
    };
    await this.reconfigure(config);
    if (this.timersEnabled && !this.ticker) {
      this.ticker = setInterval(() => {
        this.tick().catch((err) => this.problem('tick', 'Tick failed', err, 'error'));
      }, this.timings.tickMs);
    }
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.connection = null;
    this.devicesSignature = null;
    this.transport = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const same =
      previous &&
      previous.url === config.url &&
      previous.token === config.token &&
      previous.username === config.username &&
      previous.allowSelfSigned === config.allowSelfSigned;
    if (!same) {
      this.reset();
      this.transport = null;
      this.client =
        config.url && config.token
          ? new KimaiClient({
              url: config.url,
              token: config.token,
              username: config.username,
              insecure: config.allowSelfSigned,
              request: this.request,
            })
          : null;
    }
    // A new language: the device is published again.
    this.devicesSignature = null;
    this.gladys.forgetPublishedStates?.();
    await this.poll();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearInterval(this.ticker);
    await this.polling?.catch(() => {});
    await this.store.flush();
  }

  schedule(delay) {
    clearTimeout(this.timer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.timer = setTimeout(() => {
      this.poll().catch((err) => this.problem('poll', 'Reading failed', err, 'error'));
    }, delay);
  }

  nextDelay() {
    const interval = this.config.pollIntervalMs;
    if (this.error?.kind === ERROR_KINDS.RATE_LIMIT) {
      // Kimai limits the requests (the old API password above all): slow down.
      return Math.max(interval, this.timings.rateLimitMs);
    }
    return this.error ? Math.min(interval, this.timings.retryMs) : interval;
  }

  // --- Reading ---------------------------------------------------------------

  /** One reading at a time: a call during a reading waits for it, then reads. */
  poll() {
    const run = async () => {
      try {
        await this.read();
      } finally {
        this.schedule(this.nextDelay());
      }
    };
    this.polling = (this.polling ?? Promise.resolve()).catch(() => {}).then(run);
    return this.polling;
  }

  async read() {
    if (!this.client) {
      await this.publishConnectionStatus();
      return;
    }
    const now = this.now();
    const { client } = this;
    try {
      let { user, version, hardLimit } = this;
      if (!user) {
        const [me, about, settings] = await Promise.all([
          client.me(),
          client.version(),
          client.timesheetConfig(),
        ]);
        user = parseUser(me, this.timeZone);
        version = about.version;
        hardLimit = Number.isInteger(settings.activeEntriesHardLimit)
          ? settings.activeEntriesHardLimit
          : 1;
      }
      const begin = localDateTime(this.windowStartFor(user, now), user.timeZone);
      const [active, entries] = await Promise.all([client.active(), client.timesheets(begin)]);
      if (client !== this.client) {
        // The configuration changed during the reading: the new one is being read.
        return;
      }
      Object.assign(this, { user, version, hardLimit });
      this.learnNames(active);
      this.active = parseTimesheets(active);
      this.entries = mergeEntries(parseTimesheets(entries), this.active);
      await this.refreshCatalog(now);
      this.readAt = now;
      this.recovered(now);
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      this.failed(err, now);
    }
    if (this.readAt !== 0) {
      await this.publishDevices();
      if (!this.error) {
        await this.fireEvents(now);
        await this.publishStates();
      }
    }
    await this.publishTransports();
    await this.publishConnectionStatus();
    this.refreshWidget();
  }

  /**
   * The window read: from the start of the week or of the month, a day early
   * (the time zone of the Kimai user may be ahead of the one of Gladys).
   */
  windowStartFor(user, now) {
    const p = periods(now, this.timeZone, user.firstWeekday);
    return Math.min(p.week.start, p.month.start) - 24 * 60 * 60_000;
  }

  /** The names carried by GET /api/timesheets/active (objects there). */
  learnNames(rawActive) {
    for (const entry of Array.isArray(rawActive) ? rawActive : []) {
      const project = entry?.project;
      const activity = entry?.activity;
      if (project && typeof project === 'object') {
        this.projects.set(project.id, ...parseNamed([project], 'customer'));
        const customer = project.customer;
        if (customer && typeof customer === 'object') {
          this.customers.set(customer.id, ...parseNamed([customer]));
        }
      }
      if (activity && typeof activity === 'object') {
        this.activities.set(activity.id, ...parseNamed([activity], 'project'));
      }
    }
  }

  /** Projects, activities and customers: every half hour, or for an unknown id. */
  async refreshCatalog(now) {
    const unknown = this.entries
      .filter(
        (entry) => !this.projects.has(entry.projectId) || !this.activities.has(entry.activityId),
      )
      .map((entry) => `${entry.projectId}/${entry.activityId}`)
      .filter((key) => !this.catalogMissing.has(key));
    if (unknown.length === 0 && now - this.catalogAt < this.timings.catalogMs) {
      // An id still unknown after a reading (deleted) waits for the next half hour.
      return;
    }
    const [projects, activities, customers] = await Promise.all([
      this.client.projects(),
      this.client.activities(),
      this.client.customers(),
    ]);
    const byId = (list) => new Map(list.map((item) => [item.id, item]));
    this.projects = byId(parseNamed(projects, 'customer'));
    this.activities = byId(parseNamed(activities, 'project'));
    this.customers = byId(parseNamed(customers));
    this.catalogAt = now;
    this.catalogMissing = new Set(
      this.entries
        .filter(
          (entry) => !this.projects.has(entry.projectId) || !this.activities.has(entry.activityId),
        )
        .map((entry) => `${entry.projectId}/${entry.activityId}`),
    );
  }

  recovered(now) {
    const host = hostOf(this.config.url);
    if (this.warned.has('read')) {
      // Also after a reconfiguration (which resets `downSince`): the next
      // outage must be logged again.
      const minutes =
        this.downSince === null ? '' : ` after ${Math.round((now - this.downSince) / 60_000)} min`;
      this.resolved('read', `Kimai at ${host} answers again${minutes}`);
    }
    if (!this.connectedLogged) {
      this.connectedLogged = true;
      logger.info(
        `Connected to Kimai ${this.version} at ${host} as ${this.user.username}: ${this.active.length} timer(s) running`,
      );
    }
    this.error = null;
    this.downSince = null;
  }

  failed(err, now) {
    const kind = err instanceof KimaiError ? err.kind : ERROR_KINDS.HTTP;
    this.error = { kind, message: err.message };
    this.downSince ??= now;
    this.problem('read', `Kimai at ${hostOf(this.config.url)}: ${err.message}`, undefined, 'error');
  }

  // --- What Gladys shows -------------------------------------------------------

  projectName(id) {
    return this.projects.get(id)?.name ?? `#${id}`;
  }

  activityName(id) {
    return this.activities.get(id)?.name ?? `#${id}`;
  }

  customerName(projectId) {
    const customerId = this.projects.get(projectId)?.parentId;
    return customerId ? (this.customers.get(customerId)?.name ?? '') : '';
  }

  /** "Project · Activity". */
  label(entry) {
    return `${this.projectName(entry.projectId)} · ${this.activityName(entry.activityId)}`;
  }

  /** The running entry shown (the most recent one when several run). */
  get running() {
    return this.active[0] ?? null;
  }

  /** What the device, the widget and the limit read, at `now`. */
  view(now = this.now()) {
    const running = this.running;
    const totals = summarize(this.entries, {
      now,
      periods: periods(now, this.timeZone, this.user?.firstWeekday),
    });
    return {
      running,
      label: running ? this.label(running) : null,
      runningSeconds: running ? workedSeconds(running, now) : 0,
      ...totals,
    };
  }

  /** The last project/activity couples, the running one left out. */
  recent() {
    const running = this.running;
    return recentCouples(this.entries, RECENT_COUPLES + 1)
      .filter(
        (couple) =>
          !running ||
          couple.projectId !== running.projectId ||
          couple.activityId !== running.activityId,
      )
      .filter((couple) => this.projects.get(couple.projectId)?.visible !== false)
      .slice(0, RECENT_COUPLES)
      .map((couple) => ({
        ...couple,
        label: `${this.projectName(couple.projectId)} · ${this.activityName(couple.activityId)}`,
      }));
  }

  /** The entry "resume" restarts: the most recent stopped one. */
  lastStopped() {
    return this.entries.find((entry) => entry.end !== null) ?? null;
  }

  // --- Publishing to Gladys --------------------------------------------------

  ids() {
    return userIds(this.gladys, this.user.id);
  }

  devices() {
    return this.user ? [buildUserDevice(this.gladys, this.user, this.language)] : [];
  }

  async publishDevices() {
    const devices = this.devices();
    const signature = JSON.stringify(devices);
    if (devices.length === 0 || signature === this.devicesSignature) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesSignature = signature;
      this.resolved('devices');
    } catch (err) {
      this.problem('devices', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab. */
  async rediscover() {
    this.devicesSignature = null;
    await this.poll();
  }

  /** The user added a device: the states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    this.gladys.forgetPublishedStates?.(device?.external_id);
    if (!this.error && this.readAt !== 0) {
      await this.publishStates();
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  async publishStates(now = this.now()) {
    if (!this.user) {
      return;
    }
    try {
      // Only the changes, and every value again after `heartbeatMs`.
      await this.gladys.publishChangedStates(
        featureStates(this.ids(), this.view(now), this.language),
        { heartbeat: this.timings.heartbeatMs },
      );
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  /** Every minute, without a request: durations, hours of the day, the limit. */
  async tick() {
    if (this.error || this.readAt === 0 || !this.user) {
      return;
    }
    const now = this.now();
    if (this.running && this.limitDue(now)) {
      // Reached only by the running timer, estimated since the last reading:
      // read first, it may have been stopped in Kimai meanwhile.
      await this.poll();
      return;
    }
    await this.publishStates(now);
  }

  async publishTransports() {
    if (this.readAt === 0 || !this.user) {
      return;
    }
    const cloud = /(^|\.)kimai\.cloud$/i.test(new URL(this.config.url).hostname);
    const transport = this.error
      ? DEVICE_TRANSPORTS.UNREACHABLE
      : cloud
        ? DEVICE_TRANSPORTS.CLOUD
        : DEVICE_TRANSPORTS.LOCAL;
    if (this.transport === transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([{ external_id: this.ids().device, transport }]);
      this.transport = transport;
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  connectionStatus() {
    if (!this.config.url) {
      return {
        connected: false,
        message: this.config.urlTyped ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noUrl,
      };
    }
    if (!this.config.token) {
      return { connected: false, message: CONNECTION_TEXT.noToken };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  refreshWidget() {
    const signature = JSON.stringify([
      this.error?.kind ?? null,
      this.active.map((entry) => entry.id),
      this.recent(),
      this.view().todaySeconds > 0,
    ]);
    if (signature !== this.widgetSignature) {
      this.widgetSignature = signature;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  // --- Scene events ----------------------------------------------------------

  scope() {
    return `${this.config.url}|${this.user.id}`;
  }

  save(changes) {
    this.saved = { ...this.saved, ...changes };
    this.store.save(this.saved);
  }

  /**
   * The timers started and stopped since the previous successful reading
   * (persisted under /data, so a restart neither repeats nor loses one), and
   * the daily limit.
   */
  async fireEvents(now) {
    const scope = this.scope();
    const activeIds = this.active.map((entry) => entry.id);
    if (this.saved.scope !== scope) {
      // First reading of this user: what already runs, or is already over
      // the limit, is not news.
      const view = this.view(now);
      const over =
        this.config.dailyLimitSeconds !== null &&
        view.todaySeconds >= this.config.dailyLimitSeconds;
      this.save({
        scope,
        active: activeIds,
        limitDay: over ? periods(now, this.timeZone).day.start : 0,
      });
      return;
    }
    // Updated event by event: one refused (Gladys restarting?) is tried again
    // at the next reading, the ones delivered are not.
    const known = new Set(this.saved.active);
    const current = new Set(activeIds);
    for (const id of this.saved.active) {
      if (current.has(id)) {
        continue;
      }
      // Gone from the active list: stopped, or deleted (then nothing fires).
      const entry = await this.stoppedEntry(id);
      if (entry === undefined) {
        continue; // Kimai did not answer: tried again at the next reading
      }
      if (
        entry === null ||
        (await this.fire(TRIGGERS.STOPPED, {
          ...this.eventData(entry),
          duration_minutes: Math.floor(entry.duration / 60),
        }))
      ) {
        known.delete(id);
      }
    }
    for (const entry of [...this.active].reverse()) {
      if (known.has(entry.id)) {
        continue;
      }
      if (
        entry.begin < now - this.timings.maxLateMs ||
        (await this.fire(TRIGGERS.STARTED, this.eventData(entry)))
      ) {
        known.add(entry.id);
      }
    }
    this.save({ active: [...known] });
    await this.checkDailyLimit(now);
  }

  /**
   * A stopped entry: from the window, or asked to Kimai when it began before
   * it (a timer forgotten over a weekend). Null when deleted, undefined when
   * Kimai did not answer.
   */
  async stoppedEntry(id) {
    const known = this.entries.find((item) => item.id === id);
    if (known) {
      return known.end !== null ? known : null;
    }
    try {
      const [entry] = parseTimesheets([await this.client.timesheet(id)]);
      return entry && entry.end !== null ? entry : null;
    } catch (err) {
      if (err instanceof KimaiError && (err.status === 404 || err.status === 403)) {
        return null;
      }
      return undefined;
    }
  }

  /** The daily limit is passed today and has not fired yet. */
  limitDue(now) {
    const limit = this.config.dailyLimitSeconds;
    if (limit === null || this.saved.scope !== this.scope()) {
      return false;
    }
    const day = periods(now, this.timeZone).day.start;
    return this.saved.limitDay !== day && this.view(now).todaySeconds >= limit;
  }

  async checkDailyLimit(now) {
    if (!this.limitDue(now)) {
      return;
    }
    const limit = this.config.dailyLimitSeconds;
    const day = periods(now, this.timeZone).day.start;
    const { todaySeconds } = this.view(now);
    const fired = await this.fire(TRIGGERS.DAILY_LIMIT, {
      hours_today: Math.round((todaySeconds / 3600) * 100) / 100,
      limit_hours: Math.round((limit / 3600) * 100) / 100,
      running: this.running !== null,
      project_name: this.running ? this.projectName(this.running.projectId) : '',
    });
    if (fired) {
      this.save({ limitDay: day });
    }
  }

  eventData(entry) {
    return {
      timesheet_id: entry.id,
      project_name: this.projectName(entry.projectId),
      activity_name: this.activityName(entry.activityId),
      customer_name: this.customerName(entry.projectId),
      description: entry.description.slice(0, 1000),
    };
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
      return true;
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
      return false;
    }
  }

  // --- Commands --------------------------------------------------------------

  /** A Kimai error, in words for the user (the server's text stays in the logs). */
  explain(err) {
    if (!(err instanceof KimaiError)) {
      return err;
    }
    const language = this.language;
    const colon = language === 'fr' ? ' : ' : ': ';
    if (err.status === 400) {
      // A refused entry: the field and Kimai's own words (in English).
      const detail = err.fields.map(({ field, message }) => `${field} (${message})`).join(', ');
      return new Error(
        `${pick(ACTION_TEXT.refused, language)}${detail ? `${colon}${detail}` : ''}`.slice(0, 200),
        { cause: err },
      );
    }
    const status = err.status ? ` (HTTP ${err.status})` : '';
    return new Error(`Kimai${colon}${pick(ERROR_TEXT[err.kind], language)}${status}`, {
      cause: err,
    });
  }

  requireClient() {
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.notConfigured, this.language));
    }
    return this.client;
  }

  /** One command at a time: two taps must not start two timers. */
  command(run) {
    const next = (this.commands ?? Promise.resolve()).catch(() => {}).then(run);
    this.commands = next;
    return next;
  }

  /** Read again now, and wait for it a little (the toast should not lag). */
  async refreshSoon() {
    const refresh = this.poll().catch(() => {});
    let timer;
    await Promise.race([
      refresh,
      new Promise((resolve) => {
        timer = setTimeout(resolve, REFRESH_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
  }

  /** A fresh list of the running entries (the device may be a minute late). */
  async freshActive(client) {
    const raw = await client.active();
    this.learnNames(raw);
    return parseTimesheets(raw);
  }

  // The commands: each public one runs in the queue (`command`); the `…Now`
  // versions run inside it, so `toggle` decides and acts in one turn.

  /** Stop every running timer. */
  stopTimers() {
    return this.command(() => this.stopNow());
  }

  /**
   * @returns {Promise<{ stopped: Array<{ entry: object, label: string, projectName: string,
   *   activityName: string, minutes: number }> }>}
   */
  async stopNow(running) {
    const client = this.requireClient();
    const stopped = [];
    try {
      for (const entry of running ?? (await this.freshActive(client))) {
        const [done] = parseTimesheets([await client.stop(entry.id)]);
        const final = done ?? entry;
        stopped.push({
          entry: final,
          label: this.label(final),
          projectName: this.projectName(final.projectId),
          activityName: this.activityName(final.activityId),
          minutes: Math.floor(workedSeconds(final, this.now()) / 60),
        });
      }
    } catch (err) {
      throw this.explain(err);
    }
    if (stopped.length > 0) {
      logger.info(`${stopped.length} timer(s) stopped from Gladys`);
      await this.refreshSoon();
    }
    return { stopped };
  }

  /** Find a visible project by number or name. */
  async findProject(client, query) {
    const projects = parseNamed(await client.projects(), 'customer').filter((p) => p.visible);
    const { item, reason } = findByIdOrName(projects, query);
    if (!item) {
      const key = { empty: 'emptyProject', ambiguous: 'projectAmbiguous' }[reason];
      throw new Error(pick(ACTION_TEXT[key ?? 'projectNotFound'], this.language));
    }
    this.projects.set(item.id, item);
    return item;
  }

  /** Find an activity the project accepts (its own, or a global one), by number or name. */
  async findActivity(client, project, query) {
    const activities = parseNamed(await client.activities(project.id), 'project').filter(
      (activity) =>
        activity.visible && (activity.parentId === 0 || activity.parentId === project.id),
    );
    let { item, reason } = findByIdOrName(activities, query);
    if (!item && reason === 'ambiguous') {
      // A project activity and a global one of the same name: the project's.
      ({ item } = findByIdOrName(
        activities.filter((activity) => activity.parentId === project.id),
        query,
      ));
    }
    if (!item) {
      const key = { empty: 'emptyActivity', ambiguous: 'activityAmbiguous' }[reason];
      throw new Error(pick(ACTION_TEXT[key ?? 'activityNotFound'], this.language));
    }
    this.activities.set(item.id, item);
    return item;
  }

  /**
   * Start a timer on a project and an activity (names or numbers).
   * @param {object} options
   * @param {unknown} options.project
   * @param {unknown} options.activity
   * @param {unknown} [options.description]
   * @param {boolean} [options.stopRunning] stop the running timer first; when
   *   false and Kimai allows one timer at a time, a running timer is kept and
   *   nothing starts (an error says so)
   */
  startTimer(options) {
    return this.command(() => this.startNow(options));
  }

  async startNow({ project, activity, description, stopRunning = false }) {
    const client = this.requireClient();
    let entry;
    try {
      const foundProject = await this.findProject(client, project);
      const foundActivity = await this.findActivity(client, foundProject, activity);
      const running = await this.freshActive(client);
      if (running.length > 0) {
        if (!stopRunning && running.length >= this.hardLimit) {
          throw new Error(pick(ACTION_TEXT.alreadyRunning, this.language));
        }
        if (stopRunning && this.hardLimit > 1) {
          // With one timer at a time, Kimai stops the running one itself, and
          // only if the new one is accepted: a refused start loses nothing.
          for (const item of running) {
            await client.stop(item.id);
          }
        }
      }
      const text =
        String(description ?? '')
          .trim()
          .slice(0, 1000) || NO_DESCRIPTION;
      [entry] = parseTimesheets([
        await client.start({
          project: foundProject.id,
          activity: foundActivity.id,
          description: text,
        }),
      ]);
    } catch (err) {
      throw this.explain(err);
    }
    logger.info(`Timer #${entry?.id} started from Gladys`);
    await this.refreshSoon();
    return this.started(entry);
  }

  /** Resume the last stopped entry: a new timer, same project, activity and description. */
  resumeLast() {
    return this.command(() => this.resumeNow());
  }

  async resumeNow() {
    const client = this.requireClient();
    let entry;
    try {
      const running = await this.freshActive(client);
      if (running.length > 0) {
        // Already running: nothing to do (the switch is already on).
        return { ...this.started(running[0]), already: true };
      }
      if (this.readAt === 0) {
        await this.poll();
      }
      // Nothing stopped in the window (a holiday, the 1st of the month after
      // a weekend): the last entries, whatever their date.
      const last =
        this.lastStopped() ??
        parseTimesheets(await client.latest()).find((item) => item.end !== null);
      if (!last) {
        throw new Error(pick(ACTION_TEXT.nothingToResume, this.language));
      }
      [entry] = parseTimesheets([await client.restart(last.id)]);
    } catch (err) {
      throw this.explain(err);
    }
    logger.info(`Timer #${entry?.id} resumed from Gladys`);
    await this.refreshSoon();
    return this.started(entry);
  }

  started(entry) {
    const fallback = { id: 0, projectId: 0, activityId: 0 };
    const item = entry ?? fallback;
    return {
      entry: item,
      projectName: this.projectName(item.projectId),
      activityName: this.activityName(item.activityId),
      label: this.label(item),
    };
  }

  /** Stop when a timer runs; otherwise start the project and activity given, or resume. */
  toggle({ project, activity, description } = {}) {
    return this.command(async () => {
      const running = await this.freshActive(this.requireClient()).catch((err) => {
        throw this.explain(err);
      });
      if (running.length > 0) {
        return { running: false, ...(await this.stopNow(running)) };
      }
      const given = String(project ?? '').trim() !== '' || String(activity ?? '').trim() !== '';
      const started = given
        ? await this.startNow({ project, activity, description })
        : await this.resumeNow();
      return { running: true, started };
    });
  }

  /** The switch of the device: 1 resumes the last entry, 0 stops the timer. */
  async setRunning(value) {
    if (Number(value) === 1) {
      await this.resumeLast();
    } else {
      await this.stopTimers();
    }
  }

  isRunningFeature(feature) {
    return Boolean(this.user) && feature?.external_id === this.ids().feature(FEATURE_KEYS.RUNNING);
  }

  /** The toast of a command, in the four languages. */
  static startedMessage(label, already = false) {
    return allLanguages((language) =>
      DONE_TEXT[language][already ? 'already' : 'started'](label).slice(0, 200),
    );
  }

  static stoppedMessage(stopped) {
    return allLanguages((language) => {
      if (stopped.length === 0) {
        return DONE_TEXT[language].none;
      }
      const { label, minutes } = stopped[0];
      return DONE_TEXT[language].stopped(label, minutes).slice(0, 200);
    });
  }

  /** The "Test the connection" action: read now, report. */
  async testConnection() {
    this.user = null;
    await this.poll();
    const status = this.connectionStatus();
    if (!status.connected) {
      const message = allLanguages((language) =>
        REPORT_TEXT[language].failed(pick(status.message, language)),
      );
      throw new Error(message[this.language]);
    }
    const minutes = Math.floor(this.view().todaySeconds / 60);
    return allLanguages((language) => {
      const report = REPORT_TEXT[language];
      const name = this.user.alias || this.user.username;
      const ok = report.ok(this.version, name, minutes);
      return this.config.dailyLimitInvalid ? `${ok} ${report.badLimit}` : ok;
    });
  }
}

/** The user of GET /api/users/me: id, names, time zone, first weekday. */
function parseUser(raw, fallbackTimeZone) {
  const preference = (name) =>
    (Array.isArray(raw.preferences) ? raw.preferences : []).find((item) => item?.name === name)
      ?.value;
  const firstWeekday = preference('first_weekday') === 'sunday' ? 'sunday' : 'monday';
  const username = typeof raw.username === 'string' && raw.username ? raw.username : `#${raw.id}`;
  return {
    id: raw.id,
    username,
    alias: typeof raw.alias === 'string' ? raw.alias.trim() : '',
    timeZone: resolveTimeZone(raw.timezone || fallbackTimeZone),
    firstWeekday,
  };
}

/** The window's entries, plus the running ones that began before it. */
function mergeEntries(entries, active) {
  const ids = new Set(entries.map((entry) => entry.id));
  return [...entries, ...active.filter((entry) => !ids.has(entry.id))].sort(
    (a, b) => b.begin - a.begin || b.id - a.id,
  );
}
