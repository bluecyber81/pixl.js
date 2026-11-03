# Allmiibo LCD — DE3-Firmware und Dateimanager

[English](README.md) · [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Aktuelle Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/de3.55) · [Mitarbeiten](CONTRIBUTING.md)

Stand **3. November 2026**: **Firmware 2.22.0-DE3.55 / Zähler 627**, **Dateimanager 3.33.1**, **Bootloader BL8**, **Nordic S112 7.3.0 / FWID 0x0126**, Dateisystem **Packed LittleFS/PFS1**. Der Hauptzweig enthält jetzt auch die passende Firmware- und BL8-Quelle.

Diese Community-Weiterentwicklung von bluecyber81 baut auf [cylin577/pixl.js](https://github.com/cylin577/pixl.js) und ursprünglich [solosky/pixl.js](https://github.com/solosky/pixl.js) auf. Sie ist keine offizielle Version dieser Entwickler. Aus späteren Upstream-Versionen wurden ausgewählte Änderungen übernommen; die Versionsnummer bedeutet keine vollständige Gleichheit mit deren aktuellem Stand.

## Benutzen und installieren

1. [Online-Dateimanager](https://bluecyber81.github.io/pixl.js/) in einem Browser mit Web Bluetooth öffnen, am Gerät **Bluetooth-Dateiübertragung** starten und auf der Seite verbinden.
2. Für das normale Anwendungsupdate die unveränderte Datei **Allmiibo_LCD_DE3_55_627_TESTSTAND.zip** auf der [DFU-Seite](https://bluecyber81.github.io/pixl.js/dfu/web.html) auswählen. Der bisherige Dateiname bleibt wegen der Prüfsummen erhalten. **Dieses Paket ersetzt weder BL8 noch S112.**
3. Für die lokale Nutzung **Allmiibo_Dateimanager_3_33_1.zip** entpacken und unter Windows mit installiertem Python `Start-Dateimanager.cmd` starten. Das äußere Gesamtpaket ist ein Downloadarchiv, keine flashbare ZIP.

**Alte Geräte mit DE3.8/DE3.16 oder SPIFFS benötigen vorher eine vollständige Sicherung und eine getrennte Speicherumstellung.** Normales Upstream-LittleFS hat ebenfalls ein anderes Layout. Die Firmware allein überträgt die Sammlung nicht. Bei bereits passendem PFS1 muss für DE3.55 nichts formatiert werden. Siehe [Installation](docs/INSTALLATION.md), [Migration](docs/MIGRATION_PFS1.md) und [Komponenten](docs/COMPONENTS.md).

## Funktionen und Verbesserungen

- Deutsche/englische Menüs, langsamer lesbarer Lauftext, dauerhaft scannbare QR-Seiten, Figureninformationen, Favoriten und begrenzte Listen für große Ordner/Datenbanken.
- Korrekturen für kurze Mitteldrücke, nachvollziehbare Bluetooth-Zustände, Freigabe unvollständiger Clients und Diagnose für Heap, Speicher und Startphasen.
- Dateiübertragung einschließlich MTU23, atomare kleine Speicherungen samt 128 Metadatenbytes, Abbruch-/Wiederholungsbehandlung und Schutz ungespeicherter NFC-Änderungen nach Speicherfehlern.
- Optionale Bluetooth-Fernbedienung bis zum Ausschalten und Disney-Infinity-Profil für eine passende eigene 320-Byte-MiFare-Mini-Datei.
- Packed LittleFS mit weniger mehrfachen Lese-/CRC-Arbeitsschritten und gezielten Cache-, Lesefehler- und Verschleißkorrekturen. DE3.55 behält das PFS1-Datenlayout bei.
- Im Browser: Bilder/Vorschau, Suche über Geräteordner, gemeinsamer Upload, ZIP/Raw128-Sicherung mit Fortsetzen, Wiederherstellung/Migrationssimulation, Versionsvergleich und Laufzeit-/Startdiagnose.
- Katalogprüfung auf neue Metadaten und farbiger Sammlungsabgleich: **Grün vorhanden**, **Orange Prüfhinweis**, **Rot nicht gefunden nach vollständiger Inhaltsprüfung von E:**. Ohne ausreichende Daten bleibt der Status unbestätigt. Nach dem Trennen bleibt die letzte Prüfung datiert sichtbar; erneutes Verbinden, Änderungen oder Neuladen verwerfen diesen alten Stand.

Der mitgelieferte Katalog umfasst **952 IDs**, keine Figuren-Dateien. Eine gefundene ID bestätigt weder NFC-/Signaturgültigkeit noch Unterstützung in jedem Spiel. Eigene Dateien bzw. eigene HTTPS-Quellen können geprüft und hochgeladen werden. [Änderungsübersicht](CHANGELOG_DE3_SERIES.md).

## Entwickeln und prüfen

[Mitarbeit und Tests](CONTRIBUTING.md) · [Firmware bauen](docs/BUILD_DE3_55.md) · [BL8 bauen](bootloader-bl8/README.md)

Der frische Bau aus dem Veröffentlichungsstand ergibt dieselbe DE3.55-BIN, HEX, ELF und Map wie das archivierte Original. Die früheren Prüfberichte enthalten 136 Firmware-Testgruppen und gezielte Sanitizer-/ARM-/Speichertests; Dateimanager 3.33.1 bestand 1.057 Tests sowie je 21 Produktionsprüfungen. Die neue CI baut/prüft nur den dokumentierten Umfang und veröffentlicht oder flasht nichts automatisch.

Am 2. November wurden DE3.55/BL8/S112 7.3.0 am Gerät ausgelesen und begrenzte Datei-/Metadaten-/Verbindungstests mit tatsächlicher ATT-MTU 250 und 23 bestanden. NFC-Erkennung, Mitteldruck und Aufwachen wurden vom Besitzer bestätigt. Gemessene Anwendungs-Startmarken lagen bei rund 2,31 Sekunden; Bootloader und früher SDK-Start sind darin nicht enthalten. [Prüfumfang und Grenzen](docs/validation/DE3_55.json).

Zielhardware: passende 128×64-LCD-Platine, nRF52832 mit 512 KiB internem Flash und 64 KiB RAM. Die Anwendung benötigt 370.120 Bytes, die verbleibende Anwendungs-Flashreserve beträgt 2.616 Bytes; der Anwendungs-Heap umfasst 18.432 Bytes. Diese Angaben sind keine vollständige RAM-/Stackmessung und keine Freigabe beliebiger Allmiibo-/OLED-Varianten.

## Herkunft und Lizenzen

Danke an solosky, cylin577 und alle Komponentenentwickler; [Mochi](https://github.com/tasken/Mochi) lieferte Anregungen zur Browserbedienung. [Lizenzhinweise](THIRD_PARTY_NOTICES.md) und Originalvermerke bleiben erhalten. S112 ist Nordic-Software unter deren Bedingungen. Der bekannte Upstream-Signierschlüssel beweist Paketkompatibilität, keine exklusive Herausgeberidentität. Private Schlüssel, Sicherungen und Figurensammlungen werden nicht veröffentlicht.
