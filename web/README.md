# Allmiibo Dateimanager 3.37.3

Wenn Bluetooth beim Hochladen einer Figur abbricht, zeigt der Dateimanager den betroffenen Speicherort und die ursprüngliche Sitzung an. Steht der Abschluss noch aus, verbinde dasselbe Gerät erneut und prüfe den Zielordner, bevor du den Upload wiederholst. Halte den Browsertab dafür geöffnet. Beim Gerätewechsel verschwinden die Erfolgs- und Fehlermeldungen des vorherigen Geräts. Hinweise auf zu prüfende Dateien bleiben bei ihrer ursprünglichen Sitzung.

Bei der Sammlungsprüfung und der ZIP-Sicherung zeigt die Ordnersuche ihren Fortschritt. Sobald genug Dateien gelesen sind, zählt eine Schätzung für den laufenden Schritt herunter. Bei ausbleibender Geräteantwort erscheint ein Wartehinweis. Die Gerätediagnose zeigt zusätzlich den aktuellen Diagnosebereich. Orange Figurenkarten erklären den jeweiligen Prüfhinweis.

[Online öffnen](https://bluecyber81.github.io/pixl.js/) · [DFU-Seite](https://bluecyber81.github.io/pixl.js/dfu/web.html) · [Portable-Version und Quellen](https://github.com/bluecyber81/pixl.js/releases/tag/web3.37.3) · [Startanleitung](LIESMICH_3_37_3.txt)

Auf dem Allmiibo **Bluetooth-Dateiübertragung** öffnen und das Gerät im Browser über **Verbinden** auswählen. Wer die Seite lokal nutzt, entpackt das portable ZIP und startet unter Windows **Start-Dateimanager.cmd**. Der Standardport ist **8765**.

## Firmwarepaket vor der Übertragung prüfen

Der Eintrag „BL8/Z13“ im Paketkatalog nennt die bekannten Bootloader für dieses Anwendungsupdate. Ein LCD-Gerät mit passendem BL8 kann die Anwendung direkt installieren. Bei **Gerät & Diagnose → Versionsabgleich** vergleicht der Dateimanager den Bereichs-Hash und den zugehörigen Zähler. BL8/Zähler 11 und Z13/Zähler 13 sind getrennte Referenzen. Ein zurückgespielter BL8 mit höherem Zähler wird als Abweichung angezeigt. Die Kompatibilität der konkreten Platine ist gesondert zu prüfen.

In Schritt 1 der DFU-Seite zeigt die Dateiauswahl den Anwendungszähler, das Hardwarefeld und die erlaubten SoftDevice-FWIDs. Eine höchstens zehn Minuten alte Bootdiagnose aus dem Dateimanager ermöglicht einen Vergleich. Ein Hinweis auf einen niedrigeren Zähler oder eine abweichende FWID ist vor der Geräteauswahl sichtbar. Vermischte oder widersprüchliche Startdaten werden vor Bluetooth abgewiesen.

Unter **Gerät & Diagnose → Alle Diagnosewerte auslesen → Gesamtdiagnose speichern** lässt sich die Diagnose als JSON sichern. Der Abschnitt zum Speicher nennt konfigurierte Cachegrößen. Der kleinste freie Stack ist nur verfügbar, wenn ihn die Firmware tatsächlich gemessen hat.

## Galerie und Bestandsfilter

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

## Aktualisierte Katalogdaten

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

## Startzeit und Speicherprofil

Über **Gerät & Diagnose → Startzeiten lesen → Früheren Startbericht vergleichen** einen früheren Start- oder Gesamtdiagnosebericht auswählen. Für einen aussagekräftigen Vergleich Berichte desselben Geräts mit vergleichbarer Sammlung verwenden. Die Datei wird lokal gelesen. Für die Phasen Speicher und Anwendung bedeutet ein negativer Unterschied eine kürzere Zeit.

Das aktuelle PFS1-Profil berücksichtigt die sechs expliziten Paare DE3.55/627, DE3.56/628, DE3.57/629, DE3.58/630, DE3.59/631 und DE3.60/632. Die Speicherumstellung prüft Version, Zähler und Engine-Identität. Bei einem bereits passenden PFS1-Gerät genügt das Anwendungsupdate. Der Browser überprüft die SHA-256 der vollständigen BIN gegen die Init-Daten ihrer DAT-Datei. [DE3.60-Anwendungsquellen](https://github.com/bluecyber81/pixl.js/releases/download/de3.60/Allmiibo_DE3_60_Quellcode.zip).

## Bauen, testen und veröffentlichen

Node/npm gemäß [Mitarbeit und Werkzeuge](https://github.com/bluecyber81/pixl.js/blob/de3.60/CONTRIBUTING.md) verwenden:

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
den unveränderten Speicherkern und werden nicht nur wegen DE3.59 umbenannt.

Abhängigkeiten sind in `package-lock.json`, Quellen und Lizenzen in
`third-party/npm/SOURCES.json` gebunden. Ältere nicht referenzierte Lizenzkopien
sind historische Hinweise, keine zusätzlich installierten Bibliotheken.
Das separate [Web-Quellpaket](https://github.com/bluecyber81/pixl.js/releases/download/web3.37.3/Allmiibo_Dateimanager_3_37_3_Quellcode.zip)
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

Browser-Hosttests verwenden simuliertes Bluetooth und reale lokale WASM-Kerne. Eine direkte Bluetooth-Abfrage am Allmiibo mit DE3.59 lieferte die [Start- und RAM-Werte](https://github.com/bluecyber81/pixl.js/blob/de3.59/docs/validation/DE3_59_READBACK.json). Praxistests mit dem Online-Dateimanager 3.37.3, NFC und absichtlich ausgelösten Speicherfehlern stehen für diese Version aus. [Nachweise und Messgrenzen](https://github.com/bluecyber81/pixl.js/blob/de3.59/docs/validation/DE3_59.json).

Gerät & Diagnose: DE3.59 meldet den unberührten Stack ab Anwendungseinstieg. Bei älteren Versionen ist das Feld unbekannt. Unter Startzeiten lassen sich 3 bis 20 gespeicherte Berichte unterschiedlicher Neustarts derselben Firmware bei gleicher Sammlung vergleichen (Median und Minimum–Maximum). Mehrfache Abrufe desselben Starts zählen nicht mehrfach.
