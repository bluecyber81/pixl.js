# Allmiibo LCD â€” DE3-Firmware und Dateimanager

[English](README.md) Â· [Dateimanager Ã¶ffnen](https://bluecyber81.github.io/pixl.js/) Â· [Aktuelle Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/de3.56) Â· [Mitarbeiten](CONTRIBUTING.md)

Quellstand **3. November 2026**: **Firmware 2.22.0-DE3.56 / ZÃ¤hler 628**, **Dateimanager 3.34.0**, **Bootloader BL8**, **Nordic S112 7.3.0 / FWID 0x0126**, Dateisystem **Packed LittleFS/PFS1**.

Diese Community-Weiterentwicklung von bluecyber81 baut auf [cylin577/pixl.js](https://github.com/cylin577/pixl.js) und ursprÃ¼nglich [solosky/pixl.js](https://github.com/solosky/pixl.js) auf. Sie ist keine offizielle Version dieser Entwickler. Aus spÃ¤teren Upstream-Versionen wurden ausgewÃ¤hlte Ã„nderungen Ã¼bernommen; die Versionsnummer bedeutet keine vollstÃ¤ndige Gleichheit mit deren aktuellem Stand.

## Neu in DE3.56 und 3.34.0

- **Beim Suchen und Umbenennen am GerÃ¤t:** Die Tastatur zeigt das Zeichen, das ein kurzer Mitteldruck wirklich einfÃ¼gt. Oben erklÃ¤rt etwa `q/Q` kurz/lang und `_/SP` Unterstrich/Leerzeichen. Lange Titel Ã¼berdecken die Hilfe nicht. Die bisherige Eingabefunktion bleibt erhalten.
- **In Listen und Ordnern:** Der Scrollbalken bleibt auch bei vielen EintrÃ¤gen sichtbar und erreicht die Enden korrekt.
- **Figurenkatalog â†’ Bilder anzeigen:** Optionale Galerie mit Bildern der aktuellen Seite, fester BildflÃ¤che und Platzhalter bei fehlenden Bildern. Ohne Einschalten erfolgt kein Galerie-Bildabruf.
- **Figurenkatalog â†’ Bestand filtern:** Vorhandene, nicht gefundene, auffÃ¤llige und unbestÃ¤tigte/veraltete EintrÃ¤ge getrennt anzeigen. Grundlage bleibt die SammlungsprÃ¼fung mit ihren bisherigen Grenzen.
- **Weiter/ZurÃ¼ck im Katalog:** Die Ansicht fÃ¼hrt zum Anfang der neuen Ergebnisse. Tippen in der Suche verschiebt den Fokus nicht.
- **Nach neuen Figuren suchen:** Ãœbernommene Katalogdaten gelten jetzt auch fÃ¼r GerÃ¤tesuche, Auswahlvorschau, Dateieigenschaften und lokale DateiprÃ¼fung. Ergebnisse und verspÃ¤tete Bildfehler des alten Stands Ã¼berschreiben den neuen Stand nicht.

[Bedienwege und vollstÃ¤ndige Release-Hinweise](RELEASE_NOTES_DE.md). **Die direkte GerÃ¤teprÃ¼fung von DE3.56 steht noch aus.** FÃ¼r dieses Update wird kein zusÃ¤tzlicher Startzeitgewinn behauptet.

## Benutzen und installieren

1. [Online-Dateimanager](https://bluecyber81.github.io/pixl.js/) in einem Browser mit Web Bluetooth Ã¶ffnen, am GerÃ¤t **Bluetooth-DateiÃ¼bertragung** starten und auf der Seite verbinden.
2. FÃ¼r die neue Tastaturdarstellung und Scrollleiste **Allmiibo_LCD_DE3_56_628_TESTSTAND.zip** unverÃ¤ndert auf der [DFU-Seite](https://bluecyber81.github.io/pixl.js/dfu/web.html) auswÃ¤hlen. **Dieses Paket ersetzt nur die Anwendung.**
3. FÃ¼r die lokale Nutzung **Allmiibo_Dateimanager_3_34_0.zip** entpacken und unter Windows mit installiertem Python `Start-Dateimanager.cmd` starten. Das Ã¤uÃŸere **Allmiibo_DE3_56_Web3_34_0_Gesamtpaket.zip** ist ein Downloadarchiv, keine flashbare ZIP.

Die Browserverbesserungen benÃ¶tigen kein GerÃ¤teupdate. **BL8, S112 7.3.0 und das PFS1-Speicherlayout bleiben unverÃ¤ndert.** Eine vorhandene passende Sammlung benÃ¶tigt keine Formatierung oder Wiederherstellung.

**Alte GerÃ¤te mit DE3.8/DE3.16 oder SPIFFS benÃ¶tigen vorher eine vollstÃ¤ndige Sicherung und eine getrennte Speicherumstellung.** Normales Upstream-LittleFS hat ebenfalls ein anderes Layout. Die Firmware allein Ã¼bertrÃ¤gt deren Sammlung nicht. Siehe [Installation](docs/INSTALLATION.md), [Migration](docs/MIGRATION_PFS1.md) und [Komponenten](docs/COMPONENTS.md). Bluetooth nutzt das GerÃ¤t, auf dem der Browser lÃ¤uft; ein VPN verlÃ¤ngert dessen Funkreichweite nicht.

## Beibehaltene Verbesserungen

- Deutsche/englische MenÃ¼s, gut lesbarer Lauftext, stabile QR-Seiten, Figureninformationen, Favoriten und begrenzte Listen fÃ¼r groÃŸe Ordner/Datenbanken.
- Korrigierte MitteldrÃ¼cke, klare Bluetooth-ZustÃ¤nde, Freigabe unvollstÃ¤ndiger Clients und Diagnose fÃ¼r Heap, Speicher und Startphasen.
- MTU23-DateiÃ¼bertragung, atomare kleine Speicherungen samt Raw128-Metadaten, Abbruch/Wiederholung und Schutz ungespeicherter NFC-Ã„nderungen nach Speicherfehlern.
- Optionale Bluetooth-Fernbedienung bis zum Ausschalten und Disney-Infinity-Profil fÃ¼r eine passende eigene 320-Byte-MiFare-Mini-Datei.
- Packed LittleFS mit Caches, gestreamten Initialisierungsschritten, geteilter CRC-Arbeit sowie gezielten Lese-/Cache-/VerschleiÃŸkorrekturen.
- Browser-Vorschau, Suche Ã¼ber GerÃ¤teordner, gemeinsamer Upload, ZIP/Raw128-Sicherung mit Fortsetzen, Wiederherstellung/Migrationssimulation, Versionsvergleich und Laufzeit-/Startdiagnose.
- Farbiger Sammlungsabgleich: **GrÃ¼n ID gefunden**, **Orange PrÃ¼fhinweis**, **Rot nicht gefunden nach vollstÃ¤ndiger InhaltsprÃ¼fung von E:**. TeilprÃ¼fungen oder fehlende Metadaten bleiben unbestÃ¤tigt. Nach Trennung bleibt eine datierte Beobachtung sichtbar; erneutes Verbinden, Ã„nderungen oder Neuladen verwerfen sie.

Der mitgelieferte Katalog umfasst **952 IDs**, keine Figurendateien. Ein ID-Treffer bestÃ¤tigt weder SignaturgÃ¼ltigkeit noch SpielunterstÃ¼tzung. Bildabrufe Ã¼bermitteln die Ã¶ffentliche Figuren-ID und die IP-Adresse an den Bildanbieter, keine GerÃ¤tedateien. Eigene Dateien bzw. HTTPS-Quellen kÃ¶nnen geprÃ¼ft und hochgeladen werden. [Ã„nderungsverlauf](CHANGELOG_DE3_SERIES.md).

## Entwickeln, prÃ¼fen und zusammenarbeiten

[AusfÃ¼hrliche Verbesserungen/Fehlerbehebungen](docs/DEVELOPMENT_HISTORY.de.md) Â· [BL8-/S112-Arbeit](docs/BOOTLOADER_SOFTDEVICE_CHANGES.md) Â· [Separate Komponentendownloads](https://github.com/bluecyber81/pixl.js/releases/tag/bl8-s112-7.3.0)

BL8 liegt mit eigener Quelle und signiertem Einzelpaket vor. [S112 7.3.0](softdevice-s112/README.md) ist die unverÃ¤nderte Nordic-Originaldatei mit Lizenz. Unsere Integration, SDK-Korrektur und Diagnosen sind getrennt von Nordics Ã„nderungen beschrieben. Die Einzelpakete behalten ihre ZÃ¤hler- und Installationsvoraussetzungen.

[Mitarbeit und Tests](CONTRIBUTING.md) Â· [Firmware bauen](docs/BUILD_DE3_56.md) Â· [BL8 bauen](bootloader-bl8/README.md) Â· [DE3.56-Quellcode](https://github.com/bluecyber81/pixl.js/releases/download/de3.56/Allmiibo_DE3_56_Quellcode.zip) Â· [Dateimanager-Quellcode](https://github.com/bluecyber81/pixl.js/releases/download/de3.56/Allmiibo_Dateimanager_3_34_0_Quellcode.zip)

Gezielte Regressionen prÃ¼fen Katalogwechsel, Bildfreigaben/-fehler, Statusfilter, Seitenwechsel sowie Tastatur und Scrollanzeige. AbschlieÃŸende PrÃ¼fergebnisse werden versionsgebunden dokumentiert. Die [frÃ¼heren DE3.55-GerÃ¤tetests](docs/validation/DE3_55.json) einschlieÃŸlich MTU23/250, NFC, Mitteldruck, Aufwachen und Startmarken sind keine HardwareprÃ¼fung von DE3.56.

Zielhardware: passende 128Ã—64-LCD-Platine, nRF52832 mit 512 KiB internem Flash und 64 KiB RAM. Der Anwendungs-Heap bleibt 18.432 Bytes groÃŸ. Der Build weist die tatsÃ¤chliche Flashbelegung aus; Heap-Stichproben messen nicht den gesamten RAM/Stack und geben keine beliebige Allmiibo-/OLED-Variante frei.

## Herkunft und Lizenzen

Danke an solosky, cylin577 und die Komponentenentwickler; [Mochi](https://github.com/tasken/Mochi) lieferte Anregungen zur Browserbedienung. [Lizenzhinweise](THIRD_PARTY_NOTICES.md) und Originalvermerke bleiben erhalten. S112 ist Nordic-Software unter deren Bedingungen. Der bekannte Upstream-SignierschlÃ¼ssel beweist PaketkompatibilitÃ¤t, keine exklusive HerausgeberidentitÃ¤t. Private SchlÃ¼ssel, Sicherungen und Figurensammlungen werden nicht verÃ¶ffentlicht.

[Aktueller DE3.56-Prüfbericht](docs/validation/DE3_56.json) — 137 Firmware-Testsuiten, 1.082 Webtests, je 21 Produktionsprüfungen für lokal und GitHub Pages.
