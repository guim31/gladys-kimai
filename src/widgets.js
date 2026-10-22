// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `timer`.
//
// The use case: the tablet by the desk shows the running timer and the hours
// of the day and the week, and a tap stops the timer, resumes the last entry
// or switches to one of the last projects, without opening Kimai.
//
// Budget (8 components, 2 texts, 4 buttons): one status row (the running
// timer and its duration), two tiles (today, this week), and four buttons:
// "Stop" or "Resume", then the three most recent project/activity couples.
// The figures are values, not bound to device features, so the widget works
// before the device is added.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { KimaiHub, WIDGET_KEY } from './hub.js';
import { hm, pick } from './texts.js';

// Action keys of the buttons: permanent once published (unique, the core
// drops a button whose key is taken).
export const ACTIONS = Object.freeze({
  STOP: 'stop',
  RESUME: 'resume',
  START: ['start_1', 'start_2', 'start_3'],
});

export const TEXT = {
  configure: {
    en: 'Enter the address of your Kimai and an API token in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre Kimai et un jeton d'API dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Kimai und ein API-Token in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su Kimai y un token de API en la configuración de la integración.',
  },
  noAnswer: {
    en: 'Kimai does not answer: see the Configuration screen of the integration.',
    fr: "Kimai ne répond pas : voir l'écran Configuration de l'intégration.",
    de: 'Kimai antwortet nicht: Sieh dir die Konfiguration der Integration an.',
    es: 'Kimai no responde: consulte la pantalla de configuración de la integración.',
  },
  stale: {
    en: 'Kimai does not answer: last known figures.',
    fr: 'Kimai ne répond pas : derniers chiffres connus.',
    de: 'Kimai antwortet nicht: zuletzt bekannte Werte.',
    es: 'Kimai no responde: últimas cifras conocidas.',
  },
  noTimer: {
    en: 'No timer running',
    fr: 'Aucun chrono en cours',
    de: 'Keine Zeitmessung läuft',
    es: 'Ningún cronómetro',
  },
  stopped: { en: 'Stopped', fr: 'Arrêté', de: 'Gestoppt', es: 'Detenido' },
  today: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  week: { en: 'This week', fr: 'Cette semaine', de: 'Diese Woche', es: 'Esta semana' },
  stop: { en: 'Stop', fr: 'Arrêter', de: 'Stoppen', es: 'Detener' },
  resume: { en: 'Resume', fr: 'Reprendre', de: 'Fortsetzen', es: 'Reanudar' },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const minutesOf = (seconds) => Math.floor(seconds / 60);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

async function get(hub, { language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.configure, language);
  }
  if (hub.error && hub.readAt === 0) {
    return message(TEXT.noAnswer, language);
  }
  const view = hub.view();
  const limit = hub.config.dailyLimitSeconds;
  const components = [];
  if (hub.error) {
    components.push({ type: 'text', variant: 'caption', text: t(TEXT.stale, language) });
  }
  components.push(
    {
      type: 'value',
      value: hm(minutesOf(view.todaySeconds)),
      label: t(TEXT.today, language),
      icon: 'clock',
      color:
        limit !== null && view.todaySeconds >= limit
          ? WIDGET_COLORS.WARNING
          : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      value: hm(minutesOf(view.weekSeconds)),
      label: t(TEXT.week, language),
      icon: 'calendar',
    },
    {
      type: 'status',
      items: [
        view.running
          ? {
              label: fit(view.label, 40),
              icon: 'play-circle',
              value: hm(minutesOf(view.runningSeconds)),
              color: WIDGET_COLORS.SUCCESS,
            }
          : {
              label: t(TEXT.noTimer, language),
              icon: 'pause-circle',
              value: t(TEXT.stopped, language),
              color: WIDGET_COLORS.NEUTRAL,
            },
      ],
    },
  );
  if (!hub.error) {
    if (view.running) {
      components.push({
        type: 'button',
        label: t(TEXT.stop, language),
        icon: 'square',
        style: 'danger',
        action: { key: ACTIONS.STOP },
      });
    } else if (hub.lastStopped()) {
      components.push({
        type: 'button',
        label: t(TEXT.resume, language),
        icon: 'rotate-ccw',
        style: 'secondary',
        action: { key: ACTIONS.RESUME },
      });
    }
    hub
      .recent()
      .slice(0, ACTIONS.START.length)
      .forEach((couple, index) => {
        components.push({
          type: 'button',
          label: fit(couple.label, 24),
          icon: 'play',
          style: 'secondary',
          action: {
            key: ACTIONS.START[index],
            params: { project: couple.projectId, activity: couple.activityId },
          },
        });
      });
  }
  // Short: the running duration moves every minute.
  return { ttl_seconds: view.running ? 60 : 300, components };
}

async function action(hub, { actionKey, params = {} }) {
  if (actionKey === ACTIONS.STOP) {
    const { stopped } = await hub.stopTimers();
    return { message: KimaiHub.stoppedMessage(stopped) };
  }
  if (actionKey === ACTIONS.RESUME) {
    const { label, already } = await hub.resumeLast();
    return { message: KimaiHub.startedMessage(label, already) };
  }
  if (
    ACTIONS.START.includes(actionKey) &&
    Number.isInteger(params.project) &&
    Number.isInteger(params.activity)
  ) {
    const { label } = await hub.startTimer({
      project: `#${params.project}`,
      activity: `#${params.activity}`,
      stopRunning: true,
    });
    return { message: KimaiHub.startedMessage(label) };
  }
  throw new Error(`Unknown action ${actionKey}`);
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
