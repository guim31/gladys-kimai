// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and the fake
// Kimai built on real answers: states, scene events, the daily limit, the
// switch, the scene actions, errors and persistence under /data.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_CONFIG,
  FakeKimai,
  LEGACY,
  URL_1,
  createAll,
  createClock,
  createWorld,
  userId,
} from './helpers/world.js';

const MINUTE = 60_000;

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const state = (w, key) => w.fake.lastState(userId(w.gladys).feature(key));
const keys = (w) => w.fake.sceneEvents.map((event) => event.key);

test('the device shows the running timer and the hours of the day, week and month', async (t) => {
  const w = await world(t);
  await createAll(w);
  assert.equal(w.fake.discoveredDevices[0].name, 'Kimai tester');
  assert.equal(state(w, 'running'), 1);
  assert.equal(state(w, 'current'), 'Site web · Développement');
  assert.equal(state(w, 'running_duration'), 60);
  assert.equal(state(w, 'today'), 2.53); // 1 h 30 + 1 min + 1 min + 1 h running
  assert.equal(state(w, 'week'), 12.28); // + Wednesday 23:00 (1 h 30) + Tuesday (8 h 15)
  assert.equal(state(w, 'month'), 16.28); // + 15/10 (4 h); 30/09 left out
  assert.deepEqual(w.fake.transports.at(-1), {
    device_external_id: userId(w.gladys).device,
    transport: 'local',
  });
});

test('the tick moves the durations every minute without a request', async (t) => {
  const w = await world(t);
  const before = w.server.requests.length;
  w.clock.advance(5 * MINUTE);
  await w.hub.tick();
  assert.equal(state(w, 'running_duration'), 65);
  assert.equal(state(w, 'today'), 2.62);
  assert.equal(w.server.requests.length, before);
});

test('the week starts on Sunday when the Kimai user says so', async (t) => {
  const server = new FakeKimai({ now: createClock().now });
  server.user.preferences.find((item) => item.name === 'first_weekday').value = 'sunday';
  const w = await world(t, { server });
  // Thursday 22/10: from Sunday 18/10, the same entries as from Monday 19/10.
  assert.equal(state(w, 'week'), 12.28);
  const since = new URLSearchParams(
    server.requests.find((r) => r.path === '/api/timesheets').search,
  ).get('begin');
  assert.equal(since, '2026-09-30T00:00:00', 'the window starts a day before the month');
});

test('a timer started and stopped in Kimai fires the two triggers, once each', async (t) => {
  const w = await world(t);
  assert.deepEqual(keys(w), [], 'what runs at the first reading is not news');
  w.clock.advance(10 * MINUTE);
  w.server.stopEntry(w.server.entry(4));
  w.server.startEntry({ project: 2, activity: 3, description: 'Ticket 51' });
  await w.hub.poll();
  await w.hub.poll();
  assert.deepEqual(keys(w), ['timer_stopped', 'timer_started']);
  assert.deepEqual(w.fake.sceneEvents[0].data, {
    timesheet_id: 4,
    project_name: 'Site web',
    activity_name: 'Développement',
    customer_name: 'Acme SARL',
    description: 'Intégration Gladys',
    duration_minutes: 70,
  });
  assert.deepEqual(w.fake.sceneEvents[1].data, {
    timesheet_id: 100,
    project_name: 'Maintenance',
    activity_name: 'Support',
    customer_name: 'Acme SARL',
    description: 'Ticket 51',
  });
  assert.equal(state(w, 'current'), 'Maintenance · Support');
});

test('a restart neither repeats nor loses an event (state under /data)', async (t) => {
  const clock = createClock();
  const server = new FakeKimai({ now: clock.now });
  const first = await createWorld({ clock, server });
  await first.app.stop();

  clock.advance(15 * MINUTE);
  server.stopEntry(server.entry(4)); // stopped while the integration was down
  const second = await world(t, { clock, server, dataDir: first.dataDir });
  assert.deepEqual(keys(second), ['timer_stopped']);
  await second.app.stop();

  const third = await world(t, { clock, server, dataDir: first.dataDir });
  assert.deepEqual(keys(third), [], 'not fired again');
});

test('a refused event is tried again at the next reading', async (t) => {
  const w = await world(t);
  w.server.stopEntry(w.server.entry(4));
  const original = w.gladys.publishSceneEvent.bind(w.gladys);
  w.gladys.publishSceneEvent = async () => {
    throw new Error('503');
  };
  await w.hub.poll();
  w.gladys.publishSceneEvent = original;
  await w.hub.poll();
  assert.deepEqual(keys(w), ['timer_stopped']);
});

test('the daily limit fires once a day, from the tick, while the timer runs', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, daily_limit: '3:00' } });
  w.clock.advance(20 * MINUTE); // 2 h 52
  await w.hub.tick();
  assert.deepEqual(keys(w), []);
  w.clock.advance(8 * MINUTE); // 3 h 00
  await w.hub.tick();
  await w.hub.tick();
  await w.hub.poll();
  assert.deepEqual(keys(w), ['daily_limit_reached']);
  assert.deepEqual(w.fake.sceneEvents[0].data, {
    hours_today: 3,
    limit_hours: 3,
    running: true,
    project_name: 'Site web',
  });
  // The next day, again.
  w.clock.advance(24 * 60 * MINUTE);
  w.server.startEntry({ project: 1, activity: 1 });
  await w.hub.poll();
  w.clock.advance(3 * 60 * MINUTE);
  await w.hub.tick();
  assert.deepEqual(keys(w).filter((key) => key === 'daily_limit_reached').length, 2);
});

test('no daily limit: empty, 0 or not understood', async (t) => {
  for (const limit of ['', '0', 'beaucoup']) {
    const w = await world(t, { config: { ...BASE_CONFIG, daily_limit: limit } });
    w.clock.advance(23 * 60 * MINUTE);
    await w.hub.tick();
    assert.deepEqual(keys(w), [], limit);
  }
  const w = await world(t, { config: { ...BASE_CONFIG, daily_limit: 'beaucoup' } });
  const ack = await w.fake.action('test_connection', {});
  assert.match(ack.data.message.en, /Daily limit not understood/);
});

test('the switch stops the timer, and resumes the last entry', async (t) => {
  const w = await world(t);
  await createAll(w);
  const device = w.fake.discoveredDevices[0];
  const running = device.features.find((feature) => feature.external_id.endsWith(':running'));
  w.clock.advance(MINUTE);
  let ack = await w.fake.setValue(device, running, 0);
  assert.equal(ack.success, true, ack.error);
  assert.equal(w.server.running.length, 0);
  assert.equal(state(w, 'running'), 0);
  assert.equal(state(w, 'current'), 'No timer');

  w.clock.advance(MINUTE);
  ack = await w.fake.setValue(device, running, 1);
  assert.equal(ack.success, true, ack.error);
  const [resumed] = w.server.running;
  assert.deepEqual(
    [resumed.project, resumed.activity, resumed.description],
    [1, 1, 'Intégration Gladys'],
  );
  assert.equal(state(w, 'running'), 1);
  // Already on: nothing more starts.
  await w.fake.setValue(device, running, 1);
  assert.equal(w.server.entries.filter((entry) => entry.end === null).length, 1);
});

test('start_timer: names or numbers, the project activity first, the option to switch', async (t) => {
  const w = await world(t);
  let ack = await w.fake.sceneAction('start_timer', {
    project: 'maintenance',
    activity: 'SUPPORT',
  });
  assert.equal(ack.success, false, 'a timer runs and the option is not ticked');
  assert.match(ack.error, /already running/);
  assert.equal(w.server.entry(4).end, null, 'the running timer is kept');

  ack = await w.fake.sceneAction('start_timer', {
    project: 'maintenance',
    activity: 'SUPPORT',
    description: 'Arrivée au bureau',
    stop_running: true,
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    timesheet_id: 100,
    project_name: 'Maintenance',
    activity_name: 'Support',
  });
  assert.equal(w.server.entry(100).description, 'Arrivée au bureau');
  assert.notEqual(w.server.entry(4).end, null);

  await w.fake.sceneAction('stop_timer', {});
  ack = await w.fake.sceneAction('start_timer', { project: '#1', activity: '2' });
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.outputs.activity_name, 'Réunion');
});

test('start_timer refuses an unknown project, and an activity of another project', async (t) => {
  const w = await world(t);
  await w.fake.sceneAction('stop_timer', {});
  let ack = await w.fake.sceneAction('start_timer', { project: 'Jardin', activity: 'Support' });
  assert.match(ack.error, /No visible project/);
  ack = await w.fake.sceneAction('start_timer', { project: 'Site web', activity: 'Support' });
  assert.match(ack.error, /no activity with this name/);
  const site = w.server.projects.find((project) => project.name === 'Site web');
  w.server.projects.push({ ...site, id: 9, customer: 3 });
  ack = await w.fake.sceneAction('start_timer', { project: 'Site web', activity: 'Support' });
  assert.match(ack.error, /Several projects/);
  assert.equal(w.server.running.length, 0);
});

test('a refused entry tells the field Kimai refused', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, language: 'fr' } });
  await w.fake.sceneAction('stop_timer', {});
  // The project exists but Kimai refuses it (locked, budget…): its 400 is shown.
  w.server.projects[0].visible = true;
  const handle = w.server.handle.bind(w.server);
  w.server.handle = async (url, options) =>
    options?.method === 'POST'
      ? {
          status: 400,
          headers: {},
          body: JSON.stringify({
            code: 400,
            message: 'Validation Failed',
            errors: { children: { project: { errors: ['The selected choice is invalid.'] } } },
          }),
        }
      : handle(url, options);
  const ack = await w.fake.sceneAction('start_timer', { project: '1', activity: '1' });
  assert.equal(ack.error, 'Kimai a refusé la saisie : project (The selected choice is invalid.)');
});

test('stop_timer with nothing running is no error', async (t) => {
  const w = await world(t);
  let ack = await w.fake.sceneAction('stop_timer', {});
  assert.equal(ack.data.outputs.stopped, 1);
  assert.equal(ack.data.outputs.duration_minutes, 60);
  ack = await w.fake.sceneAction('stop_timer', {});
  assert.deepEqual(ack.data.outputs, {
    stopped: 0,
    duration_minutes: 0,
    project_name: '',
    activity_name: '',
  });
});

test('toggle_timer: stop, then resume, or start the project given', async (t) => {
  const w = await world(t);
  let ack = await w.fake.sceneAction('toggle_timer', {});
  assert.equal(ack.data.outputs.running, false);
  ack = await w.fake.sceneAction('toggle_timer', {});
  assert.equal(ack.data.outputs.running, true);
  assert.equal(ack.data.outputs.project_name, 'Site web');
  await w.fake.sceneAction('toggle_timer', {});
  ack = await w.fake.sceneAction('toggle_timer', { project: 'Maintenance', activity: 'Support' });
  assert.equal(ack.data.outputs.activity_name, 'Support');
  assert.equal(w.server.running[0].activity, 3);
});

test('two taps at once start one timer', async (t) => {
  const w = await world(t);
  await w.fake.sceneAction('stop_timer', {});
  const before = w.server.entries.length;
  const acks = await Promise.all([
    w.fake.sceneAction('toggle_timer', {}),
    w.fake.sceneAction('start_timer', { project: '1', activity: '1' }),
    w.fake.widgetAction('timer', 'resume'),
  ]);
  assert.ok(acks.some((ack) => ack.success));
  assert.equal(w.server.entries.length - before, 1, 'one entry created');
  assert.equal(w.server.running.length, 1);
});

test('Kimai allowing several timers: starting keeps the running one', async (t) => {
  const clock = createClock();
  const server = new FakeKimai({ now: clock.now });
  server.hardLimit = 3;
  const w = await world(t, { clock, server });
  const ack = await w.fake.sceneAction('start_timer', { project: '2', activity: '3' });
  assert.equal(ack.success, true, ack.error);
  assert.equal(server.running.length, 2);
  const stopped = await w.fake.sceneAction('stop_timer', {});
  assert.equal(stopped.data.outputs.stopped, 2);
});

test('the old API password works with the username', async (t) => {
  const w = await world(t, {
    config: { ...BASE_CONFIG, username: LEGACY.username, api_token: LEGACY.password },
  });
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('errors are told in the connection status, and the device goes unreachable', async (t) => {
  const cases = [
    [{ ...BASE_CONFIG, api_token: 'wrong' }, /API token refused/],
    [{ ...BASE_CONFIG, username: 'tester', api_token: 'wrong' }, /API token refused/],
    [{ ...BASE_CONFIG, url: 'http://192.0.2.99:8001' }, /does not answer/],
    [{ ...BASE_CONFIG, url: `${URL_1}/en/timesheet/` }, null],
    [{ ...BASE_CONFIG, url: 'ftp://nowhere' }, /Address not understood/],
    [{ ...BASE_CONFIG, url: '' }, /Enter the address/],
    [{ ...BASE_CONFIG, api_token: ' ' }, /Enter a Kimai API token/],
  ];
  for (const [config, expected] of cases) {
    const w = await world(t, { config });
    const status = w.fake.connectionStatus;
    if (expected === null) {
      assert.deepEqual(status, { connected: true }, config.url);
    } else {
      assert.equal(status.connected, false);
      assert.match(status.message.en, expected);
      assert.equal(Object.keys(status.message).length, 4);
    }
  }
  const w = await world(t);
  w.server.online = false;
  await w.hub.poll();
  assert.equal(w.fake.transports.at(-1).transport, 'unreachable');
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, false);
  assert.match(ack.error, /Kimai: Kimai does not answer/);
});

test('a page of the web app instead of the API is told as such', async (t) => {
  const w = await world(t);
  w.server.handle = async () => ({ status: 200, headers: {}, body: '<html></html>' });
  await w.hub.testConnection().catch(() => {});
  assert.match(w.fake.connectionStatus.message.en, /no Kimai API/);
});

test('every page of the entries is read', async (t) => {
  const clock = createClock();
  const server = new FakeKimai({ now: clock.now });
  for (let i = 0; i < 300; i += 1) {
    server.entries.push({
      ...server.entry(1),
      id: 1000 + i,
      begin: '2026-10-21T08:00:00+0200',
      end: '2026-10-21T08:01:00+0200',
      duration: 60,
    });
  }
  const w = await world(t, { clock, server });
  assert.equal(state(w, 'week'), 17.28); // + 300 minutes
  assert.equal(server.requests.filter((r) => r.path === '/api/timesheets').length, 2);
});

test('a reconfiguration to another user publishes another device', async (t) => {
  const w = await world(t);
  w.server.user = { ...w.server.user, id: 7, username: 'camille', alias: 'Camille' };
  w.server.token = 'token_of_camille';
  await w.fake.configUpdated({ ...BASE_CONFIG, api_token: 'token_of_camille', language: 'fr' });
  await w.app.ready;
  const last = w.fake.discoveredDevices.at(-1);
  assert.equal(last.name, 'Kimai Camille');
  assert.equal(last.external_id, userId(w.gladys, 7).device);
  assert.equal(last.features[0].name, 'Chrono en cours');
});

test('kimai.cloud is a cloud transport', async (t) => {
  const w = await world(t, {
    config: { ...BASE_CONFIG, url: 'demo.kimai.cloud' },
    origins: ['https://demo.kimai.cloud'],
  });
  assert.equal(w.hub.config.url, 'https://demo.kimai.cloud');
  assert.equal(w.fake.transports.at(-1).transport, 'cloud');
});

// --- Found by the review -------------------------------------------------------------

test('a partly refused batch fires again only the refused event', async (t) => {
  const w = await world(t);
  w.server.stopEntry(w.server.entry(4));
  w.server.startEntry({ project: 2, activity: 3 });
  const original = w.gladys.publishSceneEvent.bind(w.gladys);
  w.gladys.publishSceneEvent = async (key, data) => {
    if (key === 'timer_started') {
      throw new Error('503');
    }
    return original(key, data);
  };
  await w.hub.poll();
  w.gladys.publishSceneEvent = original;
  await w.hub.poll();
  assert.deepEqual(keys(w), ['timer_stopped', 'timer_started']);
});

test('a hidden project is still named, and its couple is no start button', async (t) => {
  const clock = createClock();
  const server = new FakeKimai({ now: clock.now });
  server.projects.find((project) => project.id === 2).visible = false;
  const w = await world(t, { clock, server });
  const reads = () => server.requests.filter((r) => r.path === '/api/projects').length;
  assert.equal(w.hub.label(w.hub.entries.find((entry) => entry.id === 8)), 'Maintenance · Support');
  assert.deepEqual(
    w.hub.recent().map((couple) => couple.projectId),
    [1],
  );
  // A deleted activity stays unknown: the catalog is not read again on every poll.
  server.entries.push({ ...server.entry(1), id: 50, activity: 99 });
  await w.hub.poll();
  const after = reads();
  await w.hub.poll();
  await w.hub.poll();
  assert.equal(reads(), after);
});

test('a timer started before the read window still fires its stop', async (t) => {
  const clock = createClock();
  const server = new FakeKimai({ now: clock.now });
  server.stopEntry(server.entry(4));
  // Forgotten since 25/09, before the window (from 30/09).
  server.entries.push({ ...server.entry(5), id: 60, begin: '2026-09-25T17:00:00+0200', end: null });
  const w = await world(t, { clock, server });
  assert.equal(state(w, 'running'), 1);
  server.stopEntry(server.entry(60));
  await w.hub.poll();
  assert.deepEqual(keys(w), ['timer_stopped']);
  assert.equal(w.fake.sceneEvents[0].data.timesheet_id, 60);
});

test('resume finds the last entry beyond the window', async (t) => {
  const clock = createClock(Date.UTC(2026, 11, 1, 8)); // 1/12, nothing since 22/10
  const server = new FakeKimai({ now: clock.now });
  server.stopEntry(server.entry(4));
  const w = await world(t, { clock, server });
  const ack = await w.fake.sceneAction('toggle_timer', {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(server.running[0].description, 'Intégration Gladys');
});

test('two toggles at once, several timers allowed: one starts, the second stops it', async (t) => {
  const clock = createClock();
  const server = new FakeKimai({ now: clock.now });
  server.hardLimit = 3;
  server.stopEntry(server.entry(4));
  const w = await world(t, { clock, server });
  const fields = { project: '1', activity: '1' };
  const acks = await Promise.all([
    w.fake.sceneAction('toggle_timer', fields),
    w.fake.sceneAction('toggle_timer', fields),
  ]);
  assert.deepEqual(
    acks.map((ack) => ack.data.outputs.running),
    [true, false],
  );
  assert.equal(server.running.length, 0);
  assert.equal(acks[1].data.outputs.stopped, undefined, 'not a declared output');
});

test('the limit reached by the estimate of a stopped timer is read first', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, daily_limit: '3' } });
  w.clock.advance(20 * MINUTE);
  w.server.stopEntry(w.server.entry(4)); // stopped in Kimai at 2 h 52
  w.clock.advance(10 * MINUTE);
  await w.hub.tick();
  assert.deepEqual(keys(w), ['timer_stopped'], 'no limit: the day ends at 2 h 52');
});

test('with the option ticked, a refused start keeps the running timer', async (t) => {
  const w = await world(t);
  const handle = w.server.handle.bind(w.server);
  w.server.handle = async (url, options) =>
    options?.method === 'POST'
      ? {
          status: 400,
          headers: {},
          body: JSON.stringify({ code: 400, message: 'Validation Failed' }),
        }
      : handle(url, options);
  const ack = await w.fake.sceneAction('start_timer', {
    project: '2',
    activity: '3',
    stop_running: true,
  });
  assert.equal(ack.success, false);
  assert.equal(w.server.entry(4).end, null);
});

test('a 429 slows the readings down instead of speeding them up', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, poll_interval: '60' } });
  w.server.handle = async () => ({ status: 429, headers: {}, body: '' });
  await w.hub.poll();
  assert.equal(w.hub.nextDelay(), 5 * 60_000);
});

test('the widget Resume on a running timer says it already runs', async (t) => {
  const w = await world(t);
  const ack = await w.fake.widgetAction('timer', 'resume');
  assert.equal(ack.data.message.en, 'Timer already running: Site web · Développement.');
});
