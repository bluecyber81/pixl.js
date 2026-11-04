# Allmiibo-Dateimanager im Browser

**[Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/)** ·
[Firmware übertragen](https://bluecyber81.github.io/pixl.js/dfu/web.html) ·
[Downloadpakete und Quellen](https://github.com/bluecyber81/pixl.js/releases/tag/de3.59)

## Verbinden

1. Die Webseite in Chrome auf Android oder einem unterstützten Computer öffnen.
2. Am eigenen Allmiibo „Bluetooth-Dateiübertragung“ öffnen. Andere Verbindungen
   zu nRF, AmiLoop oder einem weiteren Dateimanager vorher trennen.
3. „Verbinden“ anklicken und das eigene Gerät im Browser auswählen.

Das Allmiibo muss sich beim verwendeten Handy oder Computer befinden. Die
Webseite verbindet sich über dessen Bluetooth; sie macht kein entferntes
Allmiibo über das Internet erreichbar. Der Laptop zu Hause kann ausgeschaltet
bleiben. Die Vorschau und der Figurenkatalog lassen sich ohne Gerät ansehen.

## Funktionen und Daten

Dateien und Ordner, Bilder und Figureninfos, Suche, ZIP-Sicherung und Import,
Diagnose, Fernbedienung sowie die DFU-Seite bleiben erhalten. Einzelne
Gerätefunktionen setzen eine passende Firmware und deren gemeldete Fähigkeiten
voraus. Der Dateimanager zeigt fehlende oder unbestätigte Werte entsprechend an.

Sicherungen und Figurendateien werden lokal im Browser verarbeitet und direkt
zwischen dem gewählten Gerät und dem verwendeten Handy/Computer übertragen.
Die Webseite lädt sie nicht zu GitHub hoch. Browser-Zwischenspeicher ist keine
dauerhafte Sicherung; benötigte ZIP-Dateien ausdrücklich herunterladen.
Die GitHub-Webadresse hat ihren eigenen Browser-Speicher. Eine unter localhost
begonnene Wiederherstellung wird daher nicht automatisch im Online-Tab fortgesetzt.
Eine laufende Übertragung zuerst abschließen; anschließend bei Bedarf dieselbe
gespeicherte Sicherungs-ZIP auf der Online-Seite erneut auswählen.

GitHub erhält die üblichen Abrufe der Webseite. Figurenbilder werden anhand
öffentlicher Figuren-IDs geladen. Persönliche UID, lokale Dateinamen und
Figurendateiinhalte sind dafür nicht erforderlich.

## Firmware-Update mit 3.37.0

Im Dateimanager unter **Gerät & Diagnose → Alle Diagnosewerte auslesen** die Bootinformationen einlesen, wenn du sie beim Update zum Vergleich verwenden möchtest. Anschließend die Dateiverbindung trennen. Auf der DFU-Seite das Paket auswählen. Schritt 1 zeigt den Anwendungszähler, das Hardwarefeld und die erlaubten SoftDevice-FWIDs aus den Init-Daten der ZIP-Datei. Wenn eine höchstens zehn Minuten alte Bootdiagnose verfügbar ist, kommen die Vergleichswerte und eventuelle Hinweise hinzu. Vor dem Übertragen das gewünschte Gerät in den DFU-Modus versetzen und im Browser auswählen.

Die innere Datei `Allmiibo_LCD_DE3_59_631_TESTSTAND.zip` enthält die LCD-Anwendung. Bestehende passende PFS1-Geräte benötigen dafür keine Formatierung. Für alte SPIFFS-Geräte gilt die eigene Migrationsanleitung. [Anwendung und Paketgrenzen](INSTALLATION.md) · [Migration](MIGRATION_PFS1.md) · [Quellcode und Build](BUILD_DE3_59.md).


## Startzeiten vergleichen

**Gerät & Diagnose → Startzeiten lesen → Früheren Startbericht vergleichen** öffnet die lokale Dateiauswahl für einen früheren Startbericht oder eine Gesamtdiagnose. Die Unterschiede beziehen sich auf die sechs Zeitmarken seit Beginn der Speicherinitialisierung. Ein negativer Wert in Millisekunden bedeutet eine kürzere Zeit. Bootloader und frühe SDK-Initialisierung liegen davor. Verwende Berichte derselben Sammlung und desselben Geräts.

Gerät & Diagnose: DE3.59 meldet den unberührten Stack ab Anwendungseinstieg. Bei älteren Versionen ist das Feld unbekannt. Unter Startzeiten lassen sich 3 bis 20 gespeicherte Berichte unterschiedlicher Neustarts derselben Firmware bei gleicher Sammlung vergleichen (Median und Minimum–Maximum). Mehrfache Abrufe desselben Starts zählen nicht mehrfach.
