# Allmiibo LCD – Firmware und Dateimanager

[Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Firmware und Pakete herunterladen](https://github.com/bluecyber81/pixl.js/releases/tag/de3.61) · [English](README.md)

Das signierte Anwendungsupdate **DE3.61 / 633** ist für das nRF52832-Allmiibo LCD mit vorhandenem Packed LittleFS (PFS1) gedacht. Das eigene Gerät mit Z15 und S112 7.3.0 kann die App separat über Bluetooth erhalten. DE3.61 wurde am Rechner geprüft. Der erste Praxistest dieser App steht aus.

* **Einstellungen.** Die 21 Hauptoptionen und ihre Werte sind auf Deutsch und Englisch bei ausgeschalteter Menüanimation lesbar. „Fernsteuern“ zeigt „bis Aus“, wenn die Fernbedienung für diese Sitzung eingeschaltet ist. Die RAM-Anzeige berücksichtigt die tatsächlich gezeichnete Schrift bis zum rechten Displayrand.
* **Speicher beim Einschalten.** Im Test mit 1.131 Dateien und 77 Ordnern sank die Zahl der Lesezugriffe beim Einbinden von 4.712 auf 4.531. Der Dateimanager zeigt unter **Gerät & Diagnose → Startzeiten lesen**, wie lange das Einbinden, die Journalprüfung und der Rest des Speicherstarts jeweils brauchen.
* **Figurenkatalog.** Kürzere interne Verweise lassen 2.644 Byte mehr Flash für die Firmware frei. Alle 952 Figuren, 82 Spiele und 1.344 Spielzuordnungen samt Beschreibungstexten wurden im fertigen Programm verglichen.
* **Dateimanager 3.37.5.** Unter **Sicherung** kannst du ein erkanntes Laufwerk direkt öffnen und den gesamten Inhalt als ZIP sichern. Die Diagnose trennt die von der Firmware gemeldete ATT-MTU von der nutzbaren Größe eines Bluetooth-Datenpakets. Der Versionsvergleich kennt Z15 sowie den getrennt gekennzeichneten Rückkehrstand Z16 mit Z13-Code.

[LCD-Vergleich](docs/validation/DE3_61_LCD.png) · [Prüfergebnisse](docs/validation/DE3_61.json)

## Installation und Mitarbeit

1. Bei einem passenden LCD/PFS1-Gerät die eigene Sammlung sichern. Für DE3.61 die innere ZIP **Allmiibo_LCD_DE3_61_633_TESTSTAND.zip** aus dem Release verwenden. Auf dem Gerät **Firmware-Update** wählen und den Anweisungen der [DFU-Seite](https://bluecyber81.github.io/pixl.js/dfu/web.html) folgen. Ein vorhandenes PFS1 benötigt keine erneute Umstellung.
2. Zum Dateizugriff am Gerät **Bluetooth-Dateiübertragung** öffnen und es im Browser über **Verbinden** auswählen. Für den lokalen Windows-Start das portable ZIP entpacken und **Start-Dateimanager.cmd** öffnen. [Dateimanager-Anleitung](docs/DATEIMANAGER_WEB.md)
3. Wer weiterentwickeln möchte, findet die Anwendungsquellen unter [fw](fw), die Browserquellen unter [web](web) und die passenden BL8-Quellen unter [bootloader-bl8](bootloader-bl8). [Mitarbeiten](CONTRIBUTING.md) · [Firmware bauen](docs/BUILD_DE3_61.md)

Die ursprüngliche Firmware stammt von [solosky](https://github.com/solosky/pixl.js). Dieser Community-Zweig von bluecyber81 übernimmt auch Arbeit von [cylin577](https://github.com/cylin577/pixl.js). Die Herkunft von BL8, dem separat gelieferten Nordic-SoftDevice und den SDK-Korrekturen ist dokumentiert. [Komponenten und Nachweise](docs/COMPONENTS.md) · [Änderungsgeschichte](docs/DEVELOPMENT_HISTORY.de.md) · [Lizenz](LICENSE) · [Fremdkomponenten](THIRD_PARTY_NOTICES.md)

Geräte mit SPIFFS, etwa DE3.8, und solche mit gewöhnlichem Upstream-LittleFS brauchen vor einem Wechsel einen passenden Migrationsweg. [Migration und Sicherung](docs/MIGRATION_PFS1.md)
