# Kimai

Die Zeiterfassung deines [Kimai](https://www.kimai.org) in Gladys: die
laufende Zeitmessung, die Stunden von Tag, Woche und Monat. Eine Szene
startet eine Zeitmessung, wenn du dich an den Schreibtisch setzt oder ins
Büro kommst, stoppt sie, wenn du gehst, und sagt dir, wenn du für heute genug
gearbeitet hast; ein Tippen auf dem Dashboard stoppt die Zeitmessung oder
wechselt das Projekt.

> **Rückmeldungen willkommen.** Diese Integration wurde gegen einen echten
> Kimai-Server getestet (Docker-Image `kimai/kimai2:apache` 2.70.2 mit
> MariaDB, Oktober 2026), noch nicht im Alltag und nicht gegen Kimai Cloud.
> Wenn etwas nicht wie beschrieben funktioniert, sag es im
> [Gladys-Forum](https://community.gladysassistant.com) oder in den
> [Issues](https://github.com/guim31/gladys-kimai/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Ein **Kimai 2**, selbst gehostet und von Gladys aus erreichbar (das
  Docker-Image lauscht auf Port 8001), oder ein **Kimai Cloud**-Konto.
- Ein **API-Token** des Kimai-Benutzers, dessen Zeit du erfasst. In Kimai:
  dein Avatar (oben rechts) → **Bearbeiten** → **API-Zugang** → **Erstellen**,
  gib ihm einen Namen (`Gladys`). Kopiere das Token: Kimai zeigt es nur
  einmal an.

  Vor Kimai 2.14 gab es keine API-Tokens, nur ein **API-Passwort** (gleicher
  Bildschirm). Es funktioniert noch: Fülle das Feld **Benutzername** aus und
  trage das API-Passwort in das Token-Feld ein. Kimai kennzeichnet diesen Weg
  als veraltet.

Die Integration sieht die Zeiteinträge, Projekte und Tätigkeiten dieses
Benutzers und startet und stoppt Zeitmessungen **in seinem Namen**. Ein
einfacher Benutzer (ohne Administratorrolle) genügt.

## Einrichtung

1. In Gladys **Integrationen** → **Kimai** installieren.
2. Im Bildschirm **Konfiguration** ausfüllen:
   - **Adresse**: die Adresse von Kimai, zum Beispiel
     `http://192.168.1.20:8001`, `https://kimai.example.org` hinter einem
     Reverse Proxy (ein Pfadpräfix wie `/kimai` bleibt erhalten) oder
     `acme.kimai.cloud`. Die aus dem Browser kopierte Adresse geht auch;
   - **API-Token**.
3. Optionen:
   - **Tageslimit, in Stunden**: darüber löst der Auslöser **Kimai-Tageslimit
     erreicht** aus, einmal am Tag: `8`, `7.5`, `7,5` oder `7:30`.
     Standardmäßig 8 Stunden; leer: aus;
   - **Selbstsignierte Zertifikate akzeptieren**: für eine `https://`-Adresse
     mit selbstsigniertem Zertifikat, nur bei deinem eigenen Server;
   - **Aktualisierungsintervall**: 30 Sekunden bis 5 Minuten (standardmäßig
     1 Minute): wie schnell eine in Kimai gestartete oder gestoppte
     Zeitmessung in Gladys erscheint. Die Dauern laufen unabhängig vom
     Intervall jede Minute weiter;
   - **Sprache der Funktionsnamen**: die Namen der Funktionen beim
     Hinzufügen des Geräts (standardmäßig Französisch) und die an Szenen
     gesendeten Texte.
4. Speichern, dann **Verbindung testen**: Die Integration liest Kimai und
   nennt die Version, den Benutzer und die Stunden des Tages.
5. Im Reiter **Entdecken** das Gerät **Kimai _Benutzer_** hinzufügen.

## Geräte

Ein Gerät, **Kimai _Benutzer_** (der Alias des Benutzers in Kimai oder sein
Benutzername), mit sechs Funktionen:

| Funktion                | Was sie anzeigt                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `Zeitmessung läuft`     | an, solange eine Zeitmessung läuft. Ein Schalter: aus stoppt sie, an setzt den letzten Eintrag fort |
| `Aktuelles Projekt`     | `Projekt · Tätigkeit` der laufenden Zeitmessung; sonst `Keine Zeitmessung`                          |
| `Dauer der Zeitmessung` | Minuten seit dem Start der laufenden Zeitmessung; sonst 0                                           |
| `Stunden heute`         | Stunden der Einträge, die heute begonnen haben, die laufende Zeitmessung eingeschlossen             |
| `Stunden diese Woche`   | ebenso, seit dem ersten Tag der Woche (Montag, oder Sonntag, wenn das Kimai-Profil es so sagt)      |
| `Stunden diesen Monat`  | ebenso, seit dem ersten Tag des Monats                                                              |

„Heute“ ist der Tag in der Zeitzone von Gladys. Ein Eintrag zählt für den
Tag, an dem er **beginnt**, wie in den Kimai-Berichten: ein Eintrag von
23:00 bis 01:00 gehört zum ersten Tag. Pausen werden abgezogen, wie in Kimai.

„Den letzten Eintrag fortsetzen“ startet eine neue Zeitmessung mit Projekt,
Tätigkeit und Beschreibung des letzten gestoppten Eintrags, wie die
Neustart-Taste von Kimai.

## Dashboard

Das Widget **Kimai-Zeitmessung** zeigt zwei Kacheln (heute, diese Woche; die
erste orange über dem Tageslimit), die laufende Zeitmessung mit ihrer Dauer
und bis zu vier Tasten: **Stoppen**, solange eine Zeitmessung läuft, sonst
**Fortsetzen**, dann die drei letzten Paare aus Projekt und Tätigkeit: Ein
Tippen wechselt sofort zu diesem Projekt (die laufende Zeitmessung wird
gestoppt).

Die Funktionen können auch wie die jedes Geräts aufs Dashboard: Der Schalter
`Zeitmessung läuft` ist dann eine Start-/Stopp-Taste.

## Szenen

### Auslöser

- **Kimai-Zeitmessung gestartet**: eine Zeitmessung wurde gestartet, aus
  Gladys, der Kimai-Web-App, der mobilen App oder anderswo.
- **Kimai-Zeitmessung gestoppt**: eine Zeitmessung wurde gestoppt, mit ihrer
  Dauer.
- **Kimai-Tageslimit erreicht**: die Stunden des Tages haben das
  **Tageslimit** der Konfiguration überschritten. Einmal am Tag, höchstens
  eine Minute verspätet, auch während die Zeitmessung läuft.

Filter, für die ersten beiden: der Projektname und der Tätigkeitsname
(genaue Namen; leer: beliebig). An die Aktionen weitergegebene
Informationen: die Nummer des Eintrags, das Projekt, die Tätigkeit, der
Kunde, die Beschreibung und bei einer gestoppten Zeitmessung die Dauer in
Minuten. Beim Limit: die Stunden des Tages, das Limit, ob eine Zeitmessung
läuft und ihr Projekt.

Kimai wird alle 30 Sekunden bis 5 Minuten gelesen: Eine in Kimai gestartete
oder gestoppte Zeitmessung löst ihren Auslöser innerhalb dieser Zeit aus
(sofort, wenn sie aus Gladys kommt). Eine zwischen zwei Lesungen gestartete
und gestoppte Zeitmessung löst nichts aus. Ein Neustart der Integration löst
nichts doppelt aus, und eine Zeitmessung, die gestoppt wurde, während sie aus
war, löst beim Wiederanlauf aus.

### Aktionen

- **Kimai-Zeitmessung starten**: das **Projekt** und die **Tätigkeit** nach
  Namen (Groß- und Kleinschreibung und Akzente egal) oder Nummer, und eine
  optionale Beschreibung. Die Tätigkeit gehört zum Projekt oder ist global.
  **Laufende Zeitmessung stoppen**: aktiviert wird eine laufende Zeitmessung
  zuerst gestoppt; deaktiviert bleibt sie und nichts startet (Kimai erlaubt
  standardmäßig nur eine Zeitmessung gleichzeitig; erlaubt es mehrere,
  startet die neue daneben). Ergebnisse: die Nummer des Eintrags, das
  Projekt, die Tätigkeit.
- **Kimai-Zeitmessung stoppen**: stoppt die laufende Zeitmessung, falls eine
  läuft (kein Fehler, wenn keine läuft). Ergebnisse: die Zahl der gestoppten
  Zeitmessungen, die Dauer in Minuten, das Projekt, die Tätigkeit.
- **Kimai-Zeitmessung umschalten**: stoppt die laufende Zeitmessung; läuft
  keine, startet sie das angegebene Projekt mit Tätigkeit, oder setzt den
  letzten Eintrag fort, wenn sie leer sind. Ergebnisse: ob danach eine
  Zeitmessung läuft, die Dauer der gestoppten, das Projekt, die Tätigkeit.

Die Felder akzeptieren Szenenvariablen.

### Szenenideen

- Eine Taste am Schreibtisch führt **Kimai-Zeitmessung umschalten** aus:
  einmal drücken, um den Tag zu beginnen, einmal, um ihn zu beenden.
- Wenn das Handy im Büro ankommt, **Kimai-Zeitmessung starten** mit `Büro` /
  `Entwicklung` und aktiviertem **Laufende Zeitmessung stoppen**; wenn es
  geht, **Kimai-Zeitmessung stoppen**.
- **Kimai-Tageslimit erreicht**: die Schreibtischlampe dimmen und „Genug für
  heute: {{triggerEvent.data.hours_today}} h“ per Telegram senden.
- Wenn der Computer ausgeht (ein Ping-Gerät), **Kimai-Zeitmessung stoppen**.

## Fehlerbehebung

- **„Kimai antwortet nicht“**: Prüfe Adresse und Port vom Gladys-Rechner aus
  (`http://<Adresse>:8001` öffnet Kimai im Browser).
- **„API-Token abgelehnt“**: Das Token wurde gelöscht, ist abgelaufen oder
  falsch abgetippt. Prüfe beim alten API-Passwort auch den **Benutzernamen**;
  lass ihn mit einem API-Token leer.
- **„Keine Kimai-API unter dieser Adresse“**: Die Adresse antwortet, aber
  nicht mit der Kimai-API: Prüfe den Port oder das Pfadpräfix hinter einem
  Reverse Proxy.
- **„Die Adresse leitet um“**: Gib die `https://`-Adresse ein.
- **„Kein sichtbares Projekt hat diesen Namen oder diese Nummer“**: Das
  Projekt ist ausgeblendet, gehört zu einem ausgeblendeten Kunden, oder der
  Benutzer ist nicht im Team, das es sieht.
- **„Eine Zeitmessung läuft schon“**: Aktiviere **Laufende Zeitmessung
  stoppen** in der Aktion oder nutze **Kimai-Zeitmessung umschalten**.
- **Die Stunden weichen vom Kimai-Bildschirm ab**: Gladys zählt den Tag in
  seiner Zeitzone, Kimai in der des Benutzerprofils: Stelle dieselbe ein.
- Protokolle: `LOG_LEVEL=debug` am Container zeigt jede Lesung.

## Grenzen

- Ein Benutzer pro Integration: der des Tokens. Mehrere Benutzer zu verfolgen
  bräuchte je eine Gladys-Integration (heute nicht möglich) oder ein
  Administrator-Token (nicht unterstützt).
- Kimai wird alle 30 Sekunden bis 5 Minuten gelesen, zwei Anfragen pro
  Lesung (die laufenden Zeitmessungen, die Einträge seit Monats- oder
  Wochenbeginn, 250 pro Seite, bis zu 10 Seiten), dazu alle 30 Minuten
  Projekte, Tätigkeiten und Kunden. Kimai-Webhooks (ein Plugin) werden nicht
  genutzt.
- Die Integration startet und stoppt Zeitmessungen und setzt den letzten
  Eintrag fort; sie bearbeitet, löscht und exportiert keine Einträge und
  ignoriert Tags, Sätze und Budgets.
- Getestet mit Kimai 2.70.2. Frühere 2.x-Versionen sollten funktionieren,
  wurden aber nicht getestet, ebenso wenig Kimai Cloud. Kimai 1 wird nicht
  unterstützt.
- Gladys speichert keine Kimai-Daten außer `/data/kimai-state.json` (die
  zuletzt gesehenen Zeitmessungen und der Tag der letzten
  Limitüberschreitung, damit kein Ereignis doppelt auslöst).
- Ohne ein im Alltag genutztes Kimai entwickelt: Rückmeldungen willkommen.
- Nicht mit Kimai verbunden.
