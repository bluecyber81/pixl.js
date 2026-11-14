# LCD-Firmware, Bootloader und SoftDevice

## DE3.74 / App647 und Dateimanager 3.50.0

**Finale LCD-Version.** Am 14. November 2026 bestätigte der Besitzer, dass das Displayfoto in der Fernbedienung auf seinem Allmiibo LCD mit DE3.74 und Dateimanager 3.50.0 funktioniert. Der Diagnoseexport weist App647, Bootloader Z19 und SoftDevice S112 7.3.0 aus. [Firmwarefreigabe](https://github.com/bluecyber81/pixl.js/releases/tag/de3.74)

Unter **Fernbedienung → Displaybild aktualisieren** zeigt das Handy das aktuelle Gerätemenü. Du kannst das Bild drehen, als PNG speichern und nach dem nächsten Tastendruck erneut aufnehmen. Aktiviere dazu am wachen LCD-Allmiibo die BLE-Fernbedienung und verbinde **Pixl.Remote**. DE3.74 fügt die Fotoaufnahme hinzu. Auch auf DE3.73 kannst du mit **Verbindung prüfen** die Uhrzeit der letzten angeforderten Geräteantwort sehen. Ein abgebrochener Verbindungsversuch kann eine neu aufgebaute Dateiübertragung nicht mehr versehentlich trennen.

[Signierte Android-DFU-ZIP für LCD mit PFS1, Z19 und S112 7.3.0](https://github.com/bluecyber81/pixl.js/releases/download/de3.74/Allmiibo_LCD_DE3_74_647_NUR_APP.zip) · [Dateimanager 3.50.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.50.0)

## DE3.73 / App646 · LCD-Testversion

Der Slotdialog bestätigt die Slotnummer. Nach einem Wechsel zur nächsten Figur markiert die Liste beim Zurückgehen die zuletzt betrachtete Figur. Die signierten Pakete enthalten dieselbe App646. Bei installiertem Z19 genügt die [Nur-App-ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.73-test646/Allmiibo_LCD_DE3_73_App646_TEST_DFU.zip). Für kompatible LCD-Geräte mit Bootloaderzähler unter 19 gibt es die [Android-Kombi mit Z19 und S112 7.3.0](https://github.com/bluecyber81/pixl.js/releases/download/de3.73-test646/Allmiibo_LCD_S112_7_3_0_Z19_DE3_73_646_KOMPLETT_TEST.zip). Zur Veröffentlichung von DE3.73 war DE3.65/App637 die stabile Vorauswahl. [Prüfbericht und Quellen](https://github.com/bluecyber81/pixl.js/releases/tag/de3.73-test646)

### Frühere Veröffentlichungen

Der Amiibo-Emulator sortiert die sichtbare Seite im Figurenordner einmal. Unter **Gerät & Diagnose → Alle Diagnosewerte auslesen** zeigt der Dateimanager mit DE3.70 die erkannten Mitteltastenereignisse bis zur ersten Auswahl im Hauptmenü und die Dauer des App-Aufrufs. Die Daten bleiben bis zum Neustart im RAM. [LCD DE3.70 (ZIP)](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_70_642_NUR_APP.zip) · [Web 3.47.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.47.0)


Stand 9. November 2026. Für ein LCD-Allmiibo mit eingerichtetem Packed LittleFS (PFS1) gibt es diese Anwendungsstände:

| Stand | Was du bekommst | Nachweis |
| --- | --- | --- |
| **[DE3.65 / App637](https://github.com/bluecyber81/pixl.js/releases/tag/de3.65) · stabil** | Korrigierter Scrollbalken für Figurennotizen und kompaktere Spielzuordnungen. | Am LCD mit Z19 und S112 7.3.0 ausgelesen. NFC-Erkennung, Scrollbalken und Aufwachen am Gerät bestätigt. [Abschlussbericht](FINAL_DE3_65.md) |
| **[DE3.70 / App642](https://github.com/bluecyber81/pixl.js/releases/tag/de3.70) · Vorabversion** | Weniger Sortierarbeit im Figurenordner, erste Menüauswahl auslesbar. | [Bedienung](RELEASE_DE3_70.md) · [Build](validation/DE3_70.json) |
| **[DE3.69 / App641](https://github.com/bluecyber81/pixl.js/releases/tag/de3.69) · Vorabversion** | Die fünf zuletzt geöffneten Figuren im LCD-Menü aufrufen. | [Bedienung und Gerätestand](RELEASE_DE3_69.md) · [Build](validation/DE3_69.json) |
| **[DE3.68 / App640](https://github.com/bluecyber81/pixl.js/releases/tag/de3.68) · Vorabversion** | Beim Verlassen einer App bleibt ihr Symbol im Hauptmenü ausgewählt. | [Vergleich, Installation und Gerätetest](RELEASE_DE3_68.md) · [Buildnachweise](validation/DE3_68.json) |
| **[DE3.67 / App639](https://github.com/bluecyber81/pixl.js/releases/tag/de3.67) · Vorabversion** | Enthält alle 54 deutschen Spielhinweise und korrigiert das Ende des Scrollbalkens. | Zwei ARM-Bauten mit identischer BIN/HEX, 822 gerenderte LCD-Bilder und 585 QR-Vergleiche. Deutsche Hinweise und QR-Scan am LCD bestätigt. [Praxistest](RELEASE_DE3_67.md). |
| **[DE3.66 / App638](https://github.com/bluecyber81/pixl.js/releases/tag/de3.66) · Vorabversion** | LCD-Bild über den Dateimanager als PNG lesen. Beim Fortsetzen einer Sicherung kann der Browser Dateien auf Laufwerk E bis 572 Byte anhand einer auf dem Gerät berechneten SHA-256 prüfen. | [Bau und Paketprüfung](validation/DE3_66.json) am Rechner. [Displayfoto, Sicherung, Bedienung und NFC am Gerät geprüft](validation/DE3_66_LCD_READBACK.md). [Bedienung](RELEASE_DE3_66.md) |

Die ZIPs enthalten die Anwendung. Der dazugehörige öffentliche [Dateimanager 3.44.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.44.0) läuft im Browser. Für Geräte mit SPIFFS oder einem anderen LittleFS-Layout gilt die [Anleitung zur Speicherumstellung](MIGRATION_PFS1.md).

## Anwendungen bis DE3.64

Die fett verlinkten Versionsnummern führen zu veröffentlichten Firmware-Releases. Die übrigen Zeilen dokumentieren Entwicklungsschritte. Wenn mehrere Änderungen zu einer Version gehören, nennt die Tabelle die für Bedienung oder Datenhaltung wichtigste. Die [Entwicklungsgeschichte](DEVELOPMENT_HISTORY.de.md), der [frühe Änderungsbericht](../CHANGELOG_DE3_SERIES.md) und die [Regressionstests](../fw/tests/de3/) erläutern die einzelnen Fehlerfälle.

| Version | Was sich geändert hat |
| --- | --- |
| DE1, DE2 und DE3 | Deutsche Oberfläche, Katalogsuche und Favoriten. Die frühe Entwicklung der Bluetooth-Übertragung, der Speicherprüfung und der Menüführung ist [nach Themen dokumentiert](../CHANGELOG_DE3_SERIES.md#historical-record-de1de316--historischer-stand-de1de316). |
| DE3.1 | LCD und Flash teilen einen SPI-Bus. Der Treiber schützt die zusammengehörigen Teile eines Transfers, damit kein anderer Gerätezugriff dazwischenkommt. |
| DE3.2 | Begrenzte Ereigniswarteschlange für das Menü, zuverlässigeres Aufräumen beim Appwechsel und direkter Zugriff auf Favoriten hinter Position 100. |
| DE3.3 | Ausstehende NFC-Schreibdaten werden beim Tag- und Appwechsel im Hauptprogramm zugestellt. |
| DE3.4 | AmiiboLink prüft die Länge eingehender Teilstücke und setzt den Transferzustand für die nächste Übertragung zurück. |
| DE3.5 | Vor dem Tiefschlaf wird der Eingang der Mitteltaste samt Pull-up wiederhergestellt, damit der kurze Druck das Gerät wecken kann. |
| DE3.6 | Langsamerer Lauftext auf dem LCD. SPIFFS verwirft ungültige Cacheeinträge nach fehlgeschlagenen Zugriffen. |
| DE3.7 | Verbesserte SPIFFS-Pfadprüfung und gezielte Lesediagnose zur Zuordnung auffälliger Verzeichniseinträge. |
| DE3.8 | Begrenzte Antworten und Aufteilung von Datei- und Verzeichnisdaten bei kleinem Bluetooth-Übertragungsfenster. |
| DE3.9 | Definierter Startzustand des Bluetooth-Bildschirms. Bei Spielen beeinflusst das Loslassen einer Richtungstaste einen gehaltenen Mitteldruck nicht mehr. |
| DE3.10 | Große oder wiederholt geöffnete Menüpfade belegen weniger Verwaltungs-RAM. Bei fehlendem Speicher kann die Mitteltaste das Hauptmenü erneut aufbauen. |
| DE3.11 | SPIFFS meldet Fehler beim Leeren des Schreibcaches. Vor dem Umbenennen eines Ordners werden Zielkollisionen und zu lange Pfade geprüft. |
| DE3.12 | Löschen während eines offenen Dateitransfers wird abgefangen. Korrekturen an Zeichenflächen und abgeschnittenem UTF-8-Text. |
| DE3.13 | Beim Rückweg aus den Einstellungen entfällt die zweite Prüfung eines gerade erfolgreich gespeicherten Zustands. Eine Warteanzeige erscheint vor dem Speichern. |
| DE3.14 | Ein abgewiesener Bluetooth-Lesebefehl kann beim nächsten freien Sendepuffer keine unerwünschten Dateidaten auslösen. |
| DE3.15 | Gezielte Diagnose für wechselnde SPIFFS-Namenseinträge und für Bluetooth-Verbindungen mit kleiner oder großer ATT-MTU. |
| **[DE3.16](https://github.com/bluecyber81/pixl.js/releases/tag/de3.16)** | Fehler beim Lesen belegter SPIFFS-Dateikennungen stoppen die Vergabe einer neuen Kennung. Der Player behandelt Speicher- und Verzeichnisfehler bei der Dateiauswahl. |
| DE3.17 | Die Laufzeitdiagnose liefert Heap-Stichproben, freie Blockgrößen und Fehlerzähler für Bluetooth und Dateisystem. |
| DE3.18 | Beim Wechsel in den DFU-Modus werden die dafür vorgesehenen Registerbits gelöscht und anschließend gesetzt. |
| DE3.19 | Lesediagnose für Bootloader, SoftDevice, Speichergrenzen und den Fingerabdruck der Bootregion. |
| DE3.20 | Der Bluetooth-Bildschirm folgt den tatsächlichen Verbindungs- und Sichtbarkeitsereignissen. |
| DE3.21 | Anwendungsstand zum ersten kombinierten LCD-Prüfpaket mit BL4 und S112 7.3.0. Die separate App akzeptiert auch S112 7.2.0. |
| DE3.22 | NFC-Zeitsteuerung beim Wechsel zwischen Karten- und Amiibo-Emulator. [Regression](../fw/tests/de3/test_nfc_frame_delay_de3_22.py) |
| DE3.23 | Figureninformationen auf dem LCD überarbeitet. [Darstellungstest](../fw/tests/de3/test_amiibo_info_de323.py) |
| DE3.24 | Beim Anlegen mehrerer Tags werden alle geplanten Namen vor dem ersten Schreiben auf Kollision geprüft. |
| DE3.25 | QR-Code bleibt beim Scrollen sichtbar. Langer Text und Scrollbalken bleiben innerhalb ihrer Zeichenfläche. |
| DE3.26 | Bluetooth-Dateisitzung und offene Dateien werden vor einer angeforderten Trennung bereinigt. |
| DE3.27 | Eine Verbindung ohne Anmeldung als Dateimanager wird nach 90 Sekunden freigegeben. |
| DE3.28 | Die Frist für diese erste Anmeldung sinkt auf 30 Sekunden. |
| DE3.29 | Ein Lesefehler liefert keine scheinbar vollständige Ordnerliste. Fehlgeschlagenes Löschen behält die Auswahl bei. |
| DE3.30-PREP / 600 | SPIFFS-Vorbereitung für die gesonderte Migration. Der Assistent kann die Quellsicherung mit den vollständigen 128-Byte-Metadaten prüfen. |
| DE3.31 / 603 | Gepackter PFS1-Zielspeicher auf LittleFS und Wiederherstellung der geprüften Sicherung. [Ablauf](MIGRATION_PFS1.md) |
| DE3.32 | Datenbanknavigation und große Emulatorordner laden die Einträge seitenweise. Das behebt die RAM-Meldung „Speicher voll“ in diesen Ansichten. |
| DE3.33 | Auch Favoriten und Zielordner laden höchstens 24 Einträge pro Seite. Start- und Akkudiagnose kommen hinzu. |
| DE3.34 | Der Speicherstart nutzt den bereits geprüften Index weiter. Ordnerlisten und Einstellungen sparen wiederholte Lesezugriffe. |
| DE3.35 | Ungenutzter Listenspeicher wird freigegeben. UTF-8-Zeichen werden im bestehenden Puffer gelöscht, Katalogbezüge kompakter gespeichert. |
| DE3.36 | Gezielte LittleFS-Korrekturen und Fehlerbehandlung an den Grenzen des Speicherzugriffs. [Regression](../fw/tests/de3/test_lfs_backports.py) |
| **[DE3.37](https://github.com/bluecyber81/pixl.js/releases/tag/de3.37)** | Scheitert die NFC-Speicherung, bleibt die Änderung für die Wiederholung erhalten. |
| DE3.38 | Der Mountvorgang baut den Index während der Inhaltsprüfung auf und spart einen zweiten Durchlauf. |
| DE3.39 | NFC wird beim Verlassen zuverlässig abgeschaltet. [Regression](../fw/tests/de3/test_nfc_nvic_de339.py) |
| DE3.40 | Beim Rückweg aus Einstellungs-Untermenüs bleibt die passende Auswahl im Fokus. |
| DE3.41 | Der PFS1-Start liest Kopf, Namen, Metadaten und Nutzdaten in einem zusammenhängenden Durchlauf. |
| DE3.42 | Korrekturen beim Initialisieren emulierter Karten und bei ungültigen Laufwerksnummern. |
| DE3.43 | Kurzer Mitteldruck, Tastenereignisse bei voller Warteschlange und Hintergrundbeleuchtung bei belegtem Treiber überarbeitet. |
| DE3.44 | AmiiboLink-Speicherung und Namenseditor korrigiert. [Speichertest](../fw/tests/de3/test_amiibolink_commit_de344.py) |
| DE3.45 | Optimierte CRC32-Berechnung beim Lesen von PFS1-Daten. |
| DE3.46 | Weniger wiederholte Bereinigung temporärer Speicherdaten. Zusätzliche Prüfungen für NFC-Rahmen und Fehlerzustände. |
| DE3.47 | Optionale Bluetooth-Fernbedienung für Links, Mitte und Rechts. Freigabe in den Einstellungen bis zum Ausschalten. |
| DE3.48 | Geänderte Datenbank-Slots werden nach NFC-Nutzung gespeichert, ungültige Slot-Einstellungen abgefangen. |
| DE3.49 | Beim Zurücksetzen von Karten werden Speicherfehler angezeigt. Neu initialisierte NTAG-/Ultralight-Karten erhalten konsistente UID-Bytes. |
| DE3.50 | Der Karten-Dateibrowser zeigt bis zu 24 Einträge pro Seite. Bestätigte Flash-Bereitschaft wird für weitere Lesezugriffe wiederverwendet. |
| DE3.51 | Beim vollständigen Raw128-Import werden Datei und Metadaten gemeinsam veröffentlicht. Die Fernbedienung kann direkt in den Dateimodus wechseln. |
| DE3.52 | Ungültige NFC-Sektorauswahl abgefangen. QR-Zuordnungen in der Figurenansicht aktualisiert. |
| DE3.53 | Optionales Disney-Infinity-Profil im Kartenemulator für geeignete eigene 320-Byte-MiFare-Mini-Dateien. |
| DE3.54 | Kartenänderungen bleiben bei fehlgeschlagener Shadow-Speicherung wiederholbar. Ein gleicher CRC16 löst einen Vergleich der gespeicherten Bytes aus. |
| **[DE3.55 / 627](https://github.com/bluecyber81/pixl.js/releases/tag/de3.55)** | PFS1 berechnet zwei CRC32-Zustände gemeinsam. Gezielte LittleFS-Korrektur zur Verschleißverteilung bei Metadaten. |
| **[DE3.56 / 628](https://github.com/bluecyber81/pixl.js/releases/tag/de3.56)** | Besser lesbare Listenmarkierungen. Bildschirmtastatur zeigt bei kurzer Eingabe die passende Groß-/Kleinschreibung. |
| **[DE3.57 / 629](https://github.com/bluecyber81/pixl.js/releases/tag/de3.57)** | [Bluetooth-Zustandssymbol](BLUETOOTH_STATUS_DE3_57.md) neben der Akkuspannung. |
| **[DE3.58 / 630](https://github.com/bluecyber81/pixl.js/releases/tag/de3.58)** | Beim Kartenplatzwechsel bleiben ungesicherte Änderungen für einen neuen Versuch erhalten. Unveränderte Karteninhalte sparen Flashzugriffe. |
| **[DE3.59 / 631](https://github.com/bluecyber81/pixl.js/releases/tag/de3.59)** | Vorhandene Cache-Seiten werden beim Mount nach letzter Nutzung wiederverwendet. Stackreserve messbar, Speicherfehler bei Änderung der Slotanzahl sichtbar. |
| **[DE3.60 / 632](https://github.com/bluecyber81/pixl.js/releases/tag/de3.60)** | QR-Seite im Bluetooth-Menü, Tastatur-Langdruck, lesbare Einstellungswerte und Abbruch beim Erstellen mehrerer Tags. |
| **[DE3.61 / 633](https://github.com/bluecyber81/pixl.js/releases/tag/de3.61)** | Weniger Mount-Lesezugriffe im Modell. Getrennte Zeitmessung für Einbinden, Journalprüfung und restlichen Speicherstart. |
| **[DE3.62 / 634](https://github.com/bluecyber81/pixl.js/releases/tag/de3.62)** | Typ- und Kartenpufferprüfung sowie detaillierte Cache- und Lesezähler beim Einbinden. [Rechnerprüfungen](RELEASE_DE3_62.md) |
| **[DE3.63 / 635](https://github.com/bluecyber81/pixl.js/releases/tag/de3.63)** | Persönliche Notiz und Spielhinweis bekommen getrennte Seiten. Die Geräteschrift zeigt auch Ä, Ö und Ü. [Bedienung](RELEASE_DE3_63.md) |
| **DE3.64 / 636 · lokaler Zwischenstand** | Figurenansichten brechen nach der verfügbaren Breite um, bevorzugt an Wortgrenzen und Bindestrichen. Am Gerät mit Z19 und S112 7.3.0 ausgelesen. Für diesen Stand gibt es keinen eigenen öffentlichen Firmware-Release. [Gerätebeleg](validation/Z19_APP636_BASELINE.json) |

## Bootloader und Nordic-Funksoftware

Die Bezeichnung **BL** beschreibt bei den frühen Fassungen den Programmstand. **Z** bezeichnet den Zähler, den der Bootloader beim Installieren eines Systempakets prüft. So kann dieselbe Bootloader-Software unter mehreren Zählern vorkommen. Ein Update der Anwendung hat einen eigenen Zähler.

| Stand | Änderung oder Zweck |
| --- | --- |
| Frühe Stände 1/2, BL4 und BL5 | Begrenztes Zeichnen auf dem Display, robustere SPI- und DMA-Fehlerbehandlung, geprüfte Updategrößen und sitzungsgebundene Bluetooth-Antworten. [Änderungen mit Quellverweisen](BOOTLOADER_SOFTDEVICE_CHANGES.md) |
| BL6 und BL7 | Abschlusserfolg erst nach bestätigtem Flashzugriff sowie geprüften Settings und deren Sicherung. BL7 gibt Puffer für abgewiesene Aufträge frei. |
| BL8, unter anderem Z9 und Z11 | Scheitert das erneute Einreihen eines angenommenen Abschlussbefehls, erhält dessen Sitzung eine Fehlerantwort. Die eigenständige Z9-Datei und der kombinierte Z11-Pfad enthalten denselben BL8-Code. Z12 war ein Rückkehrpaket mit BL7-Code. [Historischer Komponentenrelease](https://github.com/bluecyber81/pixl.js/releases/tag/bl8-s112-7.3.0) |
| Z13 und Z14 | Z13 ordnet wartende DFU-Aufträge ihrer Sitzung zu, berücksichtigt laufende Schreibvorgänge beim Neustart und unterscheidet Warten, Verbunden, Empfang und Fehler auf dem Display. Z14 war ein Rückkehrpaket mit dem früheren BL8-Code. [Komponenteneinordnung](COMPONENTS.md) |
| Z15 und Z16 | Z15 holt eine bei voller Ereigniswarteschlange versäumte Displayaktualisierung im Hauptprogramm nach. Der kompaktere Build schafft Platz in der Bootregion. Z16 enthält den Z13-Code als Rückkehrpaket. [Z15-Laborpakete und Angaben zu Z16](https://github.com/bluecyber81/pixl.js/releases/tag/bl-z15-lcd-labor) |
| Z17 und Z18 | Z17 zeigt Prüfen und Speichern während der tatsächlichen DFU-Abschlussphasen. Z18 enthält den früheren Z15-Code mit höherem Zähler für den Rückweg. [Quellen und Prüfungen](../bootloader-z17/README.md) |
| **Z19** | Der Abschluss eines Datenobjekts verlangt einen gültigen Updateauftrag und eine positive Bildgröße. Ein konkurrierender Befehl kann den wartenden Abschluss nicht ersetzen. Nach erneuter Verbindung kann der Client den gespeicherten Stand und seine CRC abfragen. Je nach letztem gesicherten Stand werden Daten erneut übertragen. [Quellen](../bootloader-z19/README.md) · [Test der Wiederaufnahme](validation/DE3_65_Z19_FINAL.json) |

Die historischen LCD-Testpakete enthielten BL4 mit Z4, BL5 mit Z6, BL6 mit Z7, BL7 mit Z8 und BL8 mit Z9 bzw. Z11. Daneben gab es Rückkehrpakete mit älterem Code unter höherem Zähler: BL2 mit Z5, BL4 mit Z7, BL5 mit Z8, BL6 mit Z9 sowie BL7 mit Z10 oder Z12. Beispielsweise kann Z9 auf zwei verschiedene Bootloader-Codebilder verweisen. Die Bootdiagnose liefert zusätzlich den SHA-256-Fingerabdruck der gesamten Bootregion. [Komponenten und Identifikation](COMPONENTS.md)

**Nordic S112.** Die frühere Reihe nutzte S112 7.2.0 (FWID `0x0103`). Auf dem qualifizierten LCD ist S112 7.3.0 (FWID `0x0126`) mit Z19, App637 und später [App638](validation/DE3_66_LCD_READBACK.md) ausgelesen worden. Nordic liefert die Funksoftware. Das Projekt hat sie integriert, die reservierten Interrupts im SDK-Header korrigiert und die verwendeten Herstellerbytes verglichen. [Herkunft und Lizenz](../softdevice-s112/README.md) · [Binärprüfung](validation/DE3_65_EINGANG_UND_S112.json)
