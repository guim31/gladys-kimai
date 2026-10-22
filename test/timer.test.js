// -----------------------------------------------------------------------------
// The timers of the container. Gladys never polls a device published with
// should_poll: false (nor one created without should_poll,
// GladysAssistant/Gladys#3198): Kimai must be read by the hub's own timer,
// with no onPoll at all, and the durations move every minute between two
// readings.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_CONFIG, createAll, createClock, createWorld, userId } from './helpers/world.js';

const settle = async () => {
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const reads = (server) => server.requests.filter((r) => r.path === '/api/timesheets').length;

test('the internal timer reads Kimai without any onPoll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const clock = createClock();
  const w = await createWorld({
    clock,
    config: { ...BASE_CONFIG, poll_interval: '120' },
    timers: true,
  });
  t.after(() => w.app.stop());
  await createAll(w);
  assert.equal(w.fake.discoveredDevices[0].should_poll, false, 'Gladys is not asked to poll');

  const before = reads(w.server);
  for (let i = 0; i < 6; i += 1) {
    clock.advance(60_000);
    t.mock.timers.tick(60_000);
    await settle();
  }
  assert.equal(reads(w.server) - before, 3, 'one reading per interval');
  assert.equal(w.fake.lastState(userId(w.gladys).feature('running_duration')), 66);
});

test('a timer stopped elsewhere is seen at the next reading', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const clock = createClock();
  const w = await createWorld({
    clock,
    config: { ...BASE_CONFIG, poll_interval: '30' },
    timers: true,
  });
  t.after(() => w.app.stop());
  w.server.stopEntry(w.server.entry(4));
  clock.advance(30_000);
  t.mock.timers.tick(30_000);
  await settle();
  assert.deepEqual(
    w.fake.sceneEvents.map((event) => event.key),
    ['timer_stopped'],
  );
});

test('the timers stop with the integration', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const w = await createWorld({ timers: true });
  await w.app.stop();
  const before = w.server.requests.length;
  const states = w.fake.states.length;
  t.mock.timers.tick(60 * 60_000);
  await settle();
  assert.equal(w.server.requests.length, before);
  assert.equal(w.fake.states.length, states);
});
