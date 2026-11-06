# Allmiibo-Dateimanager im Browser

**[Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/)** ·
[Firmware übertragen](https://bluecyber81.github.io/pixl.js/dfu/web.html) ·
[Bisher veröffentlichte Version 3.38.1](https://github.com/bluecyber81/pixl.js/releases/tag/web3.38.1)

Wenn Bluetooth beim Hochladen einer Figur abbricht, zeigt der Dateimanager den betroffenen Speicherort und die ursprüngliche Sitzung an. Steht der Abschluss noch aus, verbinde dasselbe Gerät erneut und prüfe den Zielordner, bevor du den Upload wiederholst. Halte den Browsertab dafür geöffnet.

## Verbinden

1. Die Webseite in Chrome auf Android oder einem unterstützten Computer öffnen.
2. Am eigenen Allmiibo „Bluetooth-Dateiübertragung“ öffnen. Andere Verbindungen
   zu nRF, AmiLoop oder einem weiteren Dateimanager vorher trennen.
3. „Verbinden“ anklicken und das eigene Gerät im Browser auswählen.

Das Allmiibo muss sich beim verwendeten Handy oder Computer befinden. Die
Webseite verbindet sich über dessen Bluetooth; sie macht kein entferntes
Allmiibo über das Internet erreichbar. Der Laptop zu Hause kann ausgeschaltet
bleiben. Die Vorschau und der Figurenkatalog lassen sich ohne Gerät ansehen.

## Neu im lokal vorbereiteten Dateimanager 3.39.0

**Figurenkatalog → Details und Bild** und die **Dateivorschau** zeigen Katalogzuordnungen und vorhandene Nutzungshinweise. Der Quellenstand umfasst 952 Figuren und 1.344 Zuordnungen. Acht deutsche Teilübersetzungen werden bei 13 Zuordnungen verwendet; weitere Texte bleiben als englischer Quelltext gekennzeichnet. Übersetzte Hinweise bieten den englischen Originaltext zum Aufklappen. Das ist keine Bestätigung von Spielkompatibilität oder Belohnungen.

**Figurensammlung → Prüfung: Dateiinhalte prüfen (empfohlen) → Sammlung prüfen → Anzeigen → Gleiche Figuren-ID / Dateiinhalte** zeigt getrennte SHA-256-Gruppen innerhalb einer Figuren-ID. Der Vergleich nutzt bereits gelesene Bytes, ohne weitere BLE-Dateilesen. Gleiche ID allein genügt nicht: UID, Spielstand und Varianten können abweichen. Die Schnellprüfung sagt ausdrücklich, dass Inhalte ungeprüft sind. Es wird nichts automatisch gelöscht. Nach Schreibvorgängen den veralteten Bericht erneut prüfen.

**Gerät & Diagnose → Karten-Slot lokal prüfen** öffnen. Aus derselben eigenen Sicherung zuerst `chameleon/slots/config.bin` im Format v8 laden, dann den Slot auswählen und die dazu angezeigte `NN.bin` laden; Slot 1 verwendet `00.bin`. Unterstützt sind MF0ICU1, MF0ICU2, MF0UL11 und MF0UL21 mit passender Länge und passendem Layout. Nur beim bekannten alten UID-Kopiermuster und gültigen BCC0/BCC1 erscheint **Korrigierte Kopie herunterladen**. Die neue `NN.uid-corrected.bin` wird lokal nachgeprüft, ändert höchstens vier UID-Bytes und erhält alle übrigen Bytes. Die Quelle bleibt unverändert; kein Schreiben auf das Gerät. Dateiherkunft, Karteninhalt, Authentifizierung und Lesegerätfunktion sind damit nicht bestätigt.

**Sicherung → ZIP importieren → Sicherungs-ZIP auswählen → Vergleichen:** Exakte inaktive Stamm-Journaldateien `.pixl_txn_old` und `.pixl_txn_new` bleiben in der Schema-1-Sicherung erhalten, werden aber als gesperrt angezeigt. Andere sichere Dateien bleiben auswählbar. Aktive oder unbekannte Stamm-Transaktionseinträge, darunter `.pixl_txn_pending` oder ein Ordner mit Journalnamen, sperren den gesamten Import. Quelle und Zielumleitung werden kontrolliert, der Zielzustand vor Schreiben erneut gelesen. Normale Unterordner mit gleichnamigen Dateien werden nicht pauschal ausgeschlossen. Schema 2 bleibt beim Migrationsassistenten. Keine automatische Journalbereinigung.

Für diese Funktionen ist kein neues Flashpaket erforderlich: App DE3.62/634, Z17 und S112 7.3.0 bleiben unverändert. Ein echter Gerätetest und die neue eigene Sammlungssicherung sind noch nicht erledigt. Die Online-Seite hat ihren separaten Veröffentlichungsstand; die angezeigte Browserversion prüfen. [Releasehinweise](RELEASE_WEB3_39_0.de.md).

## Funktionen und Daten

* **Figurensammlung → Sammlung prüfen.** Beim Suchen der Ordner siehst du die verstrichene Zeit und die bisher gefundenen BIN-Dateien. Die Inhaltsprüfung zeigt anschließend „gelesen / gesamt“ und schätzt die Restzeit aus abgeschlossenen Dateilesevorgängen.
* **Sicherung & Wiederherstellung → Ordner sichern (ZIP).** Du kannst das erkannte Laufwerk hier direkt öffnen. Für eine Sicherung des gesamten Laufwerks muss bei „Geöffneter Ordner“ sein Hauptverzeichnis stehen, etwa **E:/**. Nach der Ordnersuche erscheint die geschätzte Restzeit für das Lesen. Bei einer fortgesetzten Sicherung zählen bereits zwischengespeicherte Dateien nicht zur gemessenen Lesegeschwindigkeit. Der anschließende Ordnervergleich hat seinen eigenen Fortschritt. Danach erstellt der Browser die ZIP.
* **Orange im Figurenkatalog.** Zu dieser ID gibt es einen Eintrag mit einem Prüfhinweis. Ein Beispiel ist eine abweichende ID in Dateieigenschaften und Inhalt. Auf der Karte steht der konkrete Grund. Die Farbe allein sagt nichts über die Erkennung an einer Konsole aus.

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

## Firmware-Update

Auf dem Handy und am PC zeigt Schritt 2 den Verlauf. Unter **Übertragen** bestätigt der Bootloader die empfangenen Bytes. **Prüfen** vergleicht die Prüfsumme der gesamten Anwendung. **Abschließen** wartet auf die Antwort des Bootloaders. Auch bei 100 % kann diese Antwort noch ausstehen. Nach seiner Bestätigung erscheint **Wiederverbinden**. Prüfe die Version im Gerätemenü, öffne die Bluetooth-Dateiübertragung und wähle auf der DFU-Seite **Dateimanager öffnen → Verbinden**.

Bricht die Verbindung ab, bevor der Bootloader den Abschluss bestätigt, zeigt die Seite den betroffenen Schritt und den letzten bestätigten Byte-Stand. Prüfe zuerst die Version am Gerät. Ein weiterer Updateversuch erfordert eine neue Geräteauswahl.

Im Dateimanager unter **Gerät & Diagnose → Alle Diagnosewerte auslesen** die Bootinformationen einlesen, wenn du sie beim Update zum Vergleich verwenden möchtest. Anschließend die Dateiverbindung trennen. Auf der DFU-Seite das Paket auswählen. Schritt 1 zeigt den Anwendungszähler, das Hardwarefeld und die erlaubten SoftDevice-FWIDs aus den Init-Daten der ZIP-Datei. Wenn eine höchstens zehn Minuten alte Bootdiagnose verfügbar ist, kommen die Vergleichswerte und eventuelle Hinweise hinzu. Vor dem Übertragen das gewünschte Gerät in den DFU-Modus versetzen und im Browser auswählen.

Die innere Datei `Allmiibo_LCD_DE3_62_634_TESTSTAND.zip` enthält die unveränderte LCD-Anwendung. Bestehende passende PFS1-Geräte benötigen dafür keine Formatierung. Für alte SPIFFS-Geräte gilt die eigene Migrationsanleitung. [Anwendung und Paketgrenzen](INSTALLATION.md) · [Migration](MIGRATION_PFS1.md) · [Quellcode und Build](BUILD_DE3_62.md).


## Startzeiten vergleichen

**Gerät & Diagnose → Startzeiten lesen → Früheren Startbericht vergleichen** öffnet die lokale Dateiauswahl für einen früheren Startbericht oder eine Gesamtdiagnose. Die Unterschiede beziehen sich auf die sechs Zeitmarken seit Beginn der Speicherinitialisierung. Ein negativer Wert in Millisekunden bedeutet eine kürzere Zeit. Bootloader und frühe SDK-Initialisierung liegen davor. Verwende Berichte derselben Sammlung und desselben Geräts.

Gerät & Diagnose: DE3.59 meldet den unberührten Stack ab Anwendungseinstieg. Bei älteren Versionen ist das Feld unbekannt. Unter Startzeiten lassen sich 3 bis 20 gespeicherte Berichte unterschiedlicher Neustarts derselben Firmware bei gleicher Sammlung vergleichen (Median und Minimum–Maximum). Mehrfache Abrufe desselben Starts zählen nicht mehrfach.
