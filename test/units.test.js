// -----------------------------------------------------------------------------
// The pure parts: the address and the daily limit typed by the user, the
// local periods (DST included), the dates of Kimai, the totals.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseDailyLimit, parseServerUrl } from '../src/config.js';
import {
  findByIdOrName,
  localDateTime,
  parseTimesheets,
  periods,
  summarize,
} from '../src/kimai/model.js';

test('the address: bare host, browser URL, API URL, path prefix, kimai.cloud', () => {
  assert.equal(parseServerUrl('192.0.2.10:8001'), 'http://192.0.2.10:8001');
  assert.equal(
    parseServerUrl(' https://kimai.example.org/en/timesheet/ '),
    'https://kimai.example.org',
  );
  assert.equal(
    parseServerUrl('https://kimai.example.org/fr_FR/homepage'),
    'https://kimai.example.org',
  );
  assert.equal(parseServerUrl('http://192.0.2.10/kimai/api/doc'), 'http://192.0.2.10/kimai');
  assert.equal(
    parseServerUrl('http://192.0.2.10/kimai/index.php/en/login'),
    'http://192.0.2.10/kimai',
  );
  assert.equal(parseServerUrl('acme.kimai.cloud'), 'https://acme.kimai.cloud');
  assert.equal(parseServerUrl('http://user:pw@192.0.2.10'), null);
  assert.equal(parseServerUrl('ftp://192.0.2.10'), null);
  assert.equal(parseServerUrl(''), null);
});

test('the daily limit: hours, decimals with a dot or a comma, h:mm', () => {
  assert.equal(parseDailyLimit('8'), 8 * 3600);
  assert.equal(parseDailyLimit('7.5'), 7.5 * 3600);
  assert.equal(parseDailyLimit('7,5'), 7.5 * 3600);
  assert.equal(parseDailyLimit('7:30'), 7.5 * 3600);
  assert.equal(parseDailyLimit('7h30'), 7.5 * 3600);
  assert.equal(parseDailyLimit('7h'), 7 * 3600);
  for (const off of ['', '0', '25', '7:75', 'huit', '-2']) {
    assert.equal(parseDailyLimit(off), null, off);
  }
  assert.equal(normalizeConfig({ daily_limit: 'huit' }).dailyLimitInvalid, true);
  assert.equal(normalizeConfig({ daily_limit: '' }).dailyLimitInvalid, false);
  assert.equal(normalizeConfig({}).dailyLimitSeconds, 8 * 3600, 'the default: 8 h');
});

test('the configuration defaults', () => {
  assert.deepEqual(normalizeConfig({ poll_interval: '7', language: 'it' }), {
    url: null,
    urlTyped: false,
    token: '',
    username: '',
    dailyLimitSeconds: 8 * 3600,
    dailyLimitInvalid: false,
    allowSelfSigned: false,
    pollIntervalMs: 60_000,
    language: 'fr',
  });
});

test('periods: day, week from Monday or Sunday, month, across the end of summer time', () => {
  const zone = 'Europe/Paris';
  // Sunday 25/10/2026, 12:00 Paris: the day lasts 25 h.
  const p = periods(Date.UTC(2026, 9, 25, 11), zone);
  assert.equal(p.day.start, Date.UTC(2026, 9, 24, 22));
  assert.equal(p.day.end, Date.UTC(2026, 9, 25, 23));
  assert.equal(p.week.start, Date.UTC(2026, 9, 18, 22), 'Monday 19/10');
  assert.equal(p.week.end, Date.UTC(2026, 9, 25, 23));
  assert.equal(p.month.start, Date.UTC(2026, 8, 30, 22));
  assert.equal(p.month.end, Date.UTC(2026, 9, 31, 23));
  const sunday = periods(Date.UTC(2026, 9, 25, 11), zone, 'sunday');
  assert.equal(sunday.week.start, p.day.start, 'a Sunday starts its own week');
  const january = periods(Date.UTC(2027, 0, 1, 10), zone);
  assert.equal(january.month.start, Date.UTC(2026, 11, 31, 23));
  assert.equal(january.week.start, Date.UTC(2026, 11, 27, 23), 'Monday 28/12');
});

test('the begin filter is a local date-time of the Kimai user', () => {
  assert.equal(localDateTime(Date.UTC(2026, 8, 30, 22), 'Europe/Paris'), '2026-10-01T00:00:00');
  assert.equal(localDateTime(Date.UTC(2026, 8, 30, 22), 'America/New_York'), '2026-09-30T18:00:00');
});

test('entries: Kimai dates with +0200, running ones counted until now, by their begin day', () => {
  const entries = parseTimesheets([
    { id: 1, begin: '2026-10-21T23:00:00+0200', end: '2026-10-22T00:30:00+0200', duration: 5400 },
    { id: 2, begin: '2026-10-22T09:00:00+0200', end: null, duration: 0, break: 600 },
    { id: 3, begin: '2026-10-23T09:00:00+0200', end: null, duration: 0 },
    { id: 4, begin: 'not a date' },
  ]);
  assert.deepEqual(
    entries.map((entry) => entry.id),
    [3, 2, 1],
  );
  const now = Date.parse('2026-10-22T10:00:00+0200');
  const totals = summarize(entries, { now, periods: periods(now, 'Europe/Paris') });
  assert.equal(totals.todaySeconds, 3600 - 600, 'the break of the running entry is taken off');
  assert.equal(totals.weekSeconds, 3000 + 5400, 'a future entry is not counted');
});

test('find by number or name, accents and case ignored', () => {
  const items = [
    { id: 1, name: 'Développement' },
    { id: 2, name: 'Réunion' },
    { id: 3, name: 'réunion' },
  ];
  assert.equal(findByIdOrName(items, 'developpement').item.id, 1);
  assert.equal(findByIdOrName(items, '#2').item.id, 2);
  assert.equal(findByIdOrName(items, 3).item.id, 3);
  assert.equal(findByIdOrName(items, 'Reunion').reason, 'ambiguous');
  assert.equal(findByIdOrName(items, 'Support').reason, 'not_found');
  assert.equal(findByIdOrName(items, ' ').reason, 'empty');
});
