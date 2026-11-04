# Allmiibo LCD – Firmware und Dateimanager

[Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Firmware und Pakete herunterladen](https://github.com/bluecyber81/pixl.js/releases/tag/de3.59) · [English](README.md)

**DE3.59 / 631** ist ein Anwendungsupdate für das Allmiibo LCD mit nRF52832 und bestehendem Packed LittleFS (PFS1). **Dateimanager 3.37.1** funktioniert auch mit älteren Diagnoseberichten. Bootloader BL8, Nordic S112 7.3.0, Dateiformate und Katalog bleiben erhalten.

Der Dateimanager zeigt bei der Sammlungsprüfung, der Ordner-ZIP-Sicherung und der Gerätediagnose den aktuellen Leseschritt und, sobald genügend Fortschritt gemessen wurde, die geschätzte Restzeit. Orange Figurenkarten erklären, welcher Prüfhinweis vorliegt. Zum Verwenden genügt es, die Webseite neu zu laden. [Dateimanager 3.37.1](https://github.com/bluecyber81/pixl.js/releases/tag/web3.37.1)

* **Schneller lesen beim Start.** Vier bereits vorhandene RAM-Seiten werden jetzt nach dem letzten Zugriff wiederverwendet. Beim Einbinden derselben nachgebildeten Sammlung (1.131 Dateien, 77 Ordner) sank die Anzahl der SPI-Lesezugriffe von 4.802 auf 4.712. Der temporäre Cache bleibt 1.032 Byte groß. Das ist ein Vergleich der Zugriffe, keine Stoppuhrmessung am Gerät.
* **Kartenemulator → Steckplätze → Anzahl der Plätze.** Scheitert die Speicherung, zeigt „Platzanzahl im RAM“, dass die Änderung noch nicht dauerhaft gesichert ist. Kurz Mitte versucht das Speichern erneut. Lang Mitte geht zurück und behält die ausstehende Änderung für einen späteren regulären Speichervorgang.
* **Gerät & Diagnose → Laufzeitdiagnose.** DE3.59 meldet den bisher unberührten Teil des reservierten Stacks. Unter **Startzeiten → Mehrere Kaltstarts auswerten** berechnet der Browser Median und Spannweite aus 3–20 Berichten derselben Firmware.
* **Einstellungen → Version → Source-ID.** Die zwölfstellige Quellkennung für diesen Build lautet `7b4822b045b4`. Beide unabhängigen Builds ergeben dasselbe Anwendungsprogramm. Der Katalogabgleich der fertigen Firmware umfasst 952 Figuren-IDs, 82 Spiele und 1.344 Zuordnungen.

**Am LCD-Gerät gemessen.** Bei je einem Start auf demselben Gerät brauchte der Speicher mit DE3.59 2.321 ms (DE3.58: 2.338 ms). Bis zur ersten Ereignisverarbeitung vergingen 2.426 ms (zuvor 2.443 ms). Beide Abschnitte waren in diesem Vergleich 17 ms kürzer. Bootloader und sichtbarer Displaystart liegen außerhalb der Messung. Bei der Bluetooth-Abfrage meldete die Firmware 5.240 von 8.192 Byte unberührten Stack und 10.644 Byte freien Heap. [Gerätemessung](docs/validation/DE3_59_READBACK.json)

[Alle Änderungen und Bedienwege](RELEASE_NOTES_DE.md) · [Prüfergebnisse](docs/validation/DE3_59.json)

## Installation und Mitarbeit

1. Bei einem passenden LCD/PFS1-Gerät die eigene Sammlung sichern. Für DE3.59 die innere ZIP **Allmiibo_LCD_DE3_59_631_TESTSTAND.zip** aus dem Release verwenden. Auf dem Gerät **Firmware-Update** wählen und den Anweisungen der [DFU-Seite](https://bluecyber81.github.io/pixl.js/dfu/web.html) folgen. Ein vorhandenes PFS1 benötigt keine erneute Umstellung.
2. Zum Dateizugriff am Gerät **Bluetooth-Dateiübertragung** öffnen und es im Browser über **Verbinden** auswählen. Für den lokalen Windows-Start das portable ZIP entpacken und **Start-Dateimanager.cmd** öffnen. [Dateimanager-Anleitung](docs/DATEIMANAGER_WEB.md)
3. Wer weiterentwickeln möchte, findet die Anwendungsquellen unter [fw](fw), die Browserquellen unter [web](web) und die passenden BL8-Quellen unter [bootloader-bl8](bootloader-bl8). [Mitarbeiten](CONTRIBUTING.md) · [Firmware bauen](docs/BUILD_DE3_59.md)

Die ursprüngliche Firmware stammt von [solosky](https://github.com/solosky/pixl.js). Dieser Community-Zweig von bluecyber81 übernimmt auch Arbeit von [cylin577](https://github.com/cylin577/pixl.js). Die Herkunft von BL8, dem separat gelieferten Nordic-SoftDevice und den SDK-Korrekturen ist dokumentiert. [Komponenten und Nachweise](docs/COMPONENTS.md) · [Änderungsgeschichte](docs/DEVELOPMENT_HISTORY.de.md) · [Lizenz](LICENSE) · [Fremdkomponenten](THIRD_PARTY_NOTICES.md)

Geräte mit SPIFFS, etwa DE3.8, und solche mit gewöhnlichem Upstream-LittleFS brauchen vor einem Wechsel einen passenden Migrationsweg. [Migration und Sicherung](docs/MIGRATION_PFS1.md)
