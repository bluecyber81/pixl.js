# Allmiibo LCD – Firmware und Dateimanager

[Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Firmware und Pakete herunterladen](https://github.com/bluecyber81/pixl.js/releases/tag/de3.60) · [English](README.md)

**DE3.60 / 632** verbessert die Bedienung auf dem 128 × 64 Pixel großen LCD. Das signierte Update enthält die Geräte-App für ein nRF52832-Allmiibo mit Packed LittleFS (PFS1).

* **Bluetooth-Dateiübertragung.** Links oder rechts wechselt einmal auf den QR-Code, auch beim Halten. Der Code öffnet den Dateimanager auf GitHub Pages. Auf der Statusseite steht auch die Taste für den Rückweg.
* **Bildschirmtastatur.** Ein langer Mitteldruck auf einen Buchstaben schreibt einen Großbuchstaben. Bestätigen löst beim Halten einmal aus. Halten auf der Löschtaste löscht weiter. Das X bricht eine Eingabe ohne Speichern ab.
* **Einstellungen.** Kurze Werte wie AN und AUS bekommen rechts festen Platz. Lange Titel bleiben auch mit abgeschalteter Animation lesbar. Scheitert das Speichern, bleibt die Fehlermeldung bis zur Bestätigung stehen. Beim Kartenexport bleibt der eingegebene Name für einen erneuten Versuch erhalten.
* **Amiibo-Emulator → Dateimenü → mehrere Tags erstellen.** Das Display zeigt die aktuelle Datei und ihre Nummer. Mit „Abbrechen“ stoppst du zwischen zwei Dateien. Bereits geschriebene Dateien bleiben erhalten. Belegte Namen, voller Gerätespeicher und zu wenig RAM haben eigene Hinweise.
* **Dateimanager 3.37.3 → Firmware-Update.** Die Seite zeigt Übertragung, Prüfsummenvergleich und die Bestätigung des Abschlussbefehls als getrennte Schritte. Der tatsächliche Neustart lässt sich im normalen Menü bzw. durch erneutes Auslesen bestätigen.

[LCD-Vorschau](docs/validation/DE3_60_LCD.png) · [Prüfergebnisse](docs/validation/DE3_60.json)

## Installation und Mitarbeit

1. Bei einem passenden LCD/PFS1-Gerät die eigene Sammlung sichern. Für DE3.60 die innere ZIP **Allmiibo_LCD_DE3_60_632_TESTSTAND.zip** aus dem Release verwenden. Auf dem Gerät **Firmware-Update** wählen und den Anweisungen der [DFU-Seite](https://bluecyber81.github.io/pixl.js/dfu/web.html) folgen. Ein vorhandenes PFS1 benötigt keine erneute Umstellung.
2. Zum Dateizugriff am Gerät **Bluetooth-Dateiübertragung** öffnen und es im Browser über **Verbinden** auswählen. Für den lokalen Windows-Start das portable ZIP entpacken und **Start-Dateimanager.cmd** öffnen. [Dateimanager-Anleitung](docs/DATEIMANAGER_WEB.md)
3. Wer weiterentwickeln möchte, findet die Anwendungsquellen unter [fw](fw), die Browserquellen unter [web](web) und die passenden BL8-Quellen unter [bootloader-bl8](bootloader-bl8). [Mitarbeiten](CONTRIBUTING.md) · [Firmware bauen](docs/BUILD_DE3_60.md)

Die ursprüngliche Firmware stammt von [solosky](https://github.com/solosky/pixl.js). Dieser Community-Zweig von bluecyber81 übernimmt auch Arbeit von [cylin577](https://github.com/cylin577/pixl.js). Die Herkunft von BL8, dem separat gelieferten Nordic-SoftDevice und den SDK-Korrekturen ist dokumentiert. [Komponenten und Nachweise](docs/COMPONENTS.md) · [Änderungsgeschichte](docs/DEVELOPMENT_HISTORY.de.md) · [Lizenz](LICENSE) · [Fremdkomponenten](THIRD_PARTY_NOTICES.md)

Geräte mit SPIFFS, etwa DE3.8, und solche mit gewöhnlichem Upstream-LittleFS brauchen vor einem Wechsel einen passenden Migrationsweg. [Migration und Sicherung](docs/MIGRATION_PFS1.md)
