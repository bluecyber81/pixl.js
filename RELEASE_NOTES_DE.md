# DE3.55: aktueller Quellstand und Gesamtpaket

**Anwendung 2.22.0-DE3.55 / Zähler 627 · Dateimanager 3.33.1 · BL8-Quellen · S112-7.3.0-Dokumentation**

Der Hauptzweig und die Entwicklerdokumentation entsprechen jetzt den aktuellen Downloads. Die bisherigen Anwendungs- und Browserdateien bleiben unverändert. Wer DE3.55 bereits installiert hat, muss deshalb nicht erneut flashen.

- Passende Firmware- und BL8-Quellen, SDK-Korrekturen, Bauanleitungen, Beitragsleitfaden und CI.
- Frische unabhängige Builds reproduzieren Anwendung und BL8 bytegenau.
- Bisherige Speicher-, Tasten-, Bluetooth-/NFC- und DFU-Korrekturen sowie der aktuelle Browser mit Bildern, Katalogprüfung und farbiger Sammlungsanzeige bleiben enthalten.

## Downloads

- **Allmiibo_LCD_DE3_55_627_TESTSTAND.zip**: unveränderte flashbare Anwendung für passende LCD/PFS1-Geräte.
- **Allmiibo_Dateimanager_3_33_1.zip**: aktueller portabler Dateimanager.
- **Allmiibo_DE3_55_BL8_Web3_33_1_Projektquellen.zip**: aktueller öffentlicher Quellstand mit unabhängig baubaren Firmware-/BL8-Quellen und Browser.
- **Allmiibo_DE3_55_Web3_33_1_Gesamtpaket.zip**: alle genannten Downloads mit Anleitung und Prüfsummen. Das äußere Archiv ist **nicht flashbar**.
- **SHA256SUMS.txt**: Prüfsummen der veröffentlichten Dateien.

[Online-Dateimanager](https://bluecyber81.github.io/pixl.js/) · [DFU für Anwendungen](https://bluecyber81.github.io/pixl.js/dfu/web.html)

**DE3.8/DE3.16/SPIFFS und normales Upstream-LittleFS benötigen einen eigenen Migrationsweg.** Die Anwendung allein überträgt deren Sammlung nicht. Bereits passendes PFS1 braucht keine Formatierung. Das Anwendungsupdate ersetzt weder BL8 noch S112; kein pauschales kombiniertes Systemupdate wird angeboten. Private Schlüssel, Sicherungen und Figurendateien sind nicht enthalten.

Prüfumfang: archivierte 136 Firmware-Testgruppen, gezielte Sanitizer-/ARM-/Speichertests; 1.057 Webtests und je 21 Produktionsprüfungen. Begrenzte Gerätetests mit echter MTU23/250 bestanden am 2. November; NFC, Mitteldruck und Aufwachen wurden vom Besitzer bestätigt. Keine Garantie für jede Platine oder jeden Fehlerfall.

[Bedienung](https://github.com/bluecyber81/pixl.js/blob/de3.55/README.de.md) · [Mitarbeiten](https://github.com/bluecyber81/pixl.js/blob/de3.55/CONTRIBUTING.md) · [Prüfgrenzen](https://github.com/bluecyber81/pixl.js/blob/de3.55/docs/validation/DE3_55.json)
