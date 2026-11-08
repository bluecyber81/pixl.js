# Allmiibo-Dateimanager im Browser

**[Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/)** ·
[Anleitung für Firmware, Bootloader und LittleFS](https://bluecyber81.github.io/pixl.js/guide/index.html) ·
[Firmware übertragen](https://bluecyber81.github.io/pixl.js/dfu/web.html) ·
[Downloads für 3.42.2](https://github.com/bluecyber81/pixl.js/releases/tag/web3.42.2) · [Versionsgeschichte mit Zwischenständen](VERSIONEN_WEB.md)

Wenn Bluetooth beim Hochladen einer Figur abbricht, zeigt der Dateimanager den betroffenen Speicherort und die ursprüngliche Sitzung an. Steht der Abschluss noch aus, verbinde dasselbe Gerät erneut und prüfe den Zielordner, bevor du den Upload wiederholst. Halte den Browsertab dafür geöffnet.

## Verbinden

1. Die Webseite in Chrome auf Android oder einem unterstützten Computer öffnen.
2. Am eigenen Allmiibo „Bluetooth-Dateiübertragung“ öffnen. Andere Verbindungen
   zu nRF, AmiLoop oder einem weiteren Dateimanager vorher trennen.
3. „Verbinden“ anklicken und das eigene Gerät im Browser auswählen.

Das Allmiibo muss sich beim verwendeten Handy oder Computer befinden. Die
Webseite verbindet sich über dessen Bluetooth; sie macht kein entferntes
Allmiibo über das Internet erreichbar. Der Laptop zu Hause kann ausgeschaltet
bleiben. Die Vorschau und der Figurenkatalog lassen sich ohne Gerät ansehen.

## Dateimanager 3.42.2

Für die aktuelle Version tippe unten im Dateimanager auf **Quellcode (ZIP)** oder **Prüfpaket für ChatGPT (ZIP)**. Beide Downloads funktionieren auch ohne Geräteverbindung.

Die bebilderten Schaltflächen für Figurenimport und Firmwareupdate nehmen oben weniger Platz ein. Beide bleiben direkt antippbar. Am Handy kannst du für 3.42.2 und 3.42.1 jeweils den Web-Quellcode oder das ChatGPT-Prüfpaket herunterladen. Die Quellcode-ZIP ist für die Arbeit am Dateimanager gedacht. Wähle das Prüfpaket, wenn du ChatGPT die Quellen und Nachweise zu DE3.66, Z19 und dem jeweiligen Dateimanager übergeben möchtest.

- **3.42.2 (aktuell)** · [Web-Quellcode (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.42.2/Allmiibo_Dateimanager_3_42_2_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.42.2/Allmiibo_DE3_66_Z19_Web3_42_2_ChatGPT_Pruefpaket.zip)
- **3.42.1 (Vorgängerversion)** · [Web-Quellcode (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.42.1/Allmiibo_Dateimanager_3_42_1_Quellcode.zip) · [ChatGPT-Prüfpaket (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.42.1/Allmiibo_DE3_66_Z19_Web3_42_1_ChatGPT_Pruefpaket.zip)

## Dateimanager 3.42.1

Die sechs Arbeitsbereiche haben eigene Farbakzente. Auf dem Handy führen zwei bebilderte Schaltflächen direkt zum Figurenimport und zum Firmwareupdate. Bei verbundenem Allmiibo zeigt „Dein Gerät“ den geöffneten Ordner, die Zahl seiner Einträge und die Speicherbelegung. Der breite Balken am unteren Rand zeigt den belegten Anteil mit einem Verlauf von Petrol zu Indigo. Neben dem Balken stehen freie und gesamte Kapazität sowie der belegte Prozentanteil. Auf dem Desktop findest du die Karte in der Seitenleiste, auf dem Handy unter den sechs Navigationsschaltflächen. Beide Beispielansichten aus **3.42.1** zeigen simulierte Gerätedaten. [Handy](images/web-3.42.1/mobile.png) · [Desktop](images/web-3.42.1/desktop.png)

Auch bei langsamer Verbindung genügt ein Klick auf **Ich möchte eine Figur hinzufügen**. Sobald die Ansicht geladen ist, springt der Dateimanager zur Figurenauswahl. Unter **Anleitung → Programme und Downloads** findest du den PC-Weg mit nRF Util für Bluetooth-DFU und die dafür erforderliche Nordic-Hardware. Für diesen Browser-Patch ist kein Flashen erforderlich.

## Dateimanager 3.42.0

1. **Ich möchte eine Figur hinzufügen** öffnet die Figurenauswahl und den Import. **Ich möchte die Firmware aktualisieren** öffnet die Geräte- und Paketübersicht für unterstützte LCD-Geräte.
2. Wenn ein eingetragener HTTPS-Link im Katalog nicht direkt geladen werden kann, öffne **Quelle im Browser öffnen**. Wähle anschließend bei derselben Figur **Heruntergeladene BIN prüfen** und die gespeicherte Datei. Bei passender ID kannst du dieselben geprüften Daten mit **Im Geräteimport öffnen** zur Übertragung vorbereiten.
3. Öffne unter **Dateien → Auf dem Gerät suchen** beim gewünschten Dateitreffer **Vom Gerät herunterladen**. Der angezeigte Ordnerpfad hilft bei gleichnamigen Dateien.
4. Unter **Figurenkatalog → Bestand prüfen** kannst du nach dem Vergleich das Ergebnis als CSV für Excel speichern. Dazu ist keine weitere Bluetooth-Abfrage nötig. Der Export enthält Pfad und Prüfbereich. Das Präfix `0x` hält die komplette Figuren-ID in Tabellenkalkulationen lesbar.

## Dateimanager 3.41.0

1. **Figurenkatalog** öffnen und bei der gewünschten Figur **Downloadlink eintragen** aufklappen. Bei gleichnamigen Figuren auf Serie und ID achten.
2. Den direkten HTTPS-Link zur BIN-Datei einfügen und **Link speichern** wählen. Der Link bleibt in diesem Browser auf dieser Website gespeichert.
3. Den **Figurennamen mit dem Pfeil ↓** antippen. Der Dateimanager lädt die Datei vom angegebenen Server, prüft Größe, Grundstruktur und Figuren-ID und startet den BIN-Download auf Handy oder Laptop. Dafür genügt der Browser.
4. Über **Downloadlink bearbeiten** lässt sich die Adresse austauschen oder entfernen.

Der Dateiserver muss die BIN direkt über HTTPS ausliefern und den Abruf aus dem Browser erlauben (CORS). Der Katalog enthält öffentliche Figurendaten. Persönliche Downloadadressen kommen vom Nutzer und werden beim Anzeigen des Katalogs nicht abgerufen. Wer zusätzlich auf sein Allmiibo übertragen möchte, öffnet die Figur über **Details und Bild** und nutzt unter **Figurendatei übernehmen** den bereits vorhandenen Import.

## Dateimanager 3.40.1

- **Update** – Beim Öffnen des Updaters über die Paketkarte ist die gewählte Version bereits markiert. Paketprüfung und Bluetooth-Übertragung startest du selbst.
- **Figurenkatalog → Filter → Serie** – Auch eine Serie, zu der erst Ankündigungen vorliegen, lässt sich auswählen. Ankündigungen zählen separat von den bestätigten Katalog-IDs.
- **Sicherung** – Nach einer abgeschlossenen Sicherung siehst du, wie viele Dateien frisch gelesen und wie viele aus dem geprüften Zwischenstand übernommen wurden.

## Dateimanager 3.40.0

Unter **Figurenkatalog → Angekündigte Figuren** sind neun Ankündigungen mit Regionsangaben aufgeführt. In der Gerätesuche öffnet ein Dateitreffer die Figurenbild-Vorschau. Mit der LCD-Testfirmware DE3.66 kannst du unter **Gerät & Diagnose → LCD-Displayfoto → Displayfoto aufnehmen** den aktuellen Bildschirm als PNG speichern. Die DFU-Seite schätzt während der Übertragung die verbleibende Zeit anhand bestätigter Bytes. [Anleitung für 3.40.0](RELEASE_DE3_66.md)

## Figurensammlung, Karten-Slots und Sicherungsimport

**Figurenkatalog → Details und Bild** und die **Dateivorschau** zeigen Katalogzuordnungen und vorhandene Nutzungshinweise. Der Quellenstand umfasst 952 Figuren und 1.344 Zuordnungen. Alle 54 unterschiedlichen englischen Nutzungshinweise liegen auch auf Deutsch vor. Übersetzte Hinweise bieten den englischen Originaltext zum Aufklappen. Das ist keine Bestätigung von Spielkompatibilität oder Belohnungen.

**Figurensammlung → Prüfung: Dateiinhalte prüfen (empfohlen) → Sammlung prüfen → Anzeigen → Gleiche Figuren-ID / Dateiinhalte** zeigt getrennte SHA-256-Gruppen innerhalb einer Figuren-ID. Der Vergleich nutzt bereits gelesene Bytes, ohne weitere BLE-Dateilesen. Gleiche ID allein genügt nicht: UID, Spielstand und Varianten können abweichen. Die Schnellprüfung sagt ausdrücklich, dass Inhalte ungeprüft sind. Es wird nichts automatisch gelöscht. Nach Schreibvorgängen den veralteten Bericht erneut prüfen.

**Gerät & Diagnose → Karten-Slot lokal prüfen** öffnen. Aus derselben eigenen Sicherung zuerst `chameleon/slots/config.bin` im Format v8 laden, dann den Slot auswählen und die dazu angezeigte `NN.bin` laden; Slot 1 verwendet `00.bin`. Unterstützt sind MF0ICU1, MF0ICU2, MF0UL11 und MF0UL21 mit passender Länge und passendem Layout. Nur beim bekannten alten UID-Kopiermuster und gültigen BCC0/BCC1 erscheint **Korrigierte Kopie herunterladen**. Die neue `NN.uid-corrected.bin` wird lokal nachgeprüft, ändert höchstens vier UID-Bytes und erhält alle übrigen Bytes. Die Quelle bleibt unverändert; kein Schreiben auf das Gerät. Dateiherkunft, Karteninhalt, Authentifizierung und Lesegerätfunktion sind damit nicht bestätigt.

**Sicherung → ZIP importieren → Sicherungs-ZIP auswählen → Vergleichen:** Exakte inaktive Stamm-Journaldateien `.pixl_txn_old` und `.pixl_txn_new` bleiben in der Schema-1-Sicherung erhalten, werden aber als gesperrt angezeigt. Andere sichere Dateien bleiben auswählbar. Aktive oder unbekannte Stamm-Transaktionseinträge, darunter `.pixl_txn_pending` oder ein Ordner mit Journalnamen, sperren den gesamten Import. Quelle und Zielumleitung werden kontrolliert, der Zielzustand vor Schreiben erneut gelesen. Normale Unterordner mit gleichnamigen Dateien werden nicht pauschal ausgeschlossen. Schema 2 bleibt beim Migrationsassistenten. Keine automatische Journalbereinigung.

Sammlungsabgleich und lokale Slotprüfung wurden mit Web 3.39.0 eingeführt. [Versionshinweise zu 3.39.0](RELEASE_WEB3_39_0.de.md)

## Funktionen und Daten

* **Figurensammlung → Sammlung prüfen.** Beim Suchen der Ordner siehst du die verstrichene Zeit und die bisher gefundenen BIN-Dateien. Die Inhaltsprüfung zeigt anschließend „gelesen / gesamt“ und schätzt die Restzeit aus abgeschlossenen Dateilesevorgängen.
* **Sicherung & Wiederherstellung → Ordner sichern (ZIP).** Öffne den gewünschten Ordner oder für das ganze Laufwerk **E:/**. Nach der Ordnersuche erscheint die geschätzte Lesezeit. Falls das Handy die Bluetooth-Verbindung verliert, lass den Tab geöffnet, verbinde dasselbe Gerät erneut und tippe auf **Sicherung fortsetzen**. Der ursprüngliche Ordner ist bereits ausgewählt. Ab DE3.66 prüft das Gerät Dateien bis 572 Byte auf E: mit SHA-256. Stimmen die aktuellen Daten mit dem Zwischenstand überein, genügen 32 Byte Prüfsumme als Antwort. Größere Dateien und Dateien auf älteren Geräten liest der Dateimanager erneut. Nach dem abschließenden Ordnervergleich erstellt der Browser die ZIP.
* **Ordnersicherung nach Schließen des Browsers fortsetzen.** Aktiviere diese Option vor der Sicherung, wenn die gelesenen Dateien einen Browserneustart überstehen sollen. Öffne danach dieselbe Webadresse im selben Browserprofil, verbinde dasselbe Allmiibo mit derselben Firmware und wähle denselben Ordner. Unter **Sicherung** zeigt der Dateimanager den vorhandenen Zwischenstand an. Mit **Sicherung fortsetzen** werden Ordner und Dateiinhalte erneut mit dem Gerät abgeglichen. Auf einer gemeinsam genutzten Browserinstallation können andere Personen mit Zugang zu diesem Profil auf die gespeicherten Dateien zugreifen.
* Der Browser legt bis zu 16 MiB im lokalen Websitedatenspeicher ab. Die Anzeige meldet, ob er den angeforderten Speicherschutz gewährt hat. Bei Speicherplatzmangel kann der Browser ungeschützte Daten entfernen. Das Löschen der Websitedaten entfernt auch geschützte Zwischenstände. Ist der Speicher voll, bleiben die bis dahin erfolgreich gespeicherten Dateien als unvollständiger Zwischenstand erhalten. Ein zweiter Tab kann einen laufenden Zwischenstand erst bearbeiten, wenn der erste Tab ihn freigibt.
* Lade die fertige ZIP über **Sicherungs-ZIP speichern** herunter und prüfe sie im Downloadordner. Anschließend löscht **Zwischenstand verwerfen** die lokale Browserkopie. Die heruntergeladene ZIP ist eigenständig. Für eine LittleFS-Umstellung wird die Raw128-Quellsicherung weiterhin vollständig frisch eingelesen.
* **Orange im Figurenkatalog.** Zu dieser ID gibt es einen Eintrag mit einem Prüfhinweis. Ein Beispiel ist eine abweichende ID in Dateieigenschaften und Inhalt. Auf der Karte steht der konkrete Grund. Die Farbe allein sagt nichts über die Erkennung an einer Konsole aus.

Dateien und Ordner, Bilder und Figureninfos, Suche, ZIP-Sicherung und Import,
Diagnose, Fernbedienung sowie die DFU-Seite bleiben erhalten. Einzelne
Gerätefunktionen setzen eine passende Firmware und deren gemeldete Fähigkeiten
voraus. Der Dateimanager zeigt fehlende oder unbestätigte Werte entsprechend an.

Sicherungen und Figurendateien werden lokal im Browser verarbeitet und direkt
zwischen dem gewählten Gerät und dem verwendeten Handy/Computer übertragen.
Die Webseite lädt sie nicht zu GitHub hoch. Browser-Zwischenspeicher ist keine
dauerhafte Sicherung; benötigte ZIP-Dateien ausdrücklich herunterladen.
Die GitHub-Webadresse hat ihren eigenen Browser-Speicher. Eine unter localhost
begonnene Wiederherstellung wird daher nicht automatisch im Online-Tab fortgesetzt.
Eine laufende Übertragung zuerst abschließen; anschließend bei Bedarf dieselbe
gespeicherte Sicherungs-ZIP auf der Online-Seite erneut auswählen.

GitHub erhält die üblichen Abrufe der Webseite. Figurenbilder werden anhand
öffentlicher Figuren-IDs geladen. Persönliche UID, lokale Dateinamen und
Figurendateiinhalte sind dafür nicht erforderlich.

## Firmware-Update

Auf dem Handy und am PC zeigt Schritt 2 den Verlauf. Unter **Übertragen** bestätigt der Bootloader die empfangenen Bytes. **Prüfen** vergleicht die Prüfsumme der gesamten Anwendung. **Abschließen** wartet auf die Antwort des Bootloaders. Auch bei 100 % kann diese Antwort noch ausstehen. Nach seiner Bestätigung erscheint **Wiederverbinden**. Prüfe die Version im Gerätemenü, öffne die Bluetooth-Dateiübertragung und wähle auf der DFU-Seite **Dateimanager öffnen → Verbinden**.

Bricht die Verbindung ab, bevor der Bootloader den Abschluss bestätigt, zeigt die Seite den betroffenen Schritt und den letzten bestätigten Byte-Stand. Prüfe zuerst die Version am Gerät. Ein weiterer Updateversuch erfordert eine neue Geräteauswahl.

Im Dateimanager unter **Gerät & Diagnose → Alle Diagnosewerte auslesen** die Bootinformationen einlesen, wenn du sie beim Update zum Vergleich verwenden möchtest. Anschließend die Dateiverbindung trennen. Auf der DFU-Seite das Paket auswählen. Schritt 1 zeigt den Anwendungszähler, das Hardwarefeld und die erlaubten SoftDevice-FWIDs aus den Init-Daten der ZIP-Datei. Wenn eine höchstens zehn Minuten alte Bootdiagnose verfügbar ist, kommen die Vergleichswerte und eventuelle Hinweise hinzu. Vor dem Übertragen das gewünschte Gerät in den DFU-Modus versetzen und im Browser auswählen.

Im Web-Updater ist DE3.65/637 die stabile LCD-App. DE3.66/638 ist als Testversion auswählbar. Beide Anwendungs-ZIPs setzen passendes LCD und vorhandenes PFS1 voraus. [Pakete und Voraussetzungen](INSTALLATION.md) · [Migration von anderen Speicherformaten](MIGRATION_PFS1.md) · [Nachbau der Testversion](BUILD_DE3_66.md)


## Startzeiten vergleichen

**Gerät & Diagnose → Startzeiten lesen → Früheren Startbericht vergleichen** öffnet die lokale Dateiauswahl für einen früheren Startbericht oder eine Gesamtdiagnose. Die Unterschiede beziehen sich auf die sechs Zeitmarken seit Beginn der Speicherinitialisierung. Ein negativer Wert in Millisekunden bedeutet eine kürzere Zeit. Bootloader und frühe SDK-Initialisierung liegen davor. Verwende Berichte derselben Sammlung und desselben Geräts.

Gerät & Diagnose: DE3.59 meldet den unberührten Stack ab Anwendungseinstieg. Bei älteren Versionen ist das Feld unbekannt. Unter Startzeiten lassen sich 3 bis 20 gespeicherte Berichte unterschiedlicher Neustarts derselben Firmware bei gleicher Sammlung vergleichen (Median und Minimum–Maximum). Mehrfache Abrufe desselben Starts zählen nicht mehrfach.
