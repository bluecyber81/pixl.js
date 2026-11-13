# Allmiibo LCD DE3.73 / App646 · Prüfstand vom 13. November 2026

Der Kandidat basiert auf DE3.72/App645, Commit `a8e4b0c746611128f3e5de2f998c4d84aaf885e2`. Er umfasst den Dateimanager 3.48.2. Die veröffentlichte Basis ist in `RELEASE_INFO.json` dokumentiert. Zum Identifizieren des neuen Gerätestands gehören Versionsangabe, Zähler und eingebettete Quellkennung zusammen.

## Was sich beim Benutzen ändert

- Ein langer Mitteldruck auf „Zurück“ in der Slotliste öffnet kein Löschmenü. Bei einem echten Slot zeigt die Bestätigung die Nummer an. Abbrechen ist vorausgewählt. Ein Schreibfehler bleibt sichtbar.
- Nach einem Figurenwechsel in der Detailansicht kehren Dateibrowser und Favoriten zur zuletzt betrachteten Figur zurück. Der Favorit bleibt auch beim Abbrechen der Zielordnerauswahl über Seitengrenzen hinweg ausgewählt.
- Der RAM-Notdialog berücksichtigt die gewählte Sprache. Das Tiny-Lander-Titelbild benötigt weniger Flash und liefert dieselben 1.024 Displaybytes.
- Die BLE-Dateiübertragung prüft den Öffnungsmodus vor dem Wechsel einer laufenden Datei. Der Schreibschutz wird gezielt in den vorhandenen Metadaten geändert. Bei einer nicht eindeutig auswertbaren Struktur bricht die Änderung mit einer Meldung ab.
- Der Dateimanager erkennt reservierte Ziele im Stammordner schon vor dem Schreiben. Die Sicherungstexte unterscheiden den Stand im geöffneten Tab, eine im Browser gespeicherte Sicherung und die heruntergeladene ZIP. Die lokale LittleFS-Platzprüfung kennt App646. Die Werkzeuge für den Webbuild und die Übersetzungsbibliothek wurden aktualisiert.

## Pakete für Android

Beide sind Testpakete für das kompatible Allmiibo LCD mit bestehendem Packed LittleFS (PFS1). Die neue Anwendung hat den Zähler 646. Bei vorhandenem Z19 ist das Nur-App-Paket vorgesehen. Für den geprüften LCD-Ausgangsstand Z15 mit S112 7.3.0 enthält das Komplettpaket die bereits ausgelieferte signierte Systemphase für S112 7.3.0 und Z19, gefolgt von derselben signierten App646. Alte SPIFFS-Geräte erfordern den gesonderten Migrationsweg.

Am Handy die passende ZIP unverändert speichern. Den Bluetooth-Dateimanager trennen, das richtige Gerät in den DFU-Modus versetzen und in **nRF Device Firmware Update** die ZIP sowie das Zielgerät auswählen. Bei der Kombi beide Phasen abwarten. Danach im Dateimanager die Gerätediagnose frisch auslesen. Sollwerte sind DE3.73, App646, Bootloader 19, S112 7.3.0 und ein eingebundenes Laufwerk E.

## Nachbau und Prüfung

Die Quellkennung lautet `53e1fb72f45fdd0b8ed8bef3c11752c90c4198ae15bf79fc5ca3d97071ea05d0`. Sie bindet 701 Produktionsdateien. Der SHA-256 der 364.092 App-Bytes lautet `5d8937db3482c777cd9f768bf15ecedf909adff9dd094446809faa0a3a045ddb`. Die Flashreserve beträgt 8.644 Byte, der Abstand zwischen Heap und reserviertem Stack 1.776 Byte. Der Linker reserviert 8.192 Byte für den Stack. Die zwei getrennten ARM-Bauten ergaben identische BIN und HEX. Für den ELF-Vergleich zählen die Ladebytes. Die Map und die ELF-Datei können lokale Buildpfade enthalten.

```sh
python3 tools/build_lcd.py --backend native --sdk-archive "$SDK_ARCHIVE" --toolchain "$ARM_TOOLCHAIN" --mode development --version 2.22.0-DE3.73 --counter 646 --output build/lcd-de373 --stack-report
python3 tools/run_firmware_tests.py --sdk-archive "$SDK_ARCHIVE" --profile full --report build/test646.json
```

Die App benötigt das im Buildwerkzeug gepinnte nRF5-SDK 17.1.0 und Arm GNU Toolchain 12.2.Rel1. Z19 besitzt ein eigenes Buildrezept unter `bootloader-z19/`. Der SoftDevice ist ein Nordic-Herstellerbinary. Für den Webbuild gelten `web/package-lock.json` und die Hinweise in `web/README.md`.

Am Rechner bestanden alle 157 Firmware-Prüfskripte, alle zehn Z19-Prüfgruppen und 1.429 Webtests. Beide Weblayouts wurden zusätzlich in Chrome geprüft. Die Z19-ARM-Routinen akzeptierten die neue Anwendung auch bei leerer App-Bank nach der Systemphase. Im Datenstrommodell wurde nach der simulierten Trennung bei Byte 4.136 ab Byte null erfolgreich neu übertragen. Einzelheiten zur Platzprüfung und zu den Browser-/Windows-Tests stehen in `docs/validation/DE3_73_PFS.json` und `docs/validation/WEB3_48_2.json`.

## Noch am Gerät zu prüfen

Offen sind die tatsächliche zweiphasige Android-Übertragung für diesen Stand, frischer Diagnoseexport, Favoritenrückkehr über Seitengrenzen, Slotdialog, NFC sowie Schlafen und Aufwachen auf App646. Für belastbare Aussagen zu Startzeit, Heap unter Dauerlast und Web-Tempo auf schwächeren Handys fehlen Messreihen. Gerätebestätigungen zu älteren Versionen gehören zu ihrem jeweiligen Versionsstand.
