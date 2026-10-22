// -----------------------------------------------------------------------------
// The Gladys device: one per Kimai user, the user of the API token.
//
// Identity: `user` / `user-<id>`, the id Kimai gives the user (stable, never
// the username): renaming the user keeps the device.
//
// Features (category/type couples of the core table, test/gladys-rules.test.js):
//   - running: switch/binary, the one command: 0 stops the running timer, 1
//     resumes the last entry (a new timer, same project, activity and
//     description, as the "restart" button of Kimai);
//   - current: text/text, "Project · Activity" of the running timer, or "No
//     timer" (a text state is never empty);
//   - running duration: duration/integer, minutes;
//   - today, this week, this month: duration/decimal, hours (2 decimals).
//
// The device is published with should_poll: false: the integration reads
// Kimai on its own timer (src/hub.js).
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const USER_TYPE = 'user';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  RUNNING: 'running',
  CURRENT: 'current',
  RUNNING_DURATION: 'running_duration',
  TODAY: 'today',
  WEEK: 'week',
  MONTH: 'month',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.RUNNING]: 'Timer running',
    [FEATURE_KEYS.CURRENT]: 'Current project',
    [FEATURE_KEYS.RUNNING_DURATION]: 'Timer duration',
    [FEATURE_KEYS.TODAY]: 'Hours today',
    [FEATURE_KEYS.WEEK]: 'Hours this week',
    [FEATURE_KEYS.MONTH]: 'Hours this month',
  },
  fr: {
    [FEATURE_KEYS.RUNNING]: 'Chrono en cours',
    [FEATURE_KEYS.CURRENT]: 'Projet en cours',
    [FEATURE_KEYS.RUNNING_DURATION]: 'Durée du chrono',
    [FEATURE_KEYS.TODAY]: "Heures aujourd'hui",
    [FEATURE_KEYS.WEEK]: 'Heures cette semaine',
    [FEATURE_KEYS.MONTH]: 'Heures ce mois-ci',
  },
  de: {
    [FEATURE_KEYS.RUNNING]: 'Zeitmessung läuft',
    [FEATURE_KEYS.CURRENT]: 'Aktuelles Projekt',
    [FEATURE_KEYS.RUNNING_DURATION]: 'Dauer der Zeitmessung',
    [FEATURE_KEYS.TODAY]: 'Stunden heute',
    [FEATURE_KEYS.WEEK]: 'Stunden diese Woche',
    [FEATURE_KEYS.MONTH]: 'Stunden diesen Monat',
  },
  es: {
    [FEATURE_KEYS.RUNNING]: 'Cronómetro en marcha',
    [FEATURE_KEYS.CURRENT]: 'Proyecto actual',
    [FEATURE_KEYS.RUNNING_DURATION]: 'Duración del cronómetro',
    [FEATURE_KEYS.TODAY]: 'Horas hoy',
    [FEATURE_KEYS.WEEK]: 'Horas esta semana',
    [FEATURE_KEYS.MONTH]: 'Horas este mes',
  },
};

// Published on "current project" when no timer runs.
export const NO_TIMER = {
  en: 'No timer',
  fr: 'Aucun chrono',
  de: 'Keine Zeitmessung',
  es: 'Ningún cronómetro',
};

const TEXT_MAX_LENGTH = 100;

const hours = (key, max) => ({
  key,
  definition: {
    category: DEVICE_FEATURE_CATEGORIES.DURATION,
    type: DEVICE_FEATURE_TYPES.DURATION.DECIMAL,
    unit: 'hours',
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max,
  },
});

// Order = display order in Gladys. Bounds are display bounds (the core never
// applies them on write): overlapping entries may add up beyond 24 h a day.
export const FEATURES = [
  {
    key: FEATURE_KEYS.RUNNING,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
      read_only: false,
      has_feedback: true,
      keep_history: true,
      min: 0,
      max: 1,
    },
  },
  {
    key: FEATURE_KEYS.CURRENT,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      read_only: true,
      has_feedback: false,
      keep_history: false,
      // NOT NULL in the core, even for a text (422 on "Add to Gladys" otherwise).
      min: 0,
      max: 0,
    },
  },
  {
    key: FEATURE_KEYS.RUNNING_DURATION,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.DURATION,
      type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
      unit: 'minutes',
      read_only: true,
      has_feedback: false,
      keep_history: false,
      min: 0,
      max: 1440,
    },
  },
  hours(FEATURE_KEYS.TODAY, 24),
  hours(FEATURE_KEYS.WEEK, 168),
  hours(FEATURE_KEYS.MONTH, 744),
];

export const userIds = (gladys, userId) => gladys.externalIds(USER_TYPE, `user-${userId}`);

/** "Kimai" followed by the alias or the username. */
export const userDeviceName = (user) => `Kimai ${user.alias || user.username}`.slice(0, 60);

/**
 * @param {object} gladys
 * @param {{ id: number, username: string, alias?: string|null }} user
 * @param {string} language
 */
export function buildUserDevice(gladys, user, language = 'en') {
  const ids = userIds(gladys, user.id);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: userDeviceName(user),
    external_id: ids.device,
    should_poll: false,
    features: FEATURES.map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

const roundHours = (seconds) => Math.round((seconds / 3600) * 100) / 100;

/**
 * The states of the device, in the `publishStates` format.
 * @param {ReturnType<typeof userIds>} ids
 * @param {{ running: object|null, label: string|null, runningSeconds: number,
 *   todaySeconds: number, weekSeconds: number, monthSeconds: number }} view
 * @param {string} language
 */
export function featureStates(ids, view, language) {
  const current = view.running && view.label ? view.label : (NO_TIMER[language] ?? NO_TIMER.en);
  return [
    { device_feature_external_id: ids.feature(FEATURE_KEYS.RUNNING), state: view.running ? 1 : 0 },
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.CURRENT),
      text: current.slice(0, TEXT_MAX_LENGTH),
    },
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.RUNNING_DURATION),
      state: view.running ? Math.floor(view.runningSeconds / 60) : 0,
    },
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.TODAY),
      state: roundHours(view.todaySeconds),
    },
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.WEEK),
      state: roundHours(view.weekSeconds),
    },
    {
      device_feature_external_id: ids.feature(FEATURE_KEYS.MONTH),
      state: roundHours(view.monthSeconds),
    },
  ];
}
