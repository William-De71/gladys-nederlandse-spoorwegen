// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, states, widget contents, scene
// summaries, messages of the Configuration screen. Vocabulary of the Gladys
// interface (appareil / Gerät / dispositivo, scène / Szene / escena). The
// names of stations, the destinations, the messages and the disruptions stay
// as NS writes them, in English: NS publishes Dutch or English only.
// -----------------------------------------------------------------------------

import { minutesLeft } from './departures.js';
import { formatTime } from './time.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  stationDeviceName: {
    en: 'NS {station}',
    fr: 'NS {station}',
    de: 'NS {station}',
    es: 'NS {station}',
  },
  featureNext: {
    en: 'Next train',
    fr: 'Prochain train',
    de: 'Nächster Zug',
    es: 'Próximo tren',
  },
  featureWait: {
    en: 'Wait',
    fr: 'Attente',
    de: 'Wartezeit',
    es: 'Espera',
  },
  featureFollowing: {
    en: 'Wait for the following one',
    fr: 'Attente du suivant',
    de: 'Wartezeit des folgenden',
    es: 'Espera del siguiente',
  },
  featureDelay: {
    en: 'Delay',
    fr: 'Retard',
    de: 'Verspätung',
    es: 'Retraso',
  },
  featureTraffic: {
    en: 'Traffic',
    fr: 'Trafic',
    de: 'Verkehrslage',
    es: 'Tráfico',
  },
  featureDisruptions: {
    en: 'Disruptions under way',
    fr: 'Perturbations en cours',
    de: 'Laufende Störungen',
    es: 'Incidencias en curso',
  },

  // trains
  noPassage: {
    en: 'No train announced',
    fr: 'Aucun train annoncé',
    de: 'Kein Zug angekündigt',
    es: 'Ningún tren anunciado',
  },
  minutesValue: {
    en: '{n} min',
    fr: '{n} min',
    de: '{n} Min.',
    es: '{n} min',
  },
  departing: {
    en: 'Departing',
    fr: 'Au départ',
    de: 'Fährt ab',
    es: 'Saliendo',
  },
  inMinutes: {
    en: 'in {n} min',
    fr: 'dans {n} min',
    de: 'in {n} Min.',
    es: 'dentro de {n} min',
  },
  atTime: {
    en: 'at {time}',
    fr: 'à {time}',
    de: 'um {time}',
    es: 'a las {time}',
  },
  lateMark: {
    en: '(+{n} min late)',
    fr: '(+{n} min de retard)',
    de: '(+{n} Min. Verspätung)',
    es: '(+{n} min de retraso)',
  },
  platformMark: {
    en: 'platform {platform}',
    fr: 'voie {platform}',
    de: 'Gleis {platform}',
    es: 'vía {platform}',
  },
  platformChangedMark: {
    en: 'platform {platform} (changed)',
    fr: 'voie {platform} (changée)',
    de: 'Gleis {platform} (geändert)',
    es: 'vía {platform} (cambiada)',
  },
  platformShort: {
    en: 'pl. {platform}',
    fr: 'v. {platform}',
    de: 'Gl. {platform}',
    es: 'v. {platform}',
  },
  platformChangedShort: {
    en: 'pl. {platform} (new)',
    fr: 'v. {platform} (modif.)',
    de: 'Gl. {platform} (neu)',
    es: 'v. {platform} (nueva)',
  },
  // As on the boards of NS: "+8", without a unit.
  delayShort: {
    en: '+{delay}',
    fr: '+{delay}',
    de: '+{delay}',
    es: '+{delay}',
  },
  onTimeShort: {
    en: 'on time',
    fr: 'à l’heure',
    de: 'pünktlich',
    es: 'a su hora',
  },
  cancelledShort: {
    en: 'Cancelled',
    fr: 'Supprimé',
    de: 'Fällt aus',
    es: 'Suprimido',
  },

  // states of a station
  state_unknown: {
    en: 'No information',
    fr: 'Pas d’information',
    de: 'Keine Information',
    es: 'Sin información',
  },
  state_normal: {
    en: 'Normal service',
    fr: 'Trafic normal',
    de: 'Normaler Betrieb',
    es: 'Servicio normal',
  },
  state_info: {
    en: 'Engineering works',
    fr: 'Travaux',
    de: 'Bauarbeiten',
    es: 'Obras',
  },
  state_disrupted: {
    en: 'Disrupted',
    fr: 'Trafic perturbé',
    de: 'Gestört',
    es: 'Servicio alterado',
  },
  state_major: {
    en: 'Major disruption',
    fr: 'Trafic très perturbé',
    de: 'Große Störung',
    es: 'Incidencia grave',
  },
  stateWithTitle: {
    en: '{state}: {title}',
    fr: '{state} : {title}',
    de: '{state}: {title}',
    es: '{state}: {title}',
  },
  kind_disruption: {
    en: 'Disruption',
    fr: 'Perturbation',
    de: 'Störung',
    es: 'Incidencia',
  },
  kind_maintenance: {
    en: 'Engineering works',
    fr: 'Travaux',
    de: 'Bauarbeiten',
    es: 'Obras',
  },
  kind_calamity: {
    en: 'Calamity',
    fr: 'Alerte',
    de: 'Unwetter / Notlage',
    es: 'Alerta',
  },
  upcomingState: {
    en: 'Coming',
    fr: 'À venir',
    de: 'Demnächst',
    es: 'Próximamente',
  },

  // scene summaries
  summarySoon: {
    en: '{train} to {destination} leaves {station} in {minutes} min ({time}, platform {platform}).',
    fr: 'Le {train} pour {destination} part de {station} dans {minutes} min ({time}, voie {platform}).',
    de: '{train} nach {destination} fährt in {minutes} Min. ab {station} ({time}, Gleis {platform}).',
    es: 'El {train} a {destination} sale de {station} dentro de {minutes} min ({time}, vía {platform}).',
  },
  summarySoonLate: {
    en: '{train} to {destination} leaves {station} in {minutes} min ({time}, {delay} min late, platform {platform}).',
    fr: 'Le {train} pour {destination} part de {station} dans {minutes} min ({time}, {delay} min de retard, voie {platform}).',
    de: '{train} nach {destination} fährt in {minutes} Min. ab {station} ({time}, {delay} Min. Verspätung, Gleis {platform}).',
    es: 'El {train} a {destination} sale de {station} dentro de {minutes} min ({time}, {delay} min de retraso, vía {platform}).',
  },
  summaryCancelled: {
    en: 'The {time} {train} from {station} to {destination} is cancelled.',
    fr: 'Le {train} de {time} au départ de {station} pour {destination} est supprimé.',
    de: 'Der {train} um {time} ab {station} nach {destination} fällt aus.',
    es: 'El {train} de las {time} de {station} a {destination} está suprimido.',
  },
  summaryDelayed: {
    en: 'The {planned} {train} from {station} to {destination} is {delay} min late: it leaves at {time}.',
    fr: 'Le {train} de {planned} au départ de {station} pour {destination} a {delay} min de retard : départ à {time}.',
    de: 'Der {train} um {planned} ab {station} nach {destination} hat {delay} Min. Verspätung: Abfahrt um {time}.',
    es: 'El {train} de las {planned} de {station} a {destination} lleva {delay} min de retraso: sale a las {time}.',
  },
  summaryPlatform: {
    en: 'The {time} {train} from {station} to {destination} now leaves from platform {platform} (instead of {previous}).',
    fr: 'Le {train} de {time} au départ de {station} pour {destination} part maintenant voie {platform} (au lieu de {previous}).',
    de: 'Der {train} um {time} ab {station} nach {destination} fährt jetzt von Gleis {platform} (statt {previous}).',
    es: 'El {train} de las {time} de {station} a {destination} sale ahora de la vía {platform} (en lugar de {previous}).',
  },
  summaryDisrupted: {
    en: '{kind} at {station}: {title}.',
    fr: '{kind} à {station} : {title}.',
    de: '{kind} in {station}: {title}.',
    es: '{kind} en {station}: {title}.',
  },
  summaryWorks: {
    en: '{kind} at {station}: {title}.',
    fr: '{kind} à {station} : {title}.',
    de: '{kind} in {station}: {title}.',
    es: '{kind} en {station}: {title}.',
  },
  summaryEnded: {
    en: 'Over at {station}: {title}.',
    fr: 'Terminé à {station} : {title}.',
    de: 'Beendet in {station}: {title}.',
    es: 'Terminado en {station}: {title}.',
  },
  summaryStationState: {
    en: '{station}: {state}. {title}.',
    fr: '{station} : {state}. {title}.',
    de: '{station}: {state}. {title}.',
    es: '{station}: {state}. {title}.',
  },
  summaryStationStateOnly: {
    en: '{station}: {state}.',
    fr: '{station} : {state}.',
    de: '{station}: {state}.',
    es: '{station}: {state}.',
  },
  outputNext: {
    en: 'Next train from {station}: {train} to {destination} {when}, platform {platform}.',
    fr: 'Prochain train au départ de {station} : {train} pour {destination} {when}, voie {platform}.',
    de: 'Nächster Zug ab {station}: {train} nach {destination} {when}, Gleis {platform}.',
    es: 'Próximo tren desde {station}: {train} a {destination} {when}, vía {platform}.',
  },
  outputFollowing: {
    en: 'The following one {when}.',
    fr: 'Le suivant {when}.',
    de: 'Der folgende {when}.',
    es: 'El siguiente {when}.',
  },
  outputNone: {
    en: 'No train announced from {station}.',
    fr: 'Aucun train annoncé au départ de {station}.',
    de: 'Kein Zug ab {station} angekündigt.',
    es: 'Ningún tren anunciado desde {station}.',
  },

  // widgets
  readAt: {
    en: 'read at {time}',
    fr: 'lu à {time}',
    de: 'gelesen um {time}',
    es: 'leído a las {time}',
  },
  updatedAt: {
    en: 'Updated at {time}',
    fr: 'Mis à jour à {time}',
    de: 'Aktualisiert um {time}',
    es: 'Actualizado a las {time}',
  },
  moreInfo: {
    en: 'More information',
    fr: 'En savoir plus',
    de: 'Mehr erfahren',
    es: 'Más información',
  },
  disruptionsTitle: {
    en: 'Your stations',
    fr: 'Vos gares',
    de: 'Deine Bahnhöfe',
    es: 'Tus estaciones',
  },
  networkTitle: {
    en: 'NS network',
    fr: 'Réseau NS',
    de: 'NS-Netz',
    es: 'Red de NS',
  },
  periodFromTo: {
    en: '{start} → {end}',
    fr: '{start} → {end}',
    de: '{start} → {end}',
    es: '{start} → {end}',
  },
  periodFrom: {
    en: 'since {start}',
    fr: 'depuis {start}',
    de: 'seit {start}',
    es: 'desde {start}',
  },
  extraTime: {
    en: '({text})',
    fr: '({text})',
    de: '({text})',
    es: '({text})',
  },
  noDisruption: {
    en: 'No disruption, no engineering works.',
    fr: 'Aucune perturbation, aucuns travaux.',
    de: 'Keine Störung, keine Bauarbeiten.',
    es: 'Ninguna incidencia ni obra.',
  },
  widgetNoStation: {
    en: 'No station is followed: fill one in the configuration of the integration, or type one in the widget settings.',
    fr: 'Aucune gare n’est suivie : renseignez-en une dans la configuration de l’intégration, ou saisissez-en une dans les réglages du widget.',
    de: 'Kein Bahnhof wird verfolgt: Trage einen in der Konfiguration der Integration ein oder gib einen in den Widget-Einstellungen ein.',
    es: 'No se sigue ninguna estación: indica una en la configuración de la integración o escribe una en los ajustes del widget.',
  },

  // connection status
  statusNoKey: {
    en: 'Enter your NS API key (apiportal.ns.nl, product "Ns-App") in the configuration.',
    fr: 'Saisissez votre clé d’API NS (apiportal.ns.nl, produit « Ns-App ») dans la configuration.',
    de: 'Gib deinen NS-API-Schlüssel (apiportal.ns.nl, Produkt „Ns-App“) in der Konfiguration ein.',
    es: 'Introduce tu clave de API de NS (apiportal.ns.nl, producto «Ns-App») en la configuración.',
  },
  statusAuth: {
    en: 'NS refuses the API key ({detail}). Check it on apiportal.ns.nl (product "Ns-App").',
    fr: 'NS refuse la clé d’API ({detail}). Vérifiez-la sur apiportal.ns.nl (produit « Ns-App »).',
    de: 'NS lehnt den API-Schlüssel ab ({detail}). Prüfe ihn auf apiportal.ns.nl (Produkt „Ns-App“).',
    es: 'NS rechaza la clave de API ({detail}). Compruébala en apiportal.ns.nl (producto «Ns-App»).',
  },
  statusUnreachable: {
    en: 'NS cannot be reached ({detail}). Next try in {minutes} min.',
    fr: 'NS est injoignable ({detail}). Nouvel essai dans {minutes} min.',
    de: 'NS ist nicht erreichbar ({detail}). Nächster Versuch in {minutes} Min.',
    es: 'No se puede contactar con NS ({detail}). Nuevo intento dentro de {minutes} min.',
  },
  statusConnected: {
    en: 'Connected to NS: {stations} station(s), read every {interval} s.',
    fr: 'Connecté à NS : {stations} gare(s), lues toutes les {interval} s.',
    de: 'Mit NS verbunden: {stations} Bahnhof/Bahnhöfe, alle {interval} s gelesen.',
    es: 'Conectado a NS: {stations} estación(es), leídas cada {interval} s.',
  },
  statusNotFound: {
    en: 'Unknown or ambiguous: {names}.',
    fr: 'Inconnu ou ambigu : {names}.',
    de: 'Unbekannt oder mehrdeutig: {names}.',
    es: 'Desconocido o ambiguo: {names}.',
  },
  statusNothing: {
    en: 'Connected to NS. No station is followed yet: fill one in below.',
    fr: 'Connecté à NS. Aucune gare n’est encore suivie : renseignez-en une ci-dessous.',
    de: 'Mit NS verbunden. Noch wird kein Bahnhof verfolgt: Trage unten einen ein.',
    es: 'Conectado a NS. Todavía no se sigue ninguna estación: indica una abajo.',
  },

  // configuration actions
  testOk: {
    en: 'API key accepted: {count} stations known.',
    fr: 'Clé d’API acceptée : {count} gares connues.',
    de: 'API-Schlüssel akzeptiert: {count} Bahnhöfe bekannt.',
    es: 'Clave de API aceptada: {count} estaciones conocidas.',
  },
  testStation: {
    en: '{station}: {count} train(s), next {next}',
    fr: '{station} : {count} train(s), prochain {next}',
    de: '{station}: {count} Zug/Züge, nächster {next}',
    es: '{station}: {count} tren(es), próximo {next}',
  },
  testStationError: {
    en: '{station}: {error}',
    fr: '{station} : {error}',
    de: '{station}: {error}',
    es: '{station}: {error}',
  },
  testError: {
    en: 'Test failed: {error}',
    fr: 'Échec du test : {error}',
    de: 'Test fehlgeschlagen: {error}',
    es: 'La prueba ha fallado: {error}',
  },
  unknownEntry: {
    en: 'unknown or ambiguous: {name}',
    fr: 'inconnu ou ambigu : {name}',
    de: 'unbekannt oder mehrdeutig: {name}',
    es: 'desconocido o ambiguo: {name}',
  },
  errorUnreachable: {
    en: 'NS cannot be reached, try again later.',
    fr: 'NS est injoignable, réessayez plus tard.',
    de: 'NS ist nicht erreichbar, versuche es später erneut.',
    es: 'No se puede contactar con NS, inténtalo más tarde.',
  },
  errorBusy: {
    en: 'Too many requests to NS: try again in a few minutes.',
    fr: 'Trop de requêtes vers NS : réessayez dans quelques minutes.',
    de: 'Zu viele Anfragen an NS: Versuche es in ein paar Minuten erneut.',
    es: 'Demasiadas peticiones a NS: inténtalo dentro de unos minutos.',
  },
  errorAuth: {
    en: 'NS refuses the API key: check it in the configuration.',
    fr: 'NS refuse la clé d’API : vérifiez-la dans la configuration.',
    de: 'NS lehnt den API-Schlüssel ab: Prüfe ihn in der Konfiguration.',
    es: 'NS rechaza la clave de API: compruébala en la configuración.',
  },
  errorNoKey: {
    en: 'No NS API key: enter it in the configuration and save.',
    fr: 'Pas de clé d’API NS : saisissez-la dans la configuration et enregistrez.',
    de: 'Kein NS-API-Schlüssel: Trage ihn in der Konfiguration ein und speichere.',
    es: 'No hay clave de API de NS: introdúcela en la configuración y guarda.',
  },
  searchTooShort: {
    en: 'Type at least two letters of the station name.',
    fr: 'Saisissez au moins deux lettres du nom de la gare.',
    de: 'Gib mindestens zwei Buchstaben des Bahnhofsnamens ein.',
    es: 'Escribe al menos dos letras del nombre de la estación.',
  },
  searchNone: {
    en: 'No station matches "{query}".',
    fr: 'Aucune gare ne correspond à « {query} ».',
    de: 'Kein Bahnhof passt zu „{query}“.',
    es: 'Ninguna estación coincide con «{query}».',
  },
  searchFound: {
    en: 'Stations found (name [code]):\n{list}',
    fr: 'Gares trouvées (nom [code]) :\n{list}',
    de: 'Gefundene Bahnhöfe (Name [Code]):\n{list}',
    es: 'Estaciones encontradas (nombre [código]):\n{list}',
  },
  stationAdded: {
    en: '{name} is followed ({count} station(s) in all). Its device is offered in the Discover tab.',
    fr: '{name} est suivie ({count} gare(s) en tout). Son appareil est proposé dans l’onglet Découvrir.',
    de: '{name} wird verfolgt ({count} Bahnhof/Bahnhöfe insgesamt). Sein Gerät wird im Tab Entdecken angeboten.',
    es: '{name} se sigue ({count} estación(es) en total). Su dispositivo se ofrece en la pestaña Descubrir.',
  },
  stationAlreadyFollowed: {
    en: '{name} is already followed.',
    fr: '{name} est déjà suivie.',
    de: '{name} wird bereits verfolgt.',
    es: '{name} ya se sigue.',
  },
  stationsFull: {
    en: 'At most {max} stations can be added with the button: remove one first.',
    fr: 'Au plus {max} gares peuvent être ajoutées avec le bouton : retirez-en une d’abord.',
    de: 'Höchstens {max} Bahnhöfe können mit der Schaltfläche hinzugefügt werden: Entferne zuerst einen.',
    es: 'Se pueden añadir como máximo {max} estaciones con el botón: quita una primero.',
  },
  stationRemoved: {
    en: '{name} is no longer followed. Its device stays in Gladys until you delete it.',
    fr: '{name} n’est plus suivie. Son appareil reste dans Gladys jusqu’à ce que vous le supprimiez.',
    de: '{name} wird nicht mehr verfolgt. Sein Gerät bleibt in Gladys, bis du es löschst.',
    es: '{name} ya no se sigue. Su dispositivo sigue en Gladys hasta que lo borres.',
  },
  stationRemoveUnknown: {
    en: 'No followed station matches "{query}": see "List the stations".',
    fr: 'Aucune gare suivie ne correspond à « {query} » : voyez « Lister les gares ».',
    de: 'Kein verfolgter Bahnhof passt zu „{query}“: siehe „Bahnhöfe auflisten“.',
    es: 'Ninguna estación seguida coincide con «{query}»: mira «Listar las estaciones».',
  },
  stationRemoveAmbiguous: {
    en: 'Several followed stations match "{query}": give its number from "List the stations".',
    fr: 'Plusieurs gares suivies correspondent à « {query} » : donnez son numéro dans « Lister les gares ».',
    de: 'Mehrere verfolgte Bahnhöfe passen zu „{query}“: Gib seine Nummer aus „Bahnhöfe auflisten“ an.',
    es: 'Varias estaciones seguidas coinciden con «{query}»: indica su número de «Listar las estaciones».',
  },
  stationInForm: {
    en: '{name} is station {slot} of the form: empty its field and save.',
    fr: '{name} est la gare {slot} du formulaire : videz son champ et enregistrez.',
    de: '{name} ist Bahnhof {slot} des Formulars: Leere sein Feld und speichere.',
    es: '{name} es la estación {slot} del formulario: vacía su campo y guarda.',
  },
  stationsNone: {
    en: 'No station is followed.',
    fr: 'Aucune gare n’est suivie.',
    de: 'Kein Bahnhof wird verfolgt.',
    es: 'No se sigue ninguna estación.',
  },
  stationsList: {
    en: '{count} followed station(s):\n{list}',
    fr: '{count} gare(s) suivie(s) :\n{list}',
    de: '{count} verfolgte(r) Bahnhof/Bahnhöfe:\n{list}',
    es: '{count} estación(es) seguida(s):\n{list}',
  },
  stationFromForm: {
    en: 'form, station {slot}',
    fr: 'formulaire, gare {slot}',
    de: 'Formular, Bahnhof {slot}',
    es: 'formulario, estación {slot}',
  },
  stationUnknownMark: {
    en: 'unknown to NS',
    fr: 'inconnue de NS',
    de: 'NS unbekannt',
    es: 'desconocida para NS',
  },
  diagnosticDone: {
    en: 'Diagnostic written to the Logs tab ({count} line(s)).',
    fr: 'Diagnostic écrit dans l’onglet Journaux ({count} ligne(s)).',
    de: 'Diagnose in den Tab Protokolle geschrieben ({count} Zeile(n)).',
    es: 'Diagnóstico escrito en la pestaña Registros ({count} línea(s)).',
  },
};

/**
 * @description Whether a value is a supported language.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language, its placeholders filled.
 * @param {string} key - A TEXTS key.
 * @param {string} language - The language (English when unknown).
 * @param {object} [values] - The placeholder values.
 * @returns {string} The text.
 * @example
 * t('inMinutes', 'fr', { n: 3 }); // -> 'dans 3 min'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[isLanguage(language) ? language : 'en'] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

/**
 * @description A text in the four languages.
 * @param {string} key - A TEXTS key.
 * @param {object|Function} [values] - The values, or `(language) => values`.
 * @returns {object} `{ en, fr, de, es }`.
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(key, language, typeof values === 'function' ? values(language) : values),
    ]),
  );
}

/**
 * @description The label of a station state.
 * @param {string} state - A state name (disruptions.js).
 * @param {string} language - The language.
 * @returns {string} The label.
 */
const stateText = (state, language) =>
  t(TEXTS[`state_${state}`] ? `state_${state}` : 'state_unknown', language);

/**
 * @description The label of a kind of disruption.
 * @param {string} kind - `disruption`, `maintenance` or `calamity`.
 * @param {string} language - The language.
 * @returns {string} The label.
 */
const kindText = (kind, language) =>
  t(TEXTS[`kind_${kind}`] ? `kind_${kind}` : 'kind_disruption', language);

/**
 * @description The name of a train, as on the boards: "IC 3529", "SPR 7429".
 * @param {object} passage - The passage.
 * @returns {string} The name.
 */
const trainLabel = (passage) => [passage.line, passage.number].filter(Boolean).join(' ');

/**
 * @description When a train leaves, in a sentence: "in 3 min", "at 10:32".
 * @param {object} passage - The passage.
 * @param {object} options - `{ language, now, timeZone }`.
 * @returns {string} The words.
 */
function passageWhen(passage, { language, now, timeZone }) {
  const minutes = minutesLeft(passage, now);
  if (minutes >= 60) {
    return t('atTime', language, { time: formatTime(passage.at, timeZone) });
  }
  return minutes === 0
    ? t('departing', language).toLowerCase()
    : t('inMinutes', language, { n: minutes });
}

/**
 * @description The short time of a train: "3 min", "10:32", "Departing".
 * @param {object} passage - The passage.
 * @param {object} options - `{ language, now, timeZone }`.
 * @returns {string} The time.
 */
function passageShort(passage, { language, now, timeZone }) {
  const minutes = minutesLeft(passage, now);
  if (minutes >= 60) {
    return formatTime(passage.at, timeZone);
  }
  return minutes === 0 ? t('departing', language) : t('minutesValue', language, { n: minutes });
}

/**
 * @description One line for a train: "IC 3529 → Venlo · 3 min (+8 min late) · platform 15".
 * @param {object|null} passage - The passage, null when none.
 * @param {object} options - `{ language, now, timeZone }`.
 * @returns {string} The text.
 */
function passageText(passage, options) {
  if (!passage) {
    return t('noPassage', options.language);
  }
  const name = trainLabel(passage);
  const head = passage.destination ? `${name} → ${passage.destination}` : name;
  const late =
    passage.realtime && passage.delay > 0
      ? ` ${t('lateMark', options.language, { n: passage.delay })}`
      : '';
  const platform = passage.platform
    ? ` · ${t(passage.platformChanged ? 'platformChangedMark' : 'platformMark', options.language, {
        platform: passage.platform,
      })}`
    : '';
  return `${head} · ${passageShort(passage, options)}${late}${platform}`;
}

export {
  LANGUAGES,
  TEXTS,
  isLanguage,
  t,
  all,
  stateText,
  kindText,
  trainLabel,
  passageWhen,
  passageShort,
  passageText,
};
