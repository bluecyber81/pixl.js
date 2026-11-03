# Dateimanager 3.35.0

Neu: **Gerät & Diagnose → Alle Diagnosewerte auslesen → Gesamtdiagnose speichern**. Zusätzliche Speicher-, RAM-, MTU- und Tastenwerte ohne neues Flashen. [Bedienung und Grenzen](https://github.com/bluecyber81/pixl.js/blob/web3.35.0/docs/DIAGNOSTICS_3_35.md).

[Startanleitung und Bedienung](LIESMICH_3_35_0.txt) · [Online-Dateimanager](https://bluecyber81.github.io/pixl.js/) · [Release-Hinweise](../RELEASE_NOTES_DE.md)

## Neu: Galerie und Bestandsfilter

**Figurenkatalog → Bilder anzeigen** aktiviert die optionale Galerie der aktuellen
Seite. Vor dem Einschalten gibt es keine Galerie-Bildabrufe. Bilder verwenden die
aktive Katalogrevision; eine feste Fläche und ein Platzhalter halten die Karten
bei Ladefehlern stabil. GitHub erhält beim Bildabruf die öffentliche Figuren-ID
und IP-Adresse, keine Gerätedateien.

**Bestand filtern** zeigt vorhandene, nicht gefundene, auffällige oder
unbestätigte/veraltete Einträge. Grundlage ist weiterhin „Sammlung prüfen“:
Grün = ID gefunden, Orange = Prüfhinweis, Rot = nach vollständiger Inhaltsprüfung
von ganz E: nicht gefunden. Teilprüfungen oder fehlende Metadaten belegen keine
Abwesenheit. Ein Ergebnis nach Trennung bleibt als frühere Beobachtung markiert.
Neue Verbindung, Änderungen oder Neuladen verwerfen den alten Bestand.

Ein bewusster Seitenwechsel führt zum Anfang der Ergebnisse. Eingaben in der
Suche verschieben den Fokus nicht. Alte Details schließen beim Blättern.

## Korrektur: aktualisierte Katalogdaten überall verwenden

Über „Nach neuen Figuren suchen“ übernommene Metadaten gelten jetzt auch für
Gerätesuche, Auswahlvorschau, Dateieigenschaften und lokale Figurendateiprüfung.
Ein Katalogwechsel beendet eine laufende Gerätesuche; sie kann mit dem neuen
Stand neu gestartet werden. Verspätete alte Ergebnisse/Bildfehler überschreiben
nicht die aktuelle Auswahl. Diese Verbindungen werden mit tatsächlichen
Vue-Komponenten und synthetischen BIN-Dateien getestet.

Der gebündelte Katalog umfasst weiterhin 952 öffentliche IDs. Metadaten/Bilder
sind keine spielfertigen Figurendateien. Eigene BIN-Dateien oder direkte
HTTPS-Quellen können geprüft und übertragen werden; vorhandene Dateien werden
dabei nicht automatisch überschrieben. Grundstruktur und ID-Prüfung ersetzen
keine kryptografische Prüfung oder Erkennung an der Konsole.

## Firmware und Speicherprofile

Das mitgelieferte Anwendungsupdate ist **DE3.56/628** für passende LCD/PFS1-Geräte
mit BL8/S112 7.3.0. Es enthält neue Tastaturhinweise und eine besser sichtbare
Scrollanzeige. **Bootloader, SoftDevice, PFS1-Datenlayout und Speicherkern bleiben
unverändert.** Eine vorhandene passende Sammlung benötigt keine Formatierung
oder Wiederherstellung. Die Browserverbesserungen allein erfordern kein Flashen.

Der bisherige DE3.55-Simulator und seine Engine-Identität bleiben unverändert.
Das aktuelle Profil akzeptiert ausdrücklich die Paare **DE3.55/627** und
**DE3.56/628**. Unter „Speicherumstellung“ ist DE3.56/628 der aktuelle Zielstand.
Alle früheren Profile bleiben separat vorhanden; die Auswahl bestätigt keine
tatsächlich installierte Firmware oder unbekannte Display-/Speicherkompatibilität.
Die Prüfung verknüpft Version, Zähler und Engine-Identität.

Die Firmware-Paketliste und DFU-Seite verlinken die genaue
[DE3.56-Quelle](https://github.com/bluecyber81/pixl.js/releases/download/de3.56/Allmiibo_DE3_56_Quellcode.zip).
Paketprüfung und Übertragung sind getrennt: SHA-256 bindet die Paketbytes;
erst die ausdrückliche Geräteauswahl startet den Transfer. Das Anwendungs-ZIP
ersetzt weder BL8/S112 noch migriert es eine SPIFFS-/Upstream-LittleFS-Sammlung.

## Bauen, testen und veröffentlichen

Node/npm gemäß [CONTRIBUTING.md](../CONTRIBUTING.md) verwenden:

```sh
npm ci
npm test
npm run build
npm run build:pages
```

Der lokale Build liegt in `dist/`, der Pages-Build für `/pixl.js/` in
`dist-pages/`. Beide führen ihre Produktionsprüfungen aus und enthalten dieselben
gebundenen Lizenztexte unter „Quellen & Lizenzen“. Für Pages nur den Inhalt von
`dist-pages/` veröffentlichen, keine Quellen, Serverzustände oder private Dateien.
Eine andere Projektadresse benötigt einen passenden Basis-Build mit Tests.

Der isolierte native Test
`scripts/check-pfs-compatibility.py --output <neuer Ordner>` benötigt GCC und
prüft einen synthetischen Datenträger mit beiden Kernständen: alt erstellen,
neu lesen/ändern, alt lesen/ändern, neu erneut lesen. Er vergleicht Inhalte,
Pfade, Raw128-Metadaten und Importidentität.
`scripts/build-capacity-simulator.py --profile current` reproduziert den
beibehaltenen aktuellen WASM mit clang 23.1.4; `--profile de354` den vorherigen.
Historische Verzeichnis-/Artefaktnamen wie `packed-simulator-de355` identifizieren
den unveränderten Speicherkern und werden nicht nur wegen DE3.56 umbenannt.

Abhängigkeiten sind in `package-lock.json`, Quellen und Lizenzen in
`third-party/npm/SOURCES.json` gebunden. Ältere nicht referenzierte Lizenzkopien
sind historische Hinweise, keine zusätzlich installierten Bibliotheken.
Das separate [Web-Quellpaket](https://github.com/bluecyber81/pixl.js/releases/download/web3.35.0/Allmiibo_Dateimanager_3_35_0_Quellcode.zip)
enthält Quellen und Tests, keine privaten Sicherungen oder Figurendateien.

## Verbindung und Grenzen

Web Bluetooth erfordert einen unterstützenden Browser sowie HTTPS oder localhost.
Die normale Betriebssystem-Paarung ist nicht erforderlich. Bluetooth läuft
direkt zwischen dem Browsergerät und Allmiibo; Pages ist keine Funkbrücke zum
heimischen Laptop. Sicherungen, Diagnosen und Sammlungen werden nicht automatisch
an GitHub gesendet.

Informationslinks funktionieren lokal als `/?amiibo=01010000000e0002` oder
`/#/a/01010000-000e0002`, auf Pages mit `/pixl.js/` davor. Sie sind öffentliche
Figureninformationen, keine Gerätebefehle. Die ältere lokale Route
`/a/<8Hex>-<8Hex>` benötigt einen lokalen Server und ist kein Pages-Routeersatz.

Tests verwenden simuliertes Bluetooth und echte lokale WASM-Kerne. Sie ersetzen
keine Funk-, NFC-, Startzeit- oder physische Speichermessung. Geräteprüfungen
von DE3.56 stehen noch aus; frühere DE3.55-Ergebnisse gelten nicht als neue
Hardwareprüfung. Ein zusätzlicher Startzeitgewinn wird hier nicht behauptet.
