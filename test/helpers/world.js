// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Kimai on a fake
// network, a temporary /data, a manual clock and the Paris time zone, with
// the integration wired on top through registerHandlers. No timer runs unless
// `timers: true` (with node:test mock timers): the tests read Vikunja with
// `world.hub.poll()`, and tick with `world.hub.tick()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { FakeKimai, LEGACY, TOKEN, createNetwork } from './fakeKimai.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const URL_1 = 'http://192.0.2.20:8001';
export const TIME_ZONE = 'Europe/Paris';
// The fixtures were captured on 22/10/2026 at 02:42 Paris time, timer #4
// running since 02:42; the tests start an hour later, at 03:42 Paris (01:42
// UTC): 2 h 32 today (1 h 30 + 1 min + 1 min + 1 h running), 12 h 17 this
// week, 16 h 17 this month.
export const START = Date.UTC(2026, 9, 22, 1, 42, 0);

export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const BASE_CONFIG = { url: URL_1, api_token: TOKEN, language: 'en' };

/**
 * @param {object} [options]
 * @param {FakeKimai} [options.server]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {string[]} [options.origins] other base URLs answered by the same server
 */
export async function createWorld({
  clock = createClock(),
  server,
  config = BASE_CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-kimai-')),
  timings = {},
  timers = false,
  origins = [],
} = {}) {
  const kimai = server ?? new FakeKimai({ now: clock.now });
  // `origins`: other addresses of the same server (Kimai Cloud…).
  const network = createNetwork({
    [URL_1]: kimai,
    ...Object.fromEntries(origins.map((origin) => [origin, kimai])),
  });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
    timeZone: TIME_ZONE,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, server: kimai, app, hub: app.hub, clock, dataDir };
}

export const userId = (gladys, id = 2) => gladys.externalIds('user', `user-${id}`);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { FakeKimai, LEGACY, TOKEN };
