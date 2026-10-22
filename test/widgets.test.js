// -----------------------------------------------------------------------------
// The `timer` widget: valid content for the core (budget of 8 components, 2
// texts, 4 buttons), in the user's language, and its buttons.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { BASE_CONFIG, createWorld } from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, language = 'en') {
  const ack = await w.fake.widgetGet('timer', { language });
  assert.equal(ack.success, true, ack.error);
  const { content: value } = ack.data;
  validateWidgetContent(value);
  const count = (predicate) => value.components.filter(predicate).length;
  assert.ok(value.components.length <= 8);
  assert.ok(count((c) => c.type === 'text') <= 2);
  assert.ok(count((c) => c.type === 'button') <= 4);
  return value;
}

const buttons = (value) => value.components.filter((c) => c.type === 'button');

test('a running timer: its duration, today, this week, Stop and the other projects', async (t) => {
  const w = await world(t);
  const value = await content(w, 'fr');
  const tiles = value.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => [tile.label, tile.value]),
    [
      ["Aujourd'hui", '2 h 32'],
      ['Cette semaine', '12 h 17'],
    ],
  );
  const [row] = value.components.find((c) => c.type === 'status').items;
  assert.deepEqual([row.label, row.value], ['Site web · Développement', '1 h 00']);
  assert.deepEqual(
    buttons(value).map((button) => [button.label, button.action.key]),
    [
      ['Arrêter', 'stop'],
      ['Maintenance · Support', 'start_1'],
      ['Site web · Réunion', 'start_2'],
    ],
  );
  assert.equal(value.ttl_seconds, 60);
});

test('the buttons stop, switch project and resume', async (t) => {
  const w = await world(t);
  let ack = await w.fake.widgetAction('timer', 'start_1', { project: 2, activity: 3 });
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.en, 'Timer started: Maintenance · Support.');
  assert.equal(w.server.running[0].activity, 3);

  w.clock.advance(25 * 60_000);
  ack = await w.fake.widgetAction('timer', 'stop');
  assert.equal(ack.data.message.fr, 'Chrono arrêté : Maintenance · Support, 0 h 25.');

  let value = await content(w);
  assert.equal(buttons(value)[0].action.key, 'resume');
  assert.equal(value.components.find((c) => c.type === 'status').items[0].value, 'Stopped');
  ack = await w.fake.widgetAction('timer', 'resume');
  assert.equal(ack.data.message.de, 'Zeitmessung gestartet: Maintenance · Support.');
  value = await content(w);
  assert.equal(buttons(value)[0].action.key, 'stop');
});

test('the daily limit colors the tile of the day', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, daily_limit: '2' } });
  const value = await content(w);
  assert.equal(value.components[0].color, 'warning');
});

test('not configured, Kimai down: a sentence, then the last figures without buttons', async (t) => {
  const empty = await world(t, { config: { language: 'en' } });
  assert.match((await content(empty, 'es')).components[0].text, /Introduzca la dirección/);

  const w = await world(t);
  w.server.online = false;
  await w.hub.poll();
  const value = await content(w);
  assert.equal(value.components[0].variant, 'caption');
  assert.equal(buttons(value).length, 0);
});

test('an unknown button is refused', async (t) => {
  const w = await world(t);
  const ack = await w.fake.widgetAction('timer', 'start_9', { project: 1, activity: 1 });
  assert.equal(ack.success, false);
});
