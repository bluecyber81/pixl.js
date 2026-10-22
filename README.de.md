# Allmiibo LCD — DE3-Community-Firmware

[English](README.md) · [DE3.16 herunterladen](https://github.com/bluecyber81/pixl.js/releases/tag/de3.16) · [Alle Änderungen der DE-Reihe](CHANGELOG_DE3_SERIES.md) · [Buildanleitung](docs/BUILD_DE3_16.md)

**Community-Vorabversion: `2.21.0-DE3.16`, Anwendungs-Updatezähler `572`.** Dieser Fork entwickelt die LCD-Firmware und einen separaten Browser-Dateimanager weiter. Grundlage ist [cylin577/pixl.js](https://github.com/cylin577/pixl.js) `v2.21.0`, Commit `57a364329436745f780e70ac07a1642989a00d6f`, ausgehend vom ursprünglichen Projekt [solosky/pixl.js](https://github.com/solosky/pixl.js). DE3.16 ist keine offizielle Veröffentlichung dieser beiden Projekte.

## Hardware und Paketumfang

Geprüft wurde ein Allmiibo LCD mit **nRF52832, monochromem 128×64-LCD, Rädchen/Mitteltaste und USB-C-Anschluss**. Das Buildziel lautet `BOARD=LCD`. Daraus folgt keine Freigabe für jedes als „Allmiibo“ verkaufte Gerät, jede Platinenrevision oder OLED-Geräte.

Das OTA enthält **nur die Anwendung**. Es installiert keinen Bootloader, kein Nordic SoftDevice, keinen PC-Bluetooth-Treiber, keine Figurensammlung und keine `key_retail.bin`. Figurendateien werden getrennt von der Firmware verwaltet. Katalognamen und IDs sind Metadaten; sie ersetzen keine gültigen Tagdaten und garantieren keine Unterstützung in einem bestimmten Spiel.

## Was die DE-Reihe ergänzt

- Deutsche und englische Oberfläche, Katalogsuche nach Name oder ID, Filter und Favoriten.
- Ausgehandelte Bluetooth-Anfragefragmentierung und geteilte Antworten für kleine ATT-MTUs einschließlich MTU23, mit erhaltenem Modus für ältere Clients. Transferfehler, Verbindungsabbruch und verspätete Rückrufe werden ausdrücklich behandelt.
- Geprüfte Speicherzugriffe, begrenzte Pfade, Journalabsicherung für ausgewählte kleine Einstellungs-/Datensätze sowie bessere Behandlung fehlgeschlagener Cache-Schreibvorgänge und aufgegebener Dateihandles.
- Wiederhergestellte Aufwachkonfiguration der Mitteltaste beim geprüften LCD-Design, langsamerer Lauftext mit Lesepausen und sichtbare Rückmeldung beim Speichern. Beim Rückweg ins Hauptmenü entfällt die doppelte Speicherprüfung.
- Geprüftes Speicherwachstum in ausgewählten UI-Pfaden, Aufräumen bei fehlgeschlagenem Appstart, sichere UTF-8-/Canvas-Grenzen, kleinere QR-Stackpuffer, NFC-Befehlsgrenzen und Passwortseitenmaskierung bei Standard-NTAG215.
- Separater **Dateimanager 3.12.0** mit Vue 3/Vite. Die vier Minispiele und der PIXV-Animationsplayer stammen bereits aus dem Basis-Fork und wurden übernommen.

Die [kumulative Übersicht nach Komponenten](CHANGELOG_DE3_SERIES.md) beschreibt auch die früheren Korrekturen und deren Grenzen.

## Neu in DE3.16

1. **SPIFFS-Datei-ID-Vergabe:** Ein Fehler beim Lesen eines Dateiheaders bricht die Suche ab. Eine bereits belegte ID darf dadurch nicht fälschlich als frei behandelt werden.
2. **Player-Dateiauswahl:** Der Aufbau des Wiedergabepfades prüft den verfügbaren Speicher. Bei Speichermangel bleibt die bisherige Auswahl erhalten und die Speichermeldung erscheint.
3. **Player-Verzeichnisliste:** Lese- und Schließfehler erscheinen nicht mehr als leerer Ordner oder vollständige Teilliste. Stattdessen wird der Fehler angezeigt; der Hauptmenü-Eintrag bleibt erreichbar.

## Installation und Verwendung

1. Passende LCD-Hardware und vorhandene kompatible DFU-Umgebung prüfen; Dateien und Einstellungen sichern.
2. **`Allmiibo_LCD_DE3_16_572.zip`** von der [Release-Seite](https://github.com/bluecyber81/pixl.js/releases/tag/de3.16) herunterladen.
3. Im vorhandenen Secure-DFU-Ablauf genau diese Anwendungs-ZIP auswählen. Quellcodearchive und Gesamtpakete sind keine direkt flashbaren Firmwarepakete.
4. Nach dem Neustart `2.21.0-DE3.16` prüfen und Menüs, Schlafen/Aufwachen, Bluetooth-Dateitransfer sowie NFC am eigenen Gerät testen.

Der Browser-Dateimanager ist eine separate Anwendung unter `web/`. Das Firmwareupdate aktualisiert ihn nicht. Sein Paket benötigt Node.js **ab 22.12.0**. Die [öffentliche Buildanleitung](docs/BUILD_DE3_16.md) beschreibt Werkzeuge und Build; ein Build ist kein Flashvorgang.

Das bereits gebaute Dateimanager-ZIP enthält auch einen lokalen Python-Starter. Node.js wird zum Neubauen benötigt, nicht zum Bereitstellen dieser fertigen Webdateien.

Die Rückkehrdatei **`Allmiibo_LCD_DE3_15_RUECKKEHR_573.zip`** enthält exakt die frühere DE3.15-Anwendung mit Zähler `573`. Danach muss ein späteres Update einen Zähler über `573` besitzen. Sie stellt keine Sicherung der Figuren oder Einstellungen wieder her. Die alte DE3.15-ZIP mit Zähler `570` ist nicht diese Rückkehrdatei.

## Prüfstand und bekannte Grenzen

Für DE3.16 bestanden **70 Host-Testsuiten**. Die beiden neuen gezielten Suiten enthalten **175 Fälle (17 Speicher + 158 Player)**; sie bestanden nativ und erneut mit AddressSanitizer/UndefinedBehaviorSanitizer. Gegenproben am vorherigen Quellstand reproduzieren die behobenen Fehler. Die Änderungen wurden unabhängig gegengeprüft; Paketmetadaten, Payload-Hash und Signatur wurden verifiziert.

Der geerbte DFU-Signierschlüssel ist bereits im ursprünglichen Projekt öffentlich verfügbar. Die Signatur erfüllt das Format des kompatiblen Bootloaders; sie beweist **keine geheime Herausgeberidentität**. Die Prüfsummen dieser Veröffentlichung dienen zum Vergleich der heruntergeladenen Dateien.

Bei einem geprüften LCD-Gerät meldete Browser-DFU den Abschluss, das normale Menü erschien wieder und eine neue Bluetooth-Abfrage las `2.21.0-DE3.16` bei beobachteter **ATT MTU250**. Das ist eine Versionsabfrage, kein vollständiges Auslesen des Firmwareabbilds. NFC, Schlafen/Aufwachen und echte MTU23-Transfers wurden **unter DE3.16 noch nicht erneut geprüft**. Erfolgreiche reale MTU23-Lese-/Schreib-/Fehlerfalltests aus DE3.15 bleiben historische Belege. Der unveränderte Dateimanager übernimmt seine ursprünglichen **84 Webtests**; diese wurden für diesen Firmwarestand nicht neu ausgeführt.

**Offener Befund:** Gelegentlich erschien ein zusätzlicher verstümmelter Tybalt-Verzeichniseintrag. Die reguläre Datei blieb lesbar, der zusätzliche Eintrag ließ sich nicht öffnen. Die Ursache ist ungeklärt. DE3.16 behauptet keine Behebung und filtert, löscht, repariert oder formatiert den Speicher nicht automatisch.

Hosttests belegen nicht jede Ereignisreihenfolge, Hardwarevariante, freie Laufzeit-RAM-/Stackreserve, Langzeitzuverlässigkeit oder Wiederherstellung nach beliebigem Stromausfall. Nach einem anfänglichen Fehler beim Laden der Einstellungen bleibt außerdem die Speichersperre vorsichtig bestehen: Erneutes Einhängen allein erlaubt kein Überschreiben unbekannter Einstellungen.

## Mitwirkende und Lizenz

Danke an solosky, cylin577 und die ursprünglichen Komponentenentwickler. Die [GNU GPL Version 2](LICENSE) bleibt erhalten; mitgelieferte Drittkomponenten behalten ihre eigenen Hinweise. Die getrennten Bedingungen stehen in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) und [LICENSES](LICENSES). Bitte die Urheberangaben bei Weitergabe beibehalten; dieser Quellstand lizenziert fremden Code nicht um.
