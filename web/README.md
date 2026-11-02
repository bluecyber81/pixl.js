# Dateimanager 3.33.0

Startanleitung und Änderungen: **LIESMICH_3_33_0.txt**.

3.33.0 ergänzt im Figurenkatalog eine Online-Neuheitenprüfung, den seriellen
Sammlungsabgleich (Inhalte oder Schnellübersicht) und den geprüften Import
eigener BIN-Dateien oder direkter HTTPS-Links. Vorhandene Dateien werden
nicht überschrieben. Die Firmware DE3.55 bleibt unverändert.


Katalog-Markierungen nach der Sammlungsprüfung: Grün = passende ID gefunden,
Orange = vorhandene Datei mit Abweichung oder eingeschränkter Formatprüfung,
Rot = nach vollständiger Inhaltsprüfung auf E: nicht nachgewiesen. Ungeprüfte
oder inzwischen veraltete Ergebnisse bleiben neutral. Eine Schnellübersicht
kennzeichnet gefundene IDs ausdrücklich als reine Dateieigenschaften.

Die Online-Abfrage liefert Metadaten, keine spielfertigen Figurendateien.
Strukturprüfung ist keine kryptografische Prüfung oder NFC-Funktionsgarantie.

3.32.5 ergänzte einen getrennten GitHub-Pages-Build für
https://bluecyber81.github.io/pixl.js/ und erhält den lokalen Portable-Build.
Firmware-ZIP, sieben Speicherprüfprofile und WASM-Dateien bleiben unverändert.
Bluetooth funktioniert weiterhin direkt zwischen Browser und Gerät; diese
Webseite ist keine Funkbrücke zum heimischen Laptop. Sammlungen, Sicherungen
und Diagnosen werden in diesem Ablauf nicht auf GitHub hochgeladen.

Der Quellbuild ist `npm ci`, `npm test`, `npm run build` (lokal, dist) sowie
`npm run build:pages` (Projektadresse /pixl.js/, dist-pages). Beide Builds führen
anschließend ihre eigenen Produktionsprüfungen aus. Nur den Inhalt von
dist-pages veröffentlichen, weder Quellverzeichnis noch lokale Serverzustände.
GitHub Pages benötigt den Inhalt direkt im Veröffentlichungswurzelverzeichnis.
Eine andere Projektadresse benötigt einen eigenen Basis-Build und passende Tests.
Beide Builds enthalten dieselben Lizenztexte unter „Quellen & Lizenzen“; der
Build kopiert dafür ausschließlich vorhandene Lizenz- und Quellenhinweise.

Figurenlinks ohne Serverweiterleitung funktionieren als
`/?amiibo=01010000000e0002` oder `/#/a/01010000-000e0002` lokal und entsprechend
`/pixl.js/?amiibo=01010000000e0002` bzw. `/pixl.js/#/a/01010000-000e0002` online.
Es sind reine Informationslinks zu amiibo.life, keine Gerätebefehle. Die alte
lokale Route /a/<8Hex>-<8Hex> bleibt erhalten; auf Pages sind die neuen Links zu
verwenden. Für den Gerätezugriff braucht der Browser Web Bluetooth und HTTPS
oder localhost. Die normale Bluetooth-Paarung ist dafür nicht erforderlich.

Das mitgelieferte Anwendungsupdate DE3.55/627 ist für unser LCD/PFS1-Gerät mit
BL8/S112 7.3.0 bestimmt. Kein universelles Paket für alle Allmiibo-Varianten.
Der genaue Firmwarequellstand ist bei der Paketauswahl und auf der DFU-Seite
als separater Download verlinkt. Eine neue Seite erteilt noch keine Bluetooth-
Freigabe: Geräteauswahl und Übertragungsstart erfolgen ausdrücklich im Browser.

Beibehalten aus 3.32.4:

3.32.4 ergänzt das getrennt gebundene Speicherprüfprofil für DE3.55/627.
Der zugehörige WASM-Simulator verwendet exakt den neuen Firmwarekern mit
optimierter CRC-Berechnung und LittleFS-Verschleißkorrektur. Das PFS1-Datenformat und die
Speicheraufteilung bleiben gleich. Ein bereits auf Packed LittleFS laufendes
Gerät benötigt für dieses Anwendungsupdate keine Formatierung oder erneute
Wiederherstellung. Vorhandene Amiibo-Dateien bleiben auf dem Gerät.

Unter „Speicherumstellung“ ist DE3.55/627 das neue Standardprüfprofil.
DE3.51–DE3.54 bleibt separat auswählbar. Alle sechs früheren WASM-Dateien
und ihre Quellbäume bleiben bytegleich erhalten; das neue Profil ist ein
siebtes Artefakt. Die Auswahl ist keine Aussage über die installierte Version.
Version, Anwendungszähler und Engine-Identität müssen weiterhin zusammenpassen.

Die folgenden Bibliotheks- und Bedienungsverbesserungen bleiben erhalten:

3.32.3 aktualisiert kompatible Bibliotheks-Patches: Babel-Helfer/-Parser/-Typen,
tinycolor, PostCSS, Rolldown einschließlich seiner Plattformbindungen und
vue-component-type-helpers. Rolldown benötigt dazu seine exakt passende
Build-Typenbibliothek @oxc-project/types 0.156.0. Vue, Element Plus, Vite und
die Bluetooth-/DFU-Protokolle wechseln nicht auf eine andere Versionsreihe.
Diese Build-/Bibliothekskorrekturen sind keine gemessene Funkbeschleunigung.

Die bisherige nanoid-Lockangabe 3.3.22/URL wurde auf die aktuell offiziell
verfügbare 3.3.20 berichtigt. Alle 26 installierten Dateien und das Tarball-SRI
sind bytegleich zum vorher verwendeten Artefakt; dieses deklarierte bereits
3.3.20. Kein nanoid-Code-Downgrade. Die frühere 3.3.22-Metadatenadresse liefert
aktuell HTTP404; eine Aussage zur gesamten Veröffentlichungshistorie folgt
daraus nicht. Eine neue Regression prüft installierte Versionen und Lizenzen
gegen den Lock ohne Ausnahme für widersprüchliche Versionsangaben.

Beibehalten aus 3.32.2 ist unter „Auf dem Gerät suchen“ die freiwillige Inhaltssuche:
„Figuren auch ohne gespeicherte ID finden“. Ohne Haken bleibt die Suche
bei Ordnern und Metadaten. Mit Haken liest sie nacheinander höchstens 128
unterstützte BIN-Dateien (maximal 256 KiB), falls deren Metadaten-ID fehlt und
Dateiname/Notiz den Suchtext noch nicht erfüllen. Sie ordnet die ID aus
Bytes 84–91 dem lokalen Katalog zu. Keine Geräteänderung, keine Inhaltsablage,
keine Internetabfrage; keine NFC-Funktions- oder Signaturprüfung. Grenzen und
Teilergebnisse werden angezeigt, und die Suche kann abgebrochen werden.

Ein Upload-Abbruch wird jetzt auch zwischen den Vorprüfungen beachtet:
Nach einem abgebrochenen Ordnerlesen erscheint kein späterer Überschreiben-
Dialog. Ein bereits begonnener Commit wird weiterhin sicher abgeschlossen.

Beibehalten: 3.32.1 schließt die Auswahlvorschau beim Wechsel zur Laufwerksübersicht und
beim Löschen ihrer Datei. Vorschau-Aktionen prüfen den aktuellen Ordner und
die konkrete Zeile; verspätete Klicks auf inzwischen geschlossene Auswahlen
werden verworfen. Andere ausgewählte Dateien bleiben verfügbar.

3.32.0 ergänzt eine Suche auf dem Gerät, eine direkte Auswahlvorschau und
eine übersichtlichere Oberfläche. Das Bild einer ausgewählten Figur erscheint
direkt. Fehlt ihre ID in den Metadaten, wird nur die ausgewählte unterstützte
Datei gelesen. Ohne die neue ausdrückliche Inhaltssuche werden weiterhin
ausschließlich Ordner und Metadaten gelesen.

Die lokale Firmwareliste enthält das Anwendungs-ZIP DE3.55/627.
Paketidentität und Übertragungsbeginn bleiben getrennt: Erst die ausdrückliche
Geräteauswahl auf der DFU-Seite startet den Transfer. Das ZIP enthält weder
Bootloader/SoftDevice noch eine Amiibo-Sammlung oder Speicherumstellung.

Das bisherige LittleFS-Profil unterstützt weiterhin die exakten Paare
DE3.51/623, DE3.52/624, DE3.53/625 und DE3.54/626. Das neue Profil gehört
ausschließlich zum Paar DE3.55/627 und dessen eigener Engine-Identität.

Mit DE3.51 übernimmt der Dateimanager eine bestehende Fernbedienungsverbindung
für die Dateiübertragung. Vollständige Raw128-Wiederherstellungen veröffentlichen
Dateiinhalt und Metadaten gemeinsam; der abschließende Vergleich bleibt erhalten.
Die alte Firmware und alle früheren Speicherprüfprofile bleiben unterstützt.

Die Tests verwenden gemocktes Bluetooth und echte lokale WASM-Simulatoren.
Sie ersetzen keine Funk-, NFC- oder Leistungsmessung am Allmiibo.

Entwicklung: `npm test`, `npm run build` (mit Produktions-Worker-Tests).
Der isolierte native Test `scripts/check-pfs-compatibility.py --output <neuer Ordner>`
benötigt GCC und prüft einen synthetischen Datenträger mit beiden Kernversionen:
alt erstellen, neu lesen/ändern, alt lesen/ändern, neu wieder lesen. Er gleicht
Dateiinhalt, Pfade, Raw128-Metadaten und Importidentität vollständig ab.
`scripts/build-capacity-simulator.py --profile current` reproduziert den
neuen WASM mit clang 23.1.4; `--profile de354` reproduziert den vorherigen.
Lizenzangaben in third-party/npm/SOURCES.json sind an die aktuell installierten
Versionen gebunden. Ältere, nicht mehr dort referenzierte Lizenzkopien bleiben
als historische Hinweise erhalten; sie werden nicht als installierte Version
ausgewiesen. Die offizielle Registry, der aktualisierte Lock und npm-ci werden
im separaten Prüfbericht gebunden. Keine persönlichen Amiibo-Dateien enthalten.
