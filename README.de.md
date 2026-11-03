# Allmiibo LCD — DE3-Firmware und Dateimanager

[English](README.md) · [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/) · [Aktuelle Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/de3.56) · [Mitarbeiten](CONTRIBUTING.md)

Quellstand **3. November 2026**: **Firmware 2.22.0-DE3.56 / Zähler 628**, **Dateimanager 3.35.0**, **Bootloader BL8**, **Nordic S112 7.3.0 / FWID 0x0126**, Dateisystem **Packed LittleFS/PFS1**.

Diese Community-Weiterentwicklung von bluecyber81 baut auf [cylin577/pixl.js](https://github.com/cylin577/pixl.js) und ursprünglich [solosky/pixl.js](https://github.com/solosky/pixl.js) auf. Sie ist keine offizielle Version dieser Entwickler. Aus späteren Upstream-Versionen wurden ausgewählte Änderungen übernommen; die Versionsnummer bedeutet keine vollständige Gleichheit mit deren aktuellem Stand.

## Neu im Dateimanager 3.35.0

**Gerät & Diagnose → Alle Diagnosewerte auslesen** sammelt RAM, Startzeiten, Bootloader/SoftDevice, Akku, Laufwerke, Packed-LittleFS-Geometrie, Firmware-MTU und die letzte Einstellungsmenü-Diagnose. Ein gemeinsamer JSON-Bericht enthält Abrufzeiten und Teilfehler. **Kein neues Flashen erforderlich.** [Bedienung und Messgrenzen](docs/DIAGNOSTICS_3_35.md) · [Web-Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.35.0).

## Neu in DE3.56 und 3.34.0

- **Beim Suchen und Umbenennen am Gerät:** Die Tastatur zeigt das Zeichen, das ein kurzer Mitteldruck wirklich einfügt. Oben erklärt etwa `q/Q` kurz/lang und `_/SP` Unterstrich/Leerzeichen. Lange Titel überdecken die Hilfe nicht. Die bisherige Eingabefunktion bleibt erhalten.
- **In Listen und Ordnern:** Der Scrollbalken bleibt auch bei vielen Einträgen sichtbar und erreicht die Enden korrekt.
- **Figurenkatalog → Bilder anzeigen:** Optionale Galerie mit Bildern der aktuellen Seite, fester Bildfläche und Platzhalter bei fehlenden Bildern. Ohne Einschalten erfolgt kein Galerie-Bildabruf.
- **Figurenkatalog → Bestand filtern:** Vorhandene, nicht gefundene, auffällige und unbestätigte/veraltete Einträge getrennt anzeigen. Grundlage bleibt die Sammlungsprüfung mit ihren bisherigen Grenzen.
- **Weiter/Zurück im Katalog:** Die Ansicht führt zum Anfang der neuen Ergebnisse. Tippen in der Suche verschiebt den Fokus nicht.
- **Nach neuen Figuren suchen:** Übernommene Katalogdaten gelten jetzt auch für Gerätesuche, Auswahlvorschau, Dateieigenschaften und lokale Dateiprüfung. Ergebnisse und verspätete Bildfehler des alten Stands überschreiben den neuen Stand nicht.

[Bedienwege und vollständige Release-Hinweise](RELEASE_NOTES_DE.md). Der Nutzer meldet DE3.56 als installiert und funktionierend; die bereitgestellten Diagnosewerte sind datierte Beobachtungen, kein vollständiger Hardwaretest. Für dieses Update wird kein zusätzlicher Startzeitgewinn behauptet.

## Benutzen und installieren

1. [Online-Dateimanager](https://bluecyber81.github.io/pixl.js/) in einem Browser mit Web Bluetooth öffnen, am Gerät **Bluetooth-Dateiübertragung** starten und auf der Seite verbinden.
2. Für die neue Tastaturdarstellung und Scrollleiste **Allmiibo_LCD_DE3_56_628_TESTSTAND.zip** unverändert auf der [DFU-Seite](https://bluecyber81.github.io/pixl.js/dfu/web.html) auswählen. **Dieses Paket ersetzt nur die Anwendung.**
3. Für die lokale Nutzung **Allmiibo_Dateimanager_3_35_0.zip** entpacken und unter Windows mit installiertem Python `Start-Dateimanager.cmd` starten. Das äußere **Allmiibo_DE3_56_Web3_34_0_Gesamtpaket.zip** ist ein Downloadarchiv, keine flashbare ZIP.

Die Browserverbesserungen benötigen kein Geräteupdate. **BL8, S112 7.3.0 und das PFS1-Speicherlayout bleiben unverändert.** Eine vorhandene passende Sammlung benötigt keine Formatierung oder Wiederherstellung.

**Alte Geräte mit DE3.8/DE3.16 oder SPIFFS benötigen vorher eine vollständige Sicherung und eine getrennte Speicherumstellung.** Normales Upstream-LittleFS hat ebenfalls ein anderes Layout. Die Firmware allein überträgt deren Sammlung nicht. Siehe [Installation](docs/INSTALLATION.md), [Migration](docs/MIGRATION_PFS1.md) und [Komponenten](docs/COMPONENTS.md). Bluetooth nutzt das Gerät, auf dem der Browser läuft; ein VPN verlängert dessen Funkreichweite nicht.

## Beibehaltene Verbesserungen

- Deutsche/englische Menüs, gut lesbarer Lauftext, stabile QR-Seiten, Figureninformationen, Favoriten und begrenzte Listen für große Ordner/Datenbanken.
- Korrigierte Mitteldrücke, klare Bluetooth-Zustände, Freigabe unvollständiger Clients und Diagnose für Heap, Speicher und Startphasen.
- MTU23-Dateiübertragung, atomare kleine Speicherungen samt Raw128-Metadaten, Abbruch/Wiederholung und Schutz ungespeicherter NFC-Änderungen nach Speicherfehlern.
- Optionale Bluetooth-Fernbedienung bis zum Ausschalten und Disney-Infinity-Profil für eine passende eigene 320-Byte-MiFare-Mini-Datei.
- Packed LittleFS mit Caches, gestreamten Initialisierungsschritten, geteilter CRC-Arbeit sowie gezielten Lese-/Cache-/Verschleißkorrekturen.
- Browser-Vorschau, Suche über Geräteordner, gemeinsamer Upload, ZIP/Raw128-Sicherung mit Fortsetzen, Wiederherstellung/Migrationssimulation, Versionsvergleich und Laufzeit-/Startdiagnose.
- Farbiger Sammlungsabgleich: **Grün ID gefunden**, **Orange Prüfhinweis**, **Rot nicht gefunden nach vollständiger Inhaltsprüfung von E:**. Teilprüfungen oder fehlende Metadaten bleiben unbestätigt. Nach Trennung bleibt eine datierte Beobachtung sichtbar; erneutes Verbinden, Änderungen oder Neuladen verwerfen sie.

Der mitgelieferte Katalog umfasst **952 IDs**, keine Figurendateien. Ein ID-Treffer bestätigt weder Signaturgültigkeit noch Spielunterstützung. Bildabrufe übermitteln die öffentliche Figuren-ID und die IP-Adresse an den Bildanbieter, keine Gerätedateien. Eigene Dateien bzw. HTTPS-Quellen können geprüft und hochgeladen werden. [Änderungsverlauf](CHANGELOG_DE3_SERIES.md).

## Entwickeln, prüfen und zusammenarbeiten

[Ausführliche Verbesserungen/Fehlerbehebungen](docs/DEVELOPMENT_HISTORY.de.md) · [BL8-/S112-Arbeit](docs/BOOTLOADER_SOFTDEVICE_CHANGES.md) · [Separate Komponentendownloads](https://github.com/bluecyber81/pixl.js/releases/tag/bl8-s112-7.3.0)

BL8 liegt mit eigener Quelle und signiertem Einzelpaket vor. [S112 7.3.0](softdevice-s112/README.md) ist die unveränderte Nordic-Originaldatei mit Lizenz. Unsere Integration, SDK-Korrektur und Diagnosen sind getrennt von Nordics Änderungen beschrieben. Die Einzelpakete behalten ihre Zähler- und Installationsvoraussetzungen.

[Mitarbeit und Tests](CONTRIBUTING.md) · [Firmware bauen](docs/BUILD_DE3_56.md) · [BL8 bauen](bootloader-bl8/README.md) · [DE3.56-Quellcode](https://github.com/bluecyber81/pixl.js/releases/download/de3.56/Allmiibo_DE3_56_Quellcode.zip) · [Dateimanager-Quellcode](https://github.com/bluecyber81/pixl.js/releases/download/web3.35.0/Allmiibo_Dateimanager_3_35_0_Quellcode.zip)

Gezielte Regressionen prüfen Katalogwechsel, Bildfreigaben/-fehler, Statusfilter, Seitenwechsel sowie Tastatur und Scrollanzeige. Abschließende Prüfergebnisse werden versionsgebunden dokumentiert. Die [früheren DE3.55-Gerätetests](docs/validation/DE3_55.json) einschließlich MTU23/250, NFC, Mitteldruck, Aufwachen und Startmarken sind keine Hardwareprüfung von DE3.56.

Zielhardware: passende 128×64-LCD-Platine, nRF52832 mit 512 KiB internem Flash und 64 KiB RAM. Der Anwendungs-Heap bleibt 18.432 Bytes groß. Der Build weist die tatsächliche Flashbelegung aus; Heap-Stichproben messen nicht den gesamten RAM/Stack und geben keine beliebige Allmiibo-/OLED-Variante frei.

## Herkunft und Lizenzen

Danke an solosky, cylin577 und die Komponentenentwickler; [Mochi](https://github.com/tasken/Mochi) lieferte Anregungen zur Browserbedienung. [Lizenzhinweise](THIRD_PARTY_NOTICES.md) und Originalvermerke bleiben erhalten. S112 ist Nordic-Software unter deren Bedingungen. Der bekannte Upstream-Signierschlüssel beweist Paketkompatibilität, keine exklusive Herausgeberidentität. Private Schlüssel, Sicherungen und Figurensammlungen werden nicht veröffentlicht.

[Aktueller DE3.56-Prüfbericht](docs/validation/DE3_56.json) — 137 Firmware-Testsuiten, 1.082 Webtests, je 21 Produktionsprüfungen für lokal und GitHub Pages.

[Dateimanager 3.35.0: Prüfbericht](docs/validation/WEB3_35_0.json) — 1.128 Webtests und je 21 Produktionsprüfungen bestanden. Neuer Geräte-Lesetest noch offen; kein Firmwarewechsel.
