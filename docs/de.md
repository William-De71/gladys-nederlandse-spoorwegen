# Nederlandse Spoorwegen

## Überblick

Diese Integration bringt **NS**, die niederländische Bahn, in Gladys. Sie liefert die **nächsten Züge in Echtzeit, mit Verspätung und Gleis**, an den Bahnhöfen deiner Wahl (drei im Formular, bis zu 10 weitere per Schaltfläche), gefiltert nach Zuggattung und Richtung. Sie verfolgt auch die **Störungen** an jedem Bahnhof: Vorfälle (Signalstörung, liegengebliebener Zug), Bauarbeiten und Notlagen (Sturm, Streik). Jeder Bahnhof wird zu einem Gerät, das du auf einem Dashboard anzeigen und in Szenen nutzen kannst.

Die Daten stammen aus der **offiziellen API von NS** (`gateway.apiportal.ns.nl`), mit deinem eigenen kostenlosen Schlüssel. Jeder verfolgte Bahnhof wird mit einer Anfrage gelesen, standardmäßig jede Minute (alle 10 Minuten, solange kein Bahnhof in der nächsten halben Stunde einen Zug ankündigt, nachts). Die Störungen werden alle 5 Minuten gelesen. Die Liste der Bahnhöfe von NS wird von der Integration gespeichert und einmal pro Woche neu gelesen. NS erlaubt 300 Anfragen pro 5 Minuten und Schlüssel: Die Integration bleibt immer darunter.

NS liefert die **erwartete Zeit** jedes Zuges: Die Verspätung ist der Abstand zur geplanten Zeit. **Gleiswechsel** und **ausgefallene Züge** werden angezeigt. Bahnhofsnamen, Hinweise und Störungen bleiben auf Englisch, wie NS sie schreibt.

Dies ist eine **Cloud**-Integration: Sie kontaktiert `gateway.apiportal.ns.nl` mit deinem Schlüssel. Sonst verlässt nichts dein Netzwerk.

## Voraussetzungen

- Gladys Assistant 5.3.0 oder neuer.
- Ein kostenloser Schlüssel der NS-API: Lege ein Konto auf [apiportal.ns.nl](https://apiportal.ns.nl/) an, öffne **Products**, abonniere **Ns-App** (kostenlos) und kopiere dann den **Primärschlüssel** aus deinem Profil.

## Konfiguration

| Feld                 | Was eintragen                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| API-Schlüssel        | Der Primärschlüssel deines „Ns-App“-Abonnements (32 Zeichen).                                             |
| Bahnhof 1, 2, 3      | Der Code des Bahnhofs („UT“, „ASD“, die Codes der NS-Anzeigen) oder sein Name („Utrecht Centraal“).       |
| Zuggattungen         | Nur diese Züge: „IC“, „SPR“, „IC \| ICE“. Leer: alle Züge.                                                |
| Richtung             | Nur Züge, die zu diesen Bahnhöfen fahren oder dort halten: „Amersfoort \| Zwolle“. Leer: alle Richtungen. |
| Abfrage der Bahnhöfe | Alle 30 Sekunden, jede Minute, alle 2 Minuten oder alle 5 Minuten.                                        |
| Sprache der Texte    | Namen der Geräte, Zusammenfassungen und Ausgaben der Szenen. Die Texte von NS bleiben auf Englisch.       |

Die Schaltfläche **Bahnhof suchen** liefert die Bahnhöfe mit einigen Wörtern, samt Code („Den Haag Centraal [GVC]“). Ein Name funktioniert auch („Utrecht“, „Den Bosch“); teilen sich zwei Bahnhöfe einen Namen, gib den vollständigen Namen oder den Code ein. **Verbindung testen** prüft den Schlüssel und liest jeden Bahnhof sofort.

Die **Richtung** berücksichtigt das Ziel und die nächsten Halte des Zuges: „Amersfoort“ behält den Intercity nach Zwolle, der in Amersfoort hält.

Mehr Bahnhöfe als die drei des Formulars (Zuhause, Arbeit, Schule…): **Bahnhof hinzufügen** nimmt dieselben drei Felder — Bahnhof, Zuggattungen, Richtung — und verfolgt bis zu 10 weitere Bahnhöfe. **Bahnhöfe auflisten** zeigt alle verfolgten Bahnhöfe nummeriert; **Bahnhof entfernen** nimmt diese Nummer (oder den Namen). Die hinzugefügten Bahnhöfe werden in der Konfiguration von Gladys gespeichert und folgen so ihren Sicherungen.

## Verwendung

### Geräte

Lege im Tab **Entdecken** die gewünschten Geräte an, **NS \<Bahnhof\>**:

- der nächste Zug als Text („IC 3529 → Venlo · 11 Min. (+8 Min. Verspätung) · Gleis 15 (geändert)“);
- die Wartezeit des nächsten Zuges und des folgenden (Minuten) und die Verspätung des nächsten (Minuten);
- die Verkehrslage als Text („Gestört: Utrecht - Amersfoort: fewer trains“) und die Anzahl laufender Störungen.

Nachts, ohne Zug, behalten die Wartezeiten ihren letzten Wert.

### Störungen

NS veröffentlicht drei Arten: **Störungen** (Vorfälle), **Bauarbeiten** (geplant) und **Notlagen** (landesweite Hinweise). Der Zustand eines Bahnhofs ist die schwerste laufende: normaler Betrieb, Bauarbeiten, gestört oder große Störung. Bauarbeiten, die in den nächsten drei Tagen beginnen, werden als „demnächst“ angezeigt.

### Dashboard-Widgets

![Das Widget NS-Abfahrten von Utrecht Centraal und das Widget NS-Störungen zweier Bahnhöfe (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-nederlandse-spoorwegen/main/docs/assets/widgets.de.png)

- **NS-Abfahrten**: die Abfahrtstafel eines Bahnhofs: eine Zeile pro Zug, mit geplanter Zeit, Gattung, Ziel, Verspätung („+8“) und Gleis. Die Zeile wird orange, wenn der Zug 5 Minuten oder mehr Verspätung hat oder das Gleis wechselt, rot, wenn er ausfällt. Die Einstellung **Angezeigte Züge** legt die Anzahl der Zeilen fest. Wähle einen verfolgten Bahnhof oder gib einen beliebigen Bahnhof (und Zuggattungen) in den Widget-Einstellungen ein. Mit **Mehrere Bahnhöfe** zeigt ein Widget mehrere Bahnhofs-Geräte.
- **NS-Störungen**: der Zustand deiner Bahnhöfe, dann die laufenden und kommenden Störungen und Bauarbeiten mit ihrem Zeitraum. Tippe auf eine Karte für den vollständigen Text. Mit **Ganzes Netz** die Störungen des ganzen niederländischen Netzes.

### Szenen

Auslöser, einmal pro Änderung (die erste Abfrage dient nur als Referenz):

- **NS: Zug fährt bald ab**: Ein Zug eines verfolgten Bahnhofs fährt in 2, 5, 10, 15, 20 oder 30 Minuten ab, gezählt nach seiner erwarteten Zeit.
- **NS: Zug fällt aus**: Ein Zug der nächsten zwei Stunden an einem verfolgten Bahnhof fällt aus.
- **NS: Zug verspätet**: Die Verspätung eines Zuges der nächsten zwei Stunden erreicht 5, 10, 15 oder 30 Minuten (die höchste erreichte Stufe). Kreuze 5, 10, 15 und 30 an für jede Verspätung ab 5 Minuten.
- **NS: Gleiswechsel**: Ein Zug der nächsten zwei Stunden fährt von einem anderen Gleis ab.
- **NS: Störung an einem Bahnhof**: Eine Störung, Bauarbeiten oder eine Notlage an einem verfolgten Bahnhof beginnt.
- **NS: Störung beendet**: Sie ist vorbei.

Jeder liefert einen fertigen Satz, `{{triggerEvent.data.summary}}`, und seine Werte (Zug, Ziel, Uhrzeit, Gleis, Verspätung, Titel, Ursache…). Die Aktionen **NS: nächste Züge** und **NS: Störungen eines Bahnhofs** liefern dieselbe Art von Werten, für eine Nachricht oder eine Bedingung.

Beispiele:

- Wenn der Intercity nach Amersfoort in 10 Minuten in Utrecht Centraal abfährt → die Flurlampe grün einschalten.
- Wenn dein Zug ausfällt, 15 Minuten Verspätung hat oder das Gleis wechselt → die Zusammenfassung an dein Telefon senden.
- Jeden Werktag um 7:30 → die nächsten Züge deines Bahnhofs lesen und vom Küchenlautsprecher ansagen lassen.

### Transport

Nur Cloud: Die Daten kommen aus dem Internet. Nur die verfolgten Bahnhöfe werden bei der API von NS abgefragt, einer nach dem anderen.

## Fehlerbehebung

- **„NS lehnt den API-Schlüssel ab“**: Prüfe, ob du den Primärschlüssel des Produkts **Ns-App** kopiert hast und ob das Abonnement auf apiportal.ns.nl aktiv ist.
- **„Unbekannt oder mehrdeutig“**: Nutze **Bahnhof suchen** und kopiere dann den genauen Namen oder den Code.
- **„Zu viele Anfragen an NS“**: Der Schlüssel wird mit einer anderen Anwendung geteilt, oder zu viele Bahnhöfe werden alle 30 Sekunden gelesen; wähle eine längere Abfragezeit.
- **Kein Zug**: Nachts schläft das Netz; der Bahnhof wird alle 10 Minuten gelesen.
- **„NS ist nicht erreichbar“**: Die Integration versucht es bei jeder Abfrage erneut; die letzten Züge bleiben auf den Widgets.
- **Ein Problem melden**: Drücke **Diagnose** und kopiere dann die Zeilen, die mit „NS diagnostic“ beginnen, aus dem Tab Protokolle in ein GitHub-Issue oder eine Antwort im Forum, mit den Versionen von Gladys und der Integration. Der Schlüssel steht dort nie.
