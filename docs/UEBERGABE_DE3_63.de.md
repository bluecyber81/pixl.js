# Übergabe: DE3.63 / App635 und Dateimanager 3.39.2

Stand: 6. November 2026. Ausgangspunkt ist DE3.62 / App634 mit Dateimanager 3.39.1. Die Änderungen betreffen die Anzeige von Notizen und Kataloghinweisen. Der installierte Bootloader, Nordic S112, Packed LittleFS und bestehende Nutzdaten werden vom neuen Anwendungsupdate nicht ersetzt.

## Änderungen und Bedienung

**Amiibo-Datenbank → Figur öffnen → kurz Mitte → Notiz / Hinweise** öffnet zwei getrennte Seiten. Das Menü ist auch in der Slotansicht der Datenbank vorhanden; es ist kein neuer Menüpunkt des normalen dateibasierten Amiibo-Emulators.

- Kurz links/rechts wechselt zwischen persönlicher Notiz und Spielhinweis.
- Links/rechts halten scrollt längere Texte in ganzen Textzeilen.
- Mitte führt ins vorherige Menü zurück.

Die Informationsseiten lösen keinen Figuren-/Slotwechsel aus und verändern keine Notiz, Schutzflags, Spielfortschritte oder Tagdaten. Im normalen Figurenbild bleibt die bisherige Notizpriorität erhalten. Notizen werden nicht automatisch mit Katalogtext gefüllt. Eine leere Notiz ist ein gültiger Zustand.

Der Spielhinweis gehört zur gewählten Datenbankzuordnung. Ohne passende Spielauswahl oder hinterlegten Text erscheint ein Leerhinweis, keine Behauptung fehlender Spielunterstützung. Acht vorhandene redaktionelle deutsche Texte decken 13 Zuordnungen ab. Die Firmware erkennt ausschließlich die exakten englischen Quelltexte und fällt sonst auf Englisch zurück. Die Zuordnungen und ihre Quellen sind weiterhin im Dateimanager einsehbar.

**Dateimanager → Figurenkatalog → Details und Bild**, ebenso die Dateivorschau, zeigt neben „Kataloghinweise“ den eingebundenen Datenstand. Der Wert stammt aus den Daten und ist keine fest eingetragene Anzeigeversion. Deutsche und englische Beschriftung sowie englischer Fallback für andere Sprachen sind vorgesehen; der Text darf auf schmalen Anzeigen umbrechen.

## Erhaltene Komponenten

Das Updatepaket `Allmiibo_LCD_DE3_63_635_TESTSTAND.zip` enthält ausschließlich die Anwendung. Für ein bereits passendes nRF52832-LCD-Gerät mit PFS1 sind weder Formatierung noch erneute Speicherumstellung erforderlich. Ältere SPIFFS-Geräte, Upstream-LittleFS und andere Boards benötigen ihre geprüften eigenen Wege.

Für Z17 zusammen mit DE3.62 liegt jetzt ein Diagnoseexport mit positiver Nutzerrückmeldung vom 6. November 2026 vor. Der Bootzähler 17 und der vollständige Regionshash passen zu Z17; dies ist ein Installations-/Betriebshinweis, keine Prüfung jedes DFU-, Reset- oder Stromausfallpfads. Die neue Anwendung DE3.63 ist damit noch nicht am Gerät geprüft. Für diese Anzeigeänderung ist kein erneutes Bootloader-Update erforderlich. S112 7.3.0 bleibt Nordics unveränderte Binärkomponente.

Die vorhandenen Start-/Speicherdiagnosen, QR-Ansichten, Sammlungstools und die Display-Wachhaltehilfe des Dateimanagers bleiben enthalten. Es wird kein schnellerer Start behauptet.

## Nachweise und Nachbau

- [Buildanleitung](BUILD_DE3_63.md): gepinnte Werkzeuge, isolierter Docker-/Linux-Build, Firmwaretests und Prüfung des signierten App-Pakets.
- [Release-Manifest](../RELEASE_INFO.json): aktuelle Versions-, Paket- und Quellidentität sowie Verweise auf die tatsächlichen Prüfresultate.
- [App-Prüfmanifest](validation/DE3_63.json) und [Web-Prüfmanifest](validation/WEB3_39_2.json): konkrete neue Ergebnisse und deren Grenzen.
- [Bisheriges Speicherprofil](diagnostics/DE3_62_STORAGE.md): historischer Cache-/Mountvergleich. Er wird nicht als neue Messung ausgegeben.
- [Z17-Quellen](../bootloader-z17/): unveränderter separat nachvollziehbarer Bootloaderstand.

Die jeweiligen `BUILD_RESULT.json` und Linker-Maps müssen zum ausgelieferten BIN gehören. Mindestgrenzen bleiben 8.192 Byte Flashreserve, 1.536 Byte Heap-/Stackabstand und 8.192 Byte reservierter Stack. Frühere Zahlen sind keine Ersatzwerte für den neuen Build.

## Noch am Gerät prüfen

Nach dem App-Update unter „Gerät & Diagnose“ den tatsächlichen Stand auslesen und den Export dem Paket zuordnen. Erwartet wird DE3.63 / App635; Bootloader und SoftDevice sollen dem vorher ausgelesenen Gerätestand entsprechen.

Am Gerät die neue Notiz-/Hinweisseite mit kurzem und gehaltenem Links/Rechts und dem Rückweg testen. Danach normalen Figuren-/Slotwechsel, eine bekannte Figur an der Konsole, kurzen Mitteldruck und Schlaf/Aufwachen prüfen. Der Datei-Lese-/Schreibtest gehört in einen eigenen anschließend entfernten Testordner. Startzeiten nur aus mehreren vergleichbaren Neustarts desselben Geräts beurteilen.

Ein längerer echter Android-/Bluetooth-Lauf mit der Wachhaltehilfe ist weiterhin offen. Manuelles Sperren, Hintergrundzustand oder Energiepolitik können die Verbindung trotz dieser Hilfe unterbrechen. Der zuvor dokumentierte Entwurf für Startkennung und echtes Probenalter ist keine bereits implementierte Diagnosefunktion.
