# LCD DE3.96 / App669 · TEST1

Stand: 21. November 2026. Dieser signierte Testbuild basiert auf App668 und ist für das LCD-Gerät mit ST7567, Z21 und S112 7.3.0 bestimmt. Die bisherigen Speicher-, Menü- und Verwerfen-Korrekturen bleiben enthalten. Die Hardwareabnahme von App669 steht aus.

## Zweck und neue Funktionen

Der Teststand soll klären, welche Änderungen im anschließenden normalen Build einen messbaren Nutzen bringen:

1. **Bluetooth vergleichen.** Die zusätzliche Verlängerung eines Verbindungsereignisses lässt sich ausdrücklich ein- und ausschalten. Nach einem neuen Stack-/Gerätestart ist sie AUS. Eine erfolgreiche Einstellung bleibt über Trennen, Neuverbinden und Moduswechsel erhalten, bis sie ausgeschaltet oder der Stack neu gestartet wird. Eine gewöhnliche Diagnose verändert diese Einstellung nicht. Ein erfolgreicher SDK-Aufruf beweist weder zusätzliche tatsächlich genutzte Funkzeit noch höheren Dateidurchsatz.
2. **Speicherfreigabe erklären.** Eine reine RAM-Abfrage zeigt den Zustand der Speicherbereinigung, offene Leser/Verzeichnissichten, zurückgehaltene alte Gruppen und das Ergebnis des letzten abgeschlossenen Bereinigungsversuchs. Die Abfrage liest oder beschreibt selbst keinen Flash und stößt keine Bereinigung an. Gezählt werden haltende Handles, keine exakt freigebbaren Bytes.
3. **Startzeit aufteilen.** Die letzte tatsächliche PackedFS-Einbindung erhält zusätzliche RTC-Messwerte für Flash-Warten, Lesevorgänge, CRC und die abschließende Indexrunde. Indexzeit enthält die dort anfallende Lese-/CRC-Zeit; die Werte dürfen nicht zu einer Gesamtdauer addiert werden. Die Messung schließt Konfiguration, Bootloader und physische Displaylatenz aus und hat selbst einen Zeitaufwand.

Die begleitende Webversion **3.59.0-test.1** ergänzt zeitlich zugeordnete Bluetooth-Beobachtungen zum vorhandenen Backup-Profil und einen manuell gestarteten 512-Byte-Prüflauf. Die Testseite wird separat unter [`test/app669/`](https://bluecyber81.github.io/pixl.js/test/app669/) bereitgestellt. Die normale Hauptseite bleibt beim bisherigen Stand.

## Signiertes Paket und Identität

| Merkmal | Wert |
|---|---|
| Paket | `Allmiibo_LCD_DE3_96_669_TEST1_NUR_APP.zip` |
| Firmware / Counter | `2.22.0-DE3.96` / `669` |
| ZIP | 363913 Bytes |
| Anwendung | 363312 Bytes |
| SourceID | `dea06409b9ff20a12f446a7baed683b6442573ed427c5dc87cd4bed2885df858` |
| BIN SHA-256 | `32d3a83b0692ea06b65af48c236bcffa4eb3469c0e98e9bb6840965cc1dabb80` |
| ZIP SHA-256 | `021d1a35b00b6cb344702c48df609060e51b55bcecaa9781071d1bcd87829b1f` |
| Engine SHA-256 | `3574b8ea61e7c1563a77eb806eb2ae1fbe3f2d94196d3a2d72e89ca3a6b3b21d` |
| Produktionscommit | [`feb6c58ad14998f31aef07dc84d8dc0732e32ede`](https://github.com/bluecyber81/pixl.js/commit/feb6c58ad14998f31aef07dc84d8dc0732e32ede) |

Das Paket enthält ausschließlich die Anwendung. Es ersetzt weder Bootloader noch SoftDevice und führt keine Formatierung oder PFS1-Migration aus. Der Counter liegt oberhalb von App668; ein späterer normaler Build benötigt wieder einen passenden höheren Counter.

## Durchgeführte Prüfungen

Die vollständigen Ergebnisse und Quellbindungen stehen in [DE3_96_TEST1.json](DE3_96_TEST1.json) und dessen verknüpften Nachweisen.

| Prüfung | Ergebnis |
|---|---|
| Vollständiger Firmwarelauf | 182 von 182 Testsuiten bestanden; Produktionsinputs unverändert |
| Zwei isolierte Builds | BIN, HEX und Produktionsinputmanifest bytegleich |
| Fertig verlinkte ARM-Anwendung | 12 von 12 Checkern bestanden |
| Neuer BLE-Testpfad | 14 Hostfälle, 5 erkannte Negativkontrollen, ASan/UBSan; zusätzlich 10 Fälle am fertigen ARM-Build |
| Speicher-/Zeitmessung | Drei echte C-Suiten nativ und mit ASan/UBSan; bestehende Mount- und SPI-Prüfungen bestanden |
| PFS-Kompatibilität | Sechs frische Fälle App668 ↔ App669 mit 1208 synthetischen Einträgen; vier ARM-Layoutfälle bestanden |
| Kapazitäts-WASM | Exakter neuer Enginebezug, identischer Wiederholungsbuild und reproduzierbares Quellenarchiv |
| Signiertes ZIP | Signatur, App-only-Struktur und drei Negativkontrollen bestanden |
| Tatsächlicher Z21-ARM-Code | Sieben Signatur-/Hash-/CRC-Fälle und zwei Signed-Init-/Bankfälle bestanden |
| Ressourcen | 9412 Bytes Flashreserve, 1688 Bytes Heap/Stack-Abstand, 8192 Bytes reservierter Stack; unveränderte Mindestgrenzen eingehalten |

Die ARM-Prüfungen führen den verlinkten Anwendungscode beziehungsweise Z21-Code in einer simulierten Umgebung aus. Sie ersetzen keinen physischen Funk-, Flash- oder Gerätetest. Der Kapazitätssimulator lässt die LCD-Testinstrumentierung weg; seine Heapzahlen sind keine Messung des Geräte-RAMs.

## Gerätetest am Handy

### 1. Installieren und Ausgangszustand erfassen

Den privaten LCD-Testknopf auf der [separaten DFU-Seite](https://bluecyber81.github.io/pixl.js/test/app669/dfu/web.html?v=3.59.0-test.1&package=de3.96-lcd-app-test1) verwenden. Er lädt und prüft genau das oben gebundene Paket; die Bluetooth-Übertragung wird danach separat gestartet. Nach dem Update neu starten, die Testseite verbinden und eine vollständige Diagnose exportieren. Erwartet werden App669, die genannte SourceID und eine ausgeschaltete Ereignisverlängerung.

### 2. Speichern und Freigeben

Im Testfeld **„Teststatus lesen“**, danach **„512-Byte-Prüflauf starten“** wählen. Der Lauf erzeugt einen eigenen neuen Zufallsordner, schreibt eine synthetische Textdatei, liest/vergleicht sie und entfernt den geprüften Inhalt. Er fragt freien Speicher vorher, nach Schreiben und nach Entfernen frisch ab. Währenddessen ausschließlich diese Dateimanager-Verbindung verwenden.

Die Firmware löscht Ordner rekursiv. Die Webprüfung bestätigt deshalb unmittelbar zuvor, dass der eigene Testordner leer ist; Leerprüfung und Löschen sind jedoch nicht atomar gegen einen zweiten gleichzeitigen Schreiber. Es besteht keine Zusicherung für konkurrierende Änderungen durch eine weitere Instanz. Bei Fehler oder Verbindungswechsel erfolgt keine automatische Fehlerbereinigung; ein eigener kleiner Testordner kann für die Prüfung stehen bleiben. Datei-/Ordnerentfernung und Wiedererreichen des ursprünglichen Freiplatzes werden getrennt ausgewiesen. Ein 512-Byte-Lauf ist kein aussagekräftiger Geschwindigkeitstest.

### 3. Bluetooth A/B/A vergleichen

Für denselben unveränderten Ordner jeweils ein **neues vollständiges Backup** erstellen:

1. Baseline: Verlängerung **AUS**.
2. Test: Verlängerung **EIN**, erfolgreichen Status ablesen.
3. Noch einmal Verlängerung **AUS**.

Für diesen Vergleich keine Wiederaufnahme oder frühere ZIP zur Datenwiederverwendung einsetzen. Handy, Abstand und Dateiauswahl gleich halten. Jeweils den vollständigen Abschluss und den Diagnosebericht mit Übertragungsprofil sichern. Relevant sind Gesamtdauer, tatsächlich gelesene Bytes, Verzeichnis-/Hash-/ZIP-Anteile, beobachtete Verbindungsparameter und Fehler. Ein einzelner schnellerer Lauf genügt nicht für eine belastbare Verbesserungsaussage.

Zusätzlich einmal trennen/neu verbinden und den beibehaltenen Zustand lesen. Nach Gerätestart muss wieder AUS gemeldet werden. Bei einer abgelehnten Funkoption bleibt der zuvor bestätigte Zustand maßgeblich.

### 4. Alltag und Menü

Einstellungen öffnen, eine harmlose Änderung speichern und anschließend kontrolliert eine Änderung verwerfen. Rückkehr ins Menü und Verhalten nach Neustart prüfen. Einen absichtlichen Flash-/Stromfehler erzeugen wir dafür nicht; fehlgeschlagene Speicherpfade sind bereits durch die automatisierten Fehlerfälle abgedeckt. Nach normaler Nutzung nochmals Diagnose exportieren und etwaige tatsächliche Fehler beschreiben.

## Entscheidung für den normalen Build

Nach den Geräteberichten werden bestätigte Verbesserungen ausgewählt. Die zusätzliche Funkoption wird nur mit nachvollziehbarer Stabilität und Nutzen zur normalen Voreinstellung. Teststeuerung und unnötige Instrumentierung werden anschließend entfernt oder deaktiviert; der normale Build bekommt einen höheren Counter und erneut die erforderlichen Build-/Paketprüfungen.

Allgemeines Transfer-Streaming, gebündelte Mehrdatei-Anfragen und ein SoftDevice-Wechsel sind in diesem ersten Messbuild nicht enthalten. Die neuen Profile sollen zunächst belegen, welcher dieser weiteren Eingriffe den verbleibenden Engpass tatsächlich adressiert. Auch ein schnellerer Start oder eine generell sofortige vollständige Speicherfreigabe wird vor den Messungen nicht versprochen.
