// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene action
// errors and toasts. Four languages, the four of the Gladys interface; German
// says "du", Spanish "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './kimai/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Kimai in the configuration.',
    fr: "Saisissez l'adresse de votre Kimai dans la configuration.",
    de: 'Gib die Adresse deines Kimai in der Konfiguration ein.',
    es: 'Introduzca la dirección de su Kimai en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.20:8001',
    fr: 'Adresse incomprise, ex. http://192.168.1.20:8001',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.20:8001',
    es: 'Dirección no válida, p. ej. http://192.168.1.20:8001',
  },
  noToken: {
    en: 'Enter a Kimai API token in the configuration (your profile, API access).',
    fr: "Saisissez un jeton d'API Kimai dans la configuration (votre profil, Accès API).",
    de: 'Gib in der Konfiguration ein Kimai-API-Token ein (dein Profil, API-Zugang).',
    es: 'Introduzca un token de API de Kimai en la configuración (su perfil, acceso API).',
  },
};

// One short explanation per error kind (src/kimai/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Kimai does not answer',
    fr: 'Kimai ne répond pas',
    de: 'Kimai antwortet nicht',
    es: 'Kimai no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API token refused: check it, and the username if you use the old API password',
    fr: "jeton d'API refusé : vérifiez-le, et le nom d'utilisateur avec l'ancien mot de passe d'API",
    de: 'API-Token abgelehnt: Prüfe es, und den Benutzernamen beim alten API-Passwort',
    es: 'token de API rechazado: compruébelo, y el usuario si usa la antigua contraseña de API',
  },
  [ERROR_KINDS.NOT_KIMAI]: {
    en: 'no Kimai API at this address',
    fr: 'aucune API Kimai à cette adresse',
    de: 'keine Kimai-API unter dieser Adresse',
    es: 'no hay ninguna API de Kimai en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.RATE_LIMIT]: {
    en: 'too many requests, retrying later',
    fr: 'trop de requêtes, nouvel essai plus tard',
    de: 'zu viele Anfragen, neuer Versuch später',
    es: 'demasiadas solicitudes, se reintentará más tarde',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

const hm = (minutes) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (version, user, minutes) => `Kimai ${version} OK, user ${user}: ${hm(minutes)} today.`,
    failed: (reason) => `Kimai: ${reason}.`,
    badLimit: 'Daily limit not understood (e.g. 8, 7.5 or 7:30): the trigger is off.',
  },
  fr: {
    ok: (version, user, minutes) =>
      `Kimai ${version} OK, utilisateur ${user} : ${hm(minutes)} aujourd'hui.`,
    failed: (reason) => `Kimai : ${reason}.`,
    badLimit: 'Limite du jour incomprise (ex. 8, 7,5 ou 7:30) : le déclencheur est inactif.',
  },
  de: {
    ok: (version, user, minutes) => `Kimai ${version} OK, Benutzer ${user}: ${hm(minutes)} heute.`,
    failed: (reason) => `Kimai: ${reason}.`,
    badLimit: 'Tageslimit nicht verstanden (z. B. 8, 7,5 oder 7:30): Der Auslöser ist aus.',
  },
  es: {
    ok: (version, user, minutes) => `Kimai ${version} OK, usuario ${user}: ${hm(minutes)} hoy.`,
    failed: (reason) => `Kimai: ${reason}.`,
    badLimit: 'Límite diario no válido (p. ej. 8, 7,5 o 7:30): el desencadenante está inactivo.',
  },
};

// Errors of the scene actions, the switch and the widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  notConfigured: {
    en: 'Kimai is not configured.',
    fr: "Kimai n'est pas configuré.",
    de: 'Kimai ist nicht konfiguriert.',
    es: 'Kimai no está configurado.',
  },
  emptyProject: {
    en: 'Give the name or the number of the project.',
    fr: 'Indiquez le nom ou le numéro du projet.',
    de: 'Gib den Namen oder die Nummer des Projekts an.',
    es: 'Indique el nombre o el número del proyecto.',
  },
  projectNotFound: {
    en: 'No visible project has this name or number in Kimai.',
    fr: 'Aucun projet visible ne porte ce nom ou ce numéro dans Kimai.',
    de: 'Kein sichtbares Projekt in Kimai hat diesen Namen oder diese Nummer.',
    es: 'Ningún proyecto visible tiene este nombre o número en Kimai.',
  },
  projectAmbiguous: {
    en: 'Several projects have this name (other customers): give its number instead.',
    fr: 'Plusieurs projets portent ce nom (autres clients) : indiquez plutôt son numéro.',
    de: 'Mehrere Projekte haben diesen Namen (andere Kunden): Gib stattdessen die Nummer an.',
    es: 'Varios proyectos tienen este nombre (otros clientes): indique su número.',
  },
  emptyActivity: {
    en: 'Give the name or the number of the activity.',
    fr: "Indiquez le nom ou le numéro de l'activité.",
    de: 'Gib den Namen oder die Nummer der Tätigkeit an.',
    es: 'Indique el nombre o el número de la actividad.',
  },
  activityNotFound: {
    en: 'This project has no activity with this name or number in Kimai.',
    fr: "Ce projet n'a aucune activité de ce nom ou de ce numéro dans Kimai.",
    de: 'Dieses Projekt hat keine Tätigkeit mit diesem Namen oder dieser Nummer in Kimai.',
    es: 'Este proyecto no tiene ninguna actividad con este nombre o número en Kimai.',
  },
  activityAmbiguous: {
    en: 'Several activities have this name: give its number instead.',
    fr: 'Plusieurs activités portent ce nom : indiquez plutôt son numéro.',
    de: 'Mehrere Tätigkeiten haben diesen Namen: Gib stattdessen die Nummer an.',
    es: 'Varias actividades tienen este nombre: indique su número.',
  },
  alreadyRunning: {
    en: 'A timer is already running: tick "Stop the running timer" to switch.',
    fr: 'Un chrono tourne déjà : cochez « Arrêter le chrono en cours » pour changer.',
    de: 'Eine Zeitmessung läuft schon: Aktiviere „Laufende Zeitmessung stoppen“ zum Wechseln.',
    es: 'Ya hay un cronómetro en marcha: marque «Detener el cronómetro en marcha» para cambiar.',
  },
  nothingToResume: {
    en: 'No previous entry to resume: start a timer with a project and an activity.',
    fr: 'Aucune saisie précédente à reprendre : démarrez un chrono avec un projet et une activité.',
    de: 'Kein früherer Eintrag zum Fortsetzen: Starte eine Zeitmessung mit Projekt und Tätigkeit.',
    es: 'No hay ninguna entrada anterior que reanudar: inicie un cronómetro con proyecto y actividad.',
  },
  refused: {
    en: 'Kimai refused the entry',
    fr: 'Kimai a refusé la saisie',
    de: 'Kimai hat den Eintrag abgelehnt',
    es: 'Kimai ha rechazado la entrada',
  },
};

// Toasts of the widget buttons and of the switch (≤ 200 characters).
export const DONE_TEXT = {
  en: {
    started: (label) => `Timer started: ${label}.`,
    stopped: (label, minutes) => `Timer stopped: ${label}, ${hm(minutes)}.`,
    none: 'No timer was running.',
  },
  fr: {
    started: (label) => `Chrono démarré : ${label}.`,
    stopped: (label, minutes) => `Chrono arrêté : ${label}, ${hm(minutes)}.`,
    none: 'Aucun chrono ne tournait.',
  },
  de: {
    started: (label) => `Zeitmessung gestartet: ${label}.`,
    stopped: (label, minutes) => `Zeitmessung gestoppt: ${label}, ${hm(minutes)}.`,
    none: 'Es lief keine Zeitmessung.',
  },
  es: {
    started: (label) => `Cronómetro iniciado: ${label}.`,
    stopped: (label, minutes) => `Cronómetro detenido: ${label}, ${hm(minutes)}.`,
    none: 'No había ningún cronómetro en marcha.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** A multi-language object from a function of the language. */
export const allLanguages = (render) =>
  Object.fromEntries(Object.keys(INIT_FAILED).map((language) => [language, render(language)]));

export { hm };
