# Allmiibo Dateimanager 3.42.1

Auf dem Handy führen die bebilderten Schaltflächen direkt zu Figurenimport und Firmwareupdate. Die sechs Bereiche haben eigene Farbakzente. „Dein Gerät“ zeigt den aktuellen Ordner und die Speicherbelegung mit einem breiten Verlaufsbalken. Der Figurenimport öffnet sich jetzt auch beim ersten Klick, wenn der Browser die Ansicht noch lädt. Die Anleitung beschreibt zusätzlich Nordics PC-Weg für Bluetooth-DFU mit einem passenden Adapter. [Bedienung](../docs/DATEIMANAGER_WEB.md#dateimanager-3421)

Die Startseite führt direkt zum Figurenimport oder zum Firmwareupdate. Bei blockierten Downloads kannst du die Quelle separat öffnen und die gespeicherte BIN prüfen. Treffer in der Gerätesuche lassen sich direkt herunterladen. Den geprüften Bestand kannst du als CSV für Excel speichern. [Funktionen seit 3.42.0](../docs/DATEIMANAGER_WEB.md#dateimanager-3420)

3.40.1 übernimmt die Paketauswahl beim Wechsel in den Updater und zeigt bei der fertigen Sicherung die frisch gelesenen und wiederverwendeten Dateien an. Im Serienfilter sind auch die drei Serien mit ausschließlich angekündigten Figuren auswählbar. [Bedienung](../docs/DATEIMANAGER_WEB.md#dateimanager-3401)

Seit 3.40.0 gibt es die direkte Figurenvorschau in der Gerätesuche, neun Ankündigungen und die Wiederaufnahme einer Sicherung mit frischem Inhaltsvergleich. Mit der LCD-Testversion DE3.66 lässt sich unter **Gerät & Diagnose** das aktuelle Display als PNG speichern. [Änderungen und Handy-Update](https://github.com/bluecyber81/pixl.js/blob/main/docs/RELEASE_DE3_66.md) · [Alle dokumentierten Web-Versionen](https://github.com/bluecyber81/pixl.js/blob/main/docs/VERSIONEN_WEB.md)

Der Dateimanager erklärt Namenskollisionen, für Windows ungeeignete Dateinamen und abweichende Unicode-Schreibweisen direkt beim Vergleich. Im Figurenkatalog gibt es alle 54 vorhandenen englischen Nutzungshinweise auch auf Deutsch. Auf der DFU-Seite kann der Browser während des Updates das Display wach halten.

Unter **Update** und auf der DFU-Seite stehen für LCD mit vorhandenem PFS1 und S112 7.3.0 die stabile DE3.65/637 und die optionale Testversion DE3.66/638 zur Auswahl. Der Versionsvergleich erkennt den passenden App-Zähler und Z19. [Startanleitung 3.42.1](LIESMICH_3_42_1.txt).

Dateimanager 3.39.3 meldet nach einem bestätigten Firmwaretransfer ausdrücklich, wenn der Browser die Bluetooth-Trennung angefordert hat. Beim Hochladen, Synchronisieren oder Umbenennen nennt die Fehlermeldung jetzt den zu langen Namen oder Pfad, seine Größe in UTF-8-Bytes und die zulässige Länge. [Bedienung und Grenzen](../docs/RELEASE_WEB3_39_3.de.md).

**3.39.2** zeigt neben **Kataloghinweise** den Datenstand aus dem tatsächlich eingebauten Katalog. Die Beschriftung bricht auf schmalen Displays um; andere Sprachen verwenden den englischen Fallback. Die Daten und persönlichen Notizen werden dadurch nicht verändert. [Änderungen und Prüfgrenzen](../docs/RELEASE_WEB3_39_2.de.md).

**3.39.1** ergänzt während laufender Sicherungen, Dateiübertragungen und längerer Geräteabfragen eine sichtbare Display-Wachhaltehilfe. Unterstützte Browser fordern bei sichtbarem Tab eine Screen Wake Lock an. Die Anzeige zeigt den tatsächlichen Zustand, lässt sich abschalten und bietet bei Ablehnung oder Freigabe einen erneuten Versuch. Nach Ende oder Trennen wird die Sperre freigegeben.

Den Tab im Vordergrund lassen: manuelles Sperren, Energiesparen oder Browser-Suspend können Bluetooth weiterhin unterbrechen. Die Hilfe garantiert keine Hintergrundübertragung. Die Funktionen aus 3.39.0 bleiben enthalten. [Bedienung und Prüfgrenzen](../docs/RELEASE_WEB3_39_1.de.md).

**Der vorherige Stand 3.39.0** ist ein am Rechner und in Chrome geprüfter Browserstand. Unter **Figurenkatalog → Details und Bild** und in der **Dateivorschau** erscheinen Kataloghinweise zu 952 Figuren und 1.344 Zuordnungen. Acht redaktionelle deutsche Teilübersetzungen decken 13 Zuordnungen ab; weitere vorhandene Texte bleiben gekennzeichnet englisch. Eine Zuordnung bestätigt keine Spielkompatibilität oder Belohnung.

**Figurensammlung → Prüfung: Dateiinhalte prüfen (empfohlen) → Sammlung prüfen → Anzeigen → Gleiche Figuren-ID / Dateiinhalte** trennt gleiche IDs von SHA-256-Inhaltsgruppen. Verwendet werden bereits gelesene Dateibytes; zusätzliche Bluetooth-Lesezugriffe entfallen. Die Schnellprüfung vergleicht keine Inhalte. Kein Eintrag wird automatisch gelöscht. Nach einem Schreibvorgang den als veraltet markierten Bericht erneut prüfen.

**Gerät & Diagnose → Karten-Slot lokal prüfen** verarbeitet eigene lokale Dateien: erst die vollständige v8-Konfiguration `chameleon/slots/config.bin`, dann den Slot und seine passende `NN.bin`. Unterstützt sind MF0ICU1, MF0ICU2, MF0UL11 und MF0UL21. Nur bei bekanntem altem UID-Kopiermuster und gültigen BCCs wird eine erneut geprüfte `NN.uid-corrected.bin` angeboten. Höchstens vier UID-Bytes ändern sich; Quelle und übrige Bytes bleiben erhalten. Die gemeinsame Herkunft der Dateien ist nicht automatisch beweisbar. Es erfolgt kein Schreiben auf das Gerät und keine Bestätigung der Karten-/Lesegerätfunktion.

**Sicherung → ZIP importieren → Sicherungs-ZIP auswählen → Vergleichen** schließt im normalen Schema-1-Restore die exakten inaktiven Stammdateien `.pixl_txn_old` und `.pixl_txn_new` sichtbar aus, erhält sie aber im Archiv. Aktive/unklare Stamm-Transaktionseinträge sperren den gesamten Import. Quelle, I:/-/E:/-Zielumleitung und frischer Zielzustand werden geprüft. Gleichnamige Dateien in gewöhnlichen Unterordnern bleiben normale Nutzdaten. Schema-2-Restores verwenden weiterhin den Migrationsassistenten.

Die DFU-Seite enthält **DE3.65 / 637** als reines Anwendungsupdate für LCD-Geräte mit PFS1 und S112 7.3.0. Nach der Auswahl prüft der Dateimanager die ZIP-Datei. Die Bluetooth-Übertragung startet durch die Geräteauswahl in Schritt 2. [Startanleitung 3.42.1](LIESMICH_3_42_1.txt).

Seit **3.38.1** bleibt unter **Sicherung** der Fehler beim Öffnen eines Laufwerks
auch dann sichtbar, wenn anschließend die Laufwerksliste erfolgreich neu gelesen
wird. Das Laufwerk lässt sich direkt erneut auswählen. Ein erfolgreicher neuer
Öffnungsversuch oder ein Verbindungswechsel entfernt den alten Hinweis. Die
Korrektur benötigt kein Firmwareupdate und verändert keine Gerätedateien.

Die RAM-Ansicht erklärt jetzt direkt, wie viele Speicherstichproben vorliegen:
keine, eine, wenige, viele oder unbekannt. Eine fehlerfreie Einzelaufnahme gilt
damit nicht als Belastungstest. Der Hinweis erscheint in Einzel- und Gesamtdiagnose.

Ab **DE3.62** zeigt **Gerät & Diagnose → Startzeiten lesen** zusätzlich die Zeit
für Flash-/Geometrievorbereitung und den PackedFS-Scan. Unter
**Laufwerk einbinden: Zeit und Lesezugriffe** stehen Cachetreffer, geeignete
Cachefehlschläge, Zugriffe ohne Cache und physische Lesefehler. Das Profil gehört
zum letzten tatsächlich ausgeführten Mount; erneutes Lesen startet keinen neuen
Mount. Fehlende Messungen bleiben unbekannt, gesättigte Zähler sind Untergrenzen.
Ältere Firmware nutzt weiterhin die bisherigen Diagnoseformate.

Im Bereich **Sicherung** bleibt ein fehlgeschlagener Laufwerksaufruf sichtbar und
kann wiederholt werden. Während des Öffnens erscheint ein Wartehinweis. Erst
**Ordner sichern (ZIP)** startet die Sicherung; der aktivierte Knopf ist farblich
hervorgehoben. Das Öffnen des Laufwerks schreibt keine Dateien.

Die reproduzierbare [Browserprüfung](BROWSER_TESTS.md) prüft den gebauten
Dateimanager und die App-DFU-Seite auf Desktop und Mobilgröße. Sie verwendet
synthetische Zustände und ersetzt keinen Test am Allmiibo.

Unter **Sicherung** kannst du das erkannte Laufwerk direkt öffnen. Steht bei „Geöffneter Ordner“ das Hauptverzeichnis **E:/**, sichert **Ordner sichern (ZIP)** die Dateien auf dem ganzen Laufwerk. Bei DE3.8 ist das der erste Schritt vor der späteren Sicherung aller 128 Metadatenbytes für die Speicherumstellung.

Unter **Gerät & Diagnose** zeigt die Gesamtdiagnose die von der Firmware gemeldete ATT-MTU. Die Transportübersicht führt die vom Dateimanager genutzte GATT-Wertgröße getrennt auf. Ab DE3.61 schlüsselt „Startzeiten lesen“ den Speicherstart in Einbinden des Laufwerks, Journalprüfung und übrige Initialisierung auf. Frühere Berichte lassen sich weiterhin anhand der gemeinsamen Startmarken vergleichen. Der Versionsabgleich erkennt Z15 am vollständigen Bereichshash und am Zähler 15.

Wenn Bluetooth beim Hochladen einer Figur abbricht, zeigt der Dateimanager den betroffenen Speicherort und die ursprüngliche Sitzung an. Steht der Abschluss noch aus, verbinde dasselbe Gerät erneut und prüfe den Zielordner, bevor du den Upload wiederholst. Halte den Browsertab dafür geöffnet. Beim Gerätewechsel verschwinden die Erfolgs- und Fehlermeldungen des vorherigen Geräts. Hinweise auf zu prüfende Dateien bleiben bei ihrer ursprünglichen Sitzung.

Bei der Sammlungsprüfung und der ZIP-Sicherung zeigt die Ordnersuche ihren Fortschritt. Sobald genug Dateien gelesen sind, zählt eine Schätzung für den laufenden Schritt herunter. Bei ausbleibender Geräteantwort erscheint ein Wartehinweis. Die Gerätediagnose zeigt zusätzlich den aktuellen Diagnosebereich. Orange Figurenkarten erklären den jeweiligen Prüfhinweis.

[Online-Seite (separater Veröffentlichungsstand) öffnen](https://bluecyber81.github.io/pixl.js/) · [DFU-Seite](https://bluecyber81.github.io/pixl.js/dfu/web.html) · [Version 3.42.1](https://github.com/bluecyber81/pixl.js/releases/tag/web3.42.1) · [Startanleitung](LIESMICH_3_42_1.txt)

Auf dem Allmiibo **Bluetooth-Dateiübertragung** öffnen und das Gerät im Browser über **Verbinden** auswählen. Wer die Seite lokal nutzt, entpackt das portable ZIP und startet unter Windows **Start-Dateimanager.cmd**. Der Standardport ist **8765**.

## Firmwarepaket vor der Übertragung prüfen

Bei **Gerät & Diagnose → Versionsabgleich** vergleicht der Dateimanager den SHA-256-Wert des Bootloaderbereichs mit dem zugehörigen Zähler. Die gespeicherten Referenzen sind BL8 (11), Z13 (13), Z15 (15) und Z17 (17) sowie Z19 (19). Z13-Code mit Zähler 16 wird als bekanntes Z16-Rückkehrpaket bezeichnet; Z18 ist das Rückkehrpaket mit unverändertem Z15-Code und Zähler 18. Andere Kombinationen werden getrennt als Abweichung angezeigt. Der Paketkatalog beschreibt die mitgelieferte Anwendung und ihre Voraussetzungen separat. Bei einer aktuellen Gerätediagnose warnt die DFU-Seite vor einem niedrigeren App-Zähler. Z15 kann eine ältere, gültig signierte Anwendung installieren. Für Bootloader-Pakete gilt ein eigener Versionszähler.

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

Das aktuelle PFS1-Profil berücksichtigt die zwölf Versions-/Zählerpaare von DE3.55/627 bis DE3.66/638. Die Speicherumstellung prüft das genaue Paar, die Geometrie und den Fingerabdruck der Speicher-Engine. Bei einem bereits passenden PFS1-Gerät genügt das Anwendungsupdate. Der Browser prüft den SHA-256 der vollständigen Anwendung anhand der Init-Daten ihrer DAT-Datei. [DE3.65-Anwendungsquellen](https://github.com/bluecyber81/pixl.js/archive/3a5ea8a3662a942cb4ed9ea56a9a68939c07b5a9.zip).

## Bauen, testen und veröffentlichen

Node/npm gemäß [Mitarbeit und Werkzeuge](https://github.com/bluecyber81/pixl.js/blob/main/CONTRIBUTING.md) verwenden:

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
Das [Web-Quellpaket 3.42.1](https://github.com/bluecyber81/pixl.js/releases/download/web3.42.1/Allmiibo_Dateimanager_3_42_1_Quellcode.zip)
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

Die Web-Tests verwenden simuliertes Bluetooth und reale lokale WASM-Kerne. Für die stabile App DE3.65 sind Bluetooth-Auslesung, NFC, Scrollbalken und Aufwachen am LCD bestätigt. Mit DE3.66 und Web 3.40.0 wurden das Displayfoto sowie die Fortsetzung einer Sicherung mit zwei Dateien über Windows-Bluetooth bestätigt. [Geräteprüfung und Testumfang](https://github.com/bluecyber81/pixl.js/blob/main/docs/validation/DE3_66_LCD_READBACK.md). [Gerätebefund DE3.65](https://github.com/bluecyber81/pixl.js/blob/web3.39.5/docs/validation/DE3_65_LCD_READBACK.json) · [Prüfnachweise DE3.66](https://github.com/bluecyber81/pixl.js/blob/de3.66/docs/validation/DE3_66.json)

Gerät & Diagnose: DE3.59 meldet den unberührten Stack ab Anwendungseinstieg. Bei älteren Versionen ist das Feld unbekannt. Unter Startzeiten lassen sich 3 bis 20 gespeicherte Berichte unterschiedlicher Neustarts derselben Firmware bei gleicher Sammlung vergleichen (Median und Minimum–Maximum). Mehrfache Abrufe desselben Starts zählen nicht mehrfach.
