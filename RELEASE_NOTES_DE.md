# DE3.16 — Allmiibo LCD Community-Vorabversion

Anwendung **2.21.0-DE3.16**, DFU-Zähler **572**. Grundlage: cylin577/pixl.js v2.21.0 (`57a364329436745f780e70ac07a1642989a00d6f`), ausgehend von solosky/pixl.js. Dies ist eine Community-Veröffentlichung, kein offizielles Upstream-Update.

[Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/de3.16) · [Kumulative Änderungen der DE-Reihe](https://github.com/bluecyber81/pixl.js/blob/de3.16/CHANGELOG_DE3_SERIES.md)

## Änderungen gegenüber DE3.15

- **SPIFFS:** Fehler beim Headerlesen während der Datei-ID-Vergabe werden weitergegeben. Der nachgestellte Fehlerpfad darf dadurch keine bereits belegte ID auswählen und anschließend schreiben.
- **Player:** Der ausgewählte Wiedergabepfad wird mit Speicherprüfung aufgebaut. Bei Speichermangel bleiben bisheriger Pfad und Browser erhalten; der Fehler wird angezeigt.
- **Player-Verzeichnisliste:** Reguläres Ende und Lese-/Schließfehler werden unterschieden. Eine unvollständige Liste wird verworfen, der Hauptmenü-Eintrag bleibt erreichbar. Listen-Speichermangel verwendet die vorhandene Speichermeldung.

Alle früheren DE-Korrekturen bleiben enthalten: ausgehandelter MTU23-Transport, Transferbereinigung und Schutz vor unerwarteter Fortsetzung ungültiger READ-Anfragen, Speicher-/Cachefehlerbehandlung, Speicherrückmeldung der Einstellungen, wiederhergestellte Mitteltasten-Aufwachfunktion, langsamerer LCD-Lauftext, UI-Speicher-/UTF-8-Korrekturen, NFC-Grenzprüfungen und der separate Vue-3-/Vite-Dateimanager. Die kumulative Übersicht beschreibt die jeweiligen Umfänge.

## Verifikation

- 70 Firmware-Hosttestsuiten bestanden.
- 175 gezielte Fälle (17 SPIFFS + 158 Player) bestanden nativ und erneut mit ASan/UBSan, einschließlich Gegenproben am alten Stand und unabhängiger Quellprüfung.
- ARM-LCD-Build, Quellen-/Testbindung, reine Anwendungs-Paketmetadaten, Payload-Hash und Signatur geprüft.
- Browser-DFU auf einem passenden LCD-Gerät abgeschlossen; normales Menü und neue Versionsabfrage `2.21.0-DE3.16` mit beobachteter ATT MTU250 bestätigt.
- Dateimanager **3.12.0** unverändert; seine ursprünglichen 84 Webtests werden als bestehende Belege übernommen, nicht als neuer Durchlauf.

NFC, Schlafen/Aufwachen und echte ATT MTU23 wurden unter DE3.16 noch nicht erneut geprüft. Reale MTU23-Lese-/Schreib-/Fehlerfalltests aus DE3.15 sind historische Belege, keine DE3.16-Freigabe. Es gibt keine gemessene Laufzeit-RAM-/Stackreserve und keine Zusage für Dauerbetrieb oder beliebige Stromausfälle.

## Downloads und Grenzen

Nur **`Allmiibo_LCD_DE3_16_572.zip`** auf einem passenden nRF52832-LCD-Gerät mit kompatibler vorhandener DFU-Umgebung flashen. Das geprüfte Design besitzt ein monochromes 128×64-LCD und Rädchen/Mitteltaste. Andere Platinenrevisionen und OLED-Varianten sind nicht abgedeckt. Das Anwendungs-OTA installiert weder Bootloader noch SoftDevice, Figurendumps oder `key_retail.bin`. Der Browser-Dateimanager bleibt separat.

Der gelegentliche zusätzliche verstümmelte **Tybalt**-Verzeichniseintrag bleibt ungeklärt. Diese Version ist kein bestätigter Fix dafür und führt keine automatische Speicherreparatur, Löschung oder Formatierung aus.

Die DE3.15-Rückkehrdatei enthält die bisherige Anwendung mit Zähler **573**. Danach benötigen spätere Updates einen Zähler über 573. Die Rückkehrdatei ersetzt keine Figuren-/Einstellungssicherung.

Urheberhinweise und GNU GPL Version 2 bleiben erhalten. Bitte README und kumulative Änderungsliste vor der Installation lesen.
