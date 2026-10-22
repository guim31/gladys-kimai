// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only. A normal reading writes nothing, a failure that repeats is logged
// once, and its end once. Never the API token.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOKEN, createClock, createWorld } from './helpers/world.js';

function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  t.mock.method(console, 'warn', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

async function world(t, options = {}) {
  const w = await createWorld({ clock: createClock(), ...options });
  t.after(() => w.app.stop());
  return w;
}

test('a normal reading cycle writes nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  assert.ok(
    logs.texts().some((text) => text.includes('Connected to Kimai')),
    'the start is logged',
  );
  logs.clear();
  for (let i = 0; i < 5; i += 1) {
    w.clock.advance(2 * 60_000);
    w.server.entry(1).description = `Maquette ${i}`;
    await w.hub.poll();
    await w.hub.tick();
  }
  assert.deepEqual(logs.texts(), []);
});

test('an outage is logged once, and once when Kimai is back', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.server.online = false;
  for (let i = 0; i < 6; i += 1) {
    w.clock.advance(60_000);
    await w.hub.poll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  logs.clear();
  w.server.online = true;
  await w.hub.poll();
  await w.hub.poll();
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /answers again after 5 min/);
});

test('a command from Gladys writes one line; never the token, even at debug', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await world(t);
  await w.fake.sceneAction('stop_timer', {});
  w.server.online = false;
  await w.hub.poll();
  const text = logs.texts().join('\n');
  assert.match(text, /1 timer\(s\) stopped from Gladys/);
  assert.ok(!text.includes(TOKEN), 'never the token');

  const refused = await world(t, {
    config: { url: 'http://192.0.2.20:8001', api_token: 'secret_wrong_token' },
  });
  await refused.hub.poll();
  const legacy = await world(t, {
    config: { url: 'http://192.0.2.20:8001', username: 'tester', api_token: 'secret_wrong_pw' },
  });
  await legacy.hub.poll();
  const all = logs.texts().join('\n');
  assert.ok(!all.includes('secret_wrong_token'), 'never a refused token');
  assert.ok(!all.includes('secret_wrong_pw'), 'never an API password');
});
