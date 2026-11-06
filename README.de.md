# Allmiibo LCD: Firmware und Dateimanager

[Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [DE3.63 herunterladen](https://github.com/bluecyber81/pixl.js/releases/tag/de3.63) · [English](README.md)

**DE3.63 / 635** und **Dateimanager 3.39.2** machen Figurenhinweise besser erreichbar. Ziel ist das nRF52832-Allmiibo mit LCD und bestehendem Packed LittleFS PFS1. Das Anwendungsupdate erhält den installierten Bootloader, Nordic S112 und das Dateisystem. Die Geräteprüfung dieser neuen Anwendung ist zusätzlich zur Rechnerprüfung erforderlich.

- **Am Gerät:** Unter **Amiibo-Datenbank → Figur öffnen → kurz Mitte → Notiz / Hinweise** stehen persönliche Notiz und Spielhinweis auf getrennten Seiten. Kurz links/rechts wechselt die Seite, links/rechts halten scrollt in ganzen Textzeilen, Mitte führt ins Menü zurück. Das Menü gibt es auch in der Slotansicht der Datenbank. Figur, Spielstand, Notiz und Schreibschutz werden dabei nicht verändert.
- **Deutsche Hinweise:** Acht vorhandene redaktionelle Übersetzungen decken 13 Katalogzuordnungen ab. Sie gelten nur für den genau passenden englischen Quelltext; weitere vorhandene Hinweise bleiben Englisch. Ein fehlender Hinweis bedeutet nicht, dass die Figur im Spiel nicht unterstützt wird. Normaler Figuren-/Slotwechsel und QR-Ansicht bleiben erhalten.
- **LCD-Schrift korrigiert:** Die bisher fehlenden Großumlaute **Ä, Ö und Ü** sind ergänzt. Davon profitieren auch eigene Notizen mit diesen Zeichen. Die übrigen vorhandenen Zeichen bleiben erhalten; eine vollständige Unicode-Abdeckung ist damit nicht gemeint.
- **Dateimanager:** In Figurendetails und Dateivorschau steht neben **Kataloghinweise** der tatsächlich eingebundene Katalogstand. Auf schmalen Bildschirmen bricht die Anzeige um. Der Katalog enthält weiterhin 952 öffentliche Figuren-IDs und 1.344 Zuordnungen; das ist keine Prüfung am Spiel.

Die bisherigen Sicherungs- und Sammlungsfunktionen bleiben enthalten: Display-Wachhaltehilfe bei laufenden Vorgängen, SHA-256-Inhaltsgruppen aus bereits gelesenen Dateien, lokale Prüfung mit optionaler Reparaturkopie für bestimmte alte MF0-Slots und die Behandlung ausstehender Transaktionen beim ZIP-Import. Gleiche Figuren-IDs allein beweisen keine gleichen Dateien. Manuelles Sperren oder Energiesparen kann Bluetooth trotz Wachhaltehilfe unterbrechen. [Web-Anleitung](web/README.md)

## Aktualisieren

Für ein passendes LCD-Gerät mit bestehendem PFS1 ist **Allmiibo_LCD_DE3_63_635_TESTSTAND.zip** das Anwendungsupdate auf der [DFU-Seite](https://bluecyber81.github.io/pixl.js/dfu/web.html). Sicherung aufbewahren. Weder Formatierung noch erneute Speicherumstellung sind erforderlich. Das Paket enthält keinen Bootloader und kein SoftDevice. Alte SPIFFS-Geräte, gewöhnliches Upstream-LittleFS und andere Boards benötigen ihren jeweiligen geprüften Weg.

**Z17 / 17** ist getrennt dokumentiert. Ein Diagnoseexport und die Nutzerrückmeldung vom 6. November 2026 bestätigen Z17 zusammen mit DE3.62 und S112 7.3.0 auf dem Gerät. Das prüft weder jeden Bootloaderpfad noch bereits die neue Anwendung DE3.63. Ein passender Bootloader muss für diese Komfortänderungen nicht ersetzt werden. **S112 7.3.0** bleibt das unveränderte Nordic-Binärpaket.

## Quellen und Nachweise

Quellbindung, Buildrezept und Tests gehören zum Release. Aktuelle Hashes und Speicherwerte stehen im zugehörigen Release-Manifest und den tatsächlichen Buildresultaten. Frühere Messungen gelten nicht als neue Geräteprüfung; die Anzeigeänderungen versprechen keinen schnelleren Start.

[Änderungen und Grenzen](docs/RELEASE_DE3_63.md) · [Dateimanager 3.39.2](docs/RELEASE_WEB3_39_2.de.md) · [App nachbauen](docs/BUILD_DE3_63.md) · [Übergabe](docs/UEBERGABE_DE3_63.de.md) · [Bisherige Start-/Speicherdiagnose](docs/diagnostics/DE3_62_STORAGE.md) · [Z17-Quellen](bootloader-z17/) · [Migration](docs/MIGRATION_PFS1.md) · [Mitmachen](CONTRIBUTING.md)

Community-Fortführung durch bluecyber81 auf Grundlage von [solosky](https://github.com/solosky/pixl.js) und [cylin577](https://github.com/cylin577/pixl.js). [Komponenten](docs/COMPONENTS.md) · [Entwicklungsgeschichte](docs/DEVELOPMENT_HISTORY.md) · [Lizenzen](THIRD_PARTY_NOTICES.md)
