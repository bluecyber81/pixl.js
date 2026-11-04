# Allmiibo LCD – Firmware und Dateimanager

[Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Firmware und Pakete herunterladen](https://github.com/bluecyber81/pixl.js/releases/tag/de3.58) · [English](README.md)

Für **Allmiibo LCD mit nRF52832 und vorhandenem Packed LittleFS (PFS1)**. Aktueller Stand vom 4. November 2026 sind **Firmware 2.22.0-DE3.58, Zähler 630**, **Dateimanager 3.36.0**, **Bootloader BL8** und **Nordic S112 7.3.0**. Das getestete Allmiibo meldete DE3.58/630. Der Besitzer bestätigte den Kartenplatzwechsel und die Erkennung einer Figur per NFC an der Switch 2. [Geräteprüfung](docs/validation/DE3_58_READBACK.json).

* **Kartenemulator.** Beim Slotwechsel meldet das Gerät getrennt, ob Speichern oder Laden fehlgeschlagen ist. Der reproduzierte Fehler beim Verkleinern von 50 auf 8 Slots ist korrigiert. Die Karten-ID lässt sich ohne unnötigen Speicherzugriff ansehen.
* **Web-Update.** Die DFU-Seite zeigt Paketversion, Hardwarefeld und erlaubte SoftDevice-IDs schon bei der Dateiauswahl. Eine höchstens zehn Minuten alte Bootdiagnose ermöglicht einen direkten Vergleich. Widersprüchliche Startpakete werden vor der Bluetooth-Auswahl zurückgewiesen.
* **Startzeit.** Unter **Gerät & Diagnose → Startzeiten lesen → Früheren Startbericht vergleichen** zeigt ein lokal ausgewählter älterer Bericht den Zeitunterschied. Je ein Start desselben Allmiibos ergab 2.387 statt 2.450 ms für die Speicherinitialisierung und 2.490 statt 2.553 ms bis zur ersten Ereignisverarbeitung.
* **Am Gerät.** Die deutschen Menüs verwenden kürzere Bezeichnungen. Bei einem Speicherfehler im Kartenemulator führt ein kurzer Mitteldruck zur erneuten Sicherung und ein langer zurück.

[Alle Änderungen und Bedienwege](RELEASE_NOTES_DE.md) · [Prüfergebnisse](docs/validation/DE3_58.json)

## Installation und Mitarbeit

1. Bei einem passenden LCD/PFS1-Gerät die eigene Sammlung sichern. Für DE3.58 die innere ZIP **Allmiibo_LCD_DE3_58_630_TESTSTAND.zip** aus dem Release verwenden. Auf dem Gerät **Firmware-Update** wählen und den Anweisungen der [DFU-Seite](https://bluecyber81.github.io/pixl.js/dfu/web.html) folgen. Ein vorhandenes PFS1 benötigt keine erneute Umstellung.
2. Zum Dateizugriff am Gerät **Bluetooth-Dateiübertragung** öffnen und es im Browser über **Verbinden** auswählen. Für den lokalen Windows-Start das portable ZIP entpacken und **Start-Dateimanager.cmd** öffnen. [Dateimanager-Anleitung](docs/DATEIMANAGER_WEB.md)
3. Wer weiterentwickeln möchte, findet die Anwendungsquellen unter [fw](fw), die Browserquellen unter [web](web) und die passenden BL8-Quellen unter [bootloader-bl8](bootloader-bl8). [Mitarbeiten](CONTRIBUTING.md) · [Firmware bauen](docs/BUILD_DE3_58.md)

Die ursprüngliche Firmware stammt von [solosky](https://github.com/solosky/pixl.js). Dieser Community-Zweig von bluecyber81 übernimmt auch Arbeit von [cylin577](https://github.com/cylin577/pixl.js). Die Herkunft von BL8, dem separat gelieferten Nordic-SoftDevice und den SDK-Korrekturen ist dokumentiert. [Komponenten und Nachweise](docs/COMPONENTS.md) · [Änderungsgeschichte](docs/DEVELOPMENT_HISTORY.de.md) · [Lizenz](LICENSE) · [Fremdkomponenten](THIRD_PARTY_NOTICES.md)

Geräte mit SPIFFS, etwa DE3.8, und solche mit gewöhnlichem Upstream-LittleFS brauchen vor einem Wechsel einen passenden Migrationsweg. [Migration und Sicherung](docs/MIGRATION_PFS1.md)
