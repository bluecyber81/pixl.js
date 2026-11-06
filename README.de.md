# Allmiibo LCD: Firmware und Dateimanager

[Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [DE3.62 herunterladen](https://github.com/bluecyber81/pixl.js/releases/tag/de3.62) · [English](README.md)

**DE3.62 / 634**, **Dateimanager 3.38.0** und der getrennte **Bootloader-Teststand Z17 / 17** setzen die bisherige Entwicklung fort. Ziel ist das nRF52832-Allmiibo mit LCD und bestehendem Packed LittleFS (PFS1). Die neuen Stände sind am Rechner geprüft; ihre praktische Bestätigung auf dem Gerät steht noch aus.

- **Kartenemulator:** Fehlende, unbekannte und zu kurze Kartenpuffer werden beim Dateiimport/-export abgefangen. Gültige Figuren- und Kartendaten behalten ihr Format. Schnittstellentypen für Kartentyp, Menüwerte, Cache-CRC, NFC und AmiLoop sind bereinigt.
- **Genauere Startdiagnose:** Unter „Gerät & Diagnose → Startzeiten auslesen“ erscheinen die Mountabschnitte, physische Lesezugriffe, Cachetreffer und Lesefehler. Frühere Firmware bleibt lesbar. Keine zusätzliche Startbeschleunigung wird behauptet; gleich große Cachealternativen waren im festen Test schlechter.
- **Komfort im Dateimanager:** Kleine RAM-Stichproben werden verständlich eingeordnet. Unter „Sicherung“ erscheinen Laufwerksfehler und Wartehinweise direkt. Während einer neuen Diagnose wird kein altes Abschlussdatum gezeigt.
- **Bootloader Z17:** Zeigt während des tatsächlichen Updateabschlusses „Pruefen…“ und „Speichern…“. Die dafür nötigen Buchstaben sind im kleinen LCD-Zeichensatz enthalten. Z17 gehört nicht zum normalen App-Update; Nordic S112 bleibt unverändert.
- **Für Entwickler:** Strenge Typprüfung der eigenen C-Module, nachbaubare Docker- und Linux-Builds, vollständige Quellbindung, ELF/Map und reproduzierbare Tests. [Mitmachen](CONTRIBUTING.md)

## Aktualisieren

Für ein bereits auf PFS1 umgestelltes LCD-Gerät ist **Allmiibo_LCD_DE3_62_634_TESTSTAND.zip** das Anwendungsupdate. Es verändert weder Bootloader noch SoftDevice und benötigt keine erneute Speicherumstellung. Sicherung aufbewahren. Auf dem Handy funktioniert die [DFU-Seite](https://bluecyber81.github.io/pixl.js/dfu/web.html) für dieses App-ZIP; die getrennten Bootloader-Pakete haben eigene Anweisungen.

Alte SPIFFS-Geräte, andere Boards und gewöhnliches Upstream-LittleFS benötigen ihre jeweilige geprüfte Umstellung. [Migration](docs/MIGRATION_PFS1.md)

## Quellen und Nachweise

[Änderungen und Grenzen](docs/RELEASE_DE3_62.md) · [App nachbauen](docs/BUILD_DE3_62.md) · [Start-/Speicherdiagnose](docs/diagnostics/DE3_62_STORAGE.md) · [Z17-Quellen](bootloader-z17/) · [App-Prüfbericht](docs/validation/DE3_62.json) · [Web-Anleitung](web/README.md)

Community-Fortführung durch bluecyber81 auf Grundlage von [solosky](https://github.com/solosky/pixl.js) und [cylin577](https://github.com/cylin577/pixl.js). [Komponenten](docs/COMPONENTS.md) · [Entwicklungsgeschichte](docs/DEVELOPMENT_HISTORY.md) · [Lizenzen](THIRD_PARTY_NOTICES.md)
