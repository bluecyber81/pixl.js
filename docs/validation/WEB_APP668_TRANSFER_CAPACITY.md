# Web-Dateimanager: App668, Übertragung und Kapazitätsprofil

Stand: 21. November 2026. Implementierung und lokale Hauptintegration sind abgeschlossen. Web 3.58.6 enthält das tatsächliche signierte App668-Paket und die endgültigen öffentlichen Firmware-Referenzen. Die lokale Browserprüfung ist vor dem Laden einer Seite an einer Socket-Beschränkung gescheitert; sie wird nicht als bestandener UI-Lauf gezählt.

## Zuordnung

| Bestandteil | Gebundener Stand |
| --- | --- |
| Web-Arbeitszweig | `work/web-app668-mobile`, Ausgangscommit `dfc9b29fd1e132e9106414ac7ede31fa81a1cefe` |
| Web-Version | 3.58.6, finale Referenz-/OTA-/Paketintegration enthalten |
| Ziel-Firmware | LCD, ST7567, `2.22.0-DE3.95`, App668 |
| Lokaler Firmware-Produktionscommit | `2bcb743180e645bdf0d84fa0dc0148a15bd07f00` |
| Firmware-SourceID | `75dafc809b6e2c883062f7c52d6e418bbabb83d404fde562d057bfab5acf7fec` |
| Anwendungs-BIN | 361.992 Byte; SHA-256 `cf1a310059338da51bc4acdcfc2cb4dd97ddbe6fb63491db6ea7d0de41b59bc9` |
| Neue Speicherengine | `a9bdec38eaa41680e1c9fdebd5fd12995e9d38ff070560ff605fd387d471dabd` |

Die Produktionsänderungen dieser Teilaufgabe betreffen den privaten Web-Dateimanager. OLED und die bisherigen Simulatorquellen/-WASM bleiben getrennt. Es fand kein Zugriff auf ein physisches Gerät statt.

## Behobener Fehler: abgebrochener lokaler Dateizugriff

Der Web-Upload behandelte `FileReader.onload` und `FileReader.onerror`, aber keinen nativen `FileReader.onabort`. Bei einem solchen Abbruch blieb das Promise offen. Dadurch erhielt der Auftrag keinen Abschluss und die folgende Datei konnte in der Uploadwarteschlange hängen bleiben. Ein gezielter Test reproduzierte den Fehler vor der Änderung: Erwartet war ein Fehlerabschluss, tatsächlich gab es keinen.

`read_file_as_bytebuffer()` besitzt jetzt einen Abschluss, der nur einmal ausgeführt wird. `onabort` liefert einen `AbortError`, entfernt die Leserückrufe und gibt den Auftrag kontrolliert frei. Bei einem BLE-Verbindungsabbruch wird zusätzlich der noch laufende lokale Leser abgebrochen. Bereits gelieferte oder verspätete Rückrufe können anschließend keine Dateioperation einer alten Sitzung auslösen. Tests prüfen insbesondere den Übergang zur nächsten Datei und einen verspäteten `onload` nach Verbindungsabbruch.

Die GATT-Warteschlange, Bestätigungen, Dateihashes und atomaren Schreibabschlüsse bleiben erhalten. Es wurde keine parallele Übermittlung von Gerätebefehlen aktiviert.

## Neue Diagnose des tatsächlich ausgehandelten Bluetooth-Links

Der Web-Client fragt für die ausdrücklich qualifizierte LCD-Version DE3.95 den reinen Leseselektor `INFO 0x05`, Nutzlast `[1]`, ab. Dieser liefert MTUD v2 mit 32 Byte. Ältere, unbekannte und OLED-Versionen behalten den bisherigen leeren MTUD-v1-Leseaufruf. Ein Rückfall auf v1 erfolgt beim v2-Aufruf ausschließlich bei explizitem Nichtunterstützungsstatus 1 oder 255. Eine beschädigte Erfolgsantwort, ein Timeout oder ein Sitzungswechsel werden nicht durch einen weiteren Versuch verdeckt.

Zusätzlich zu ATT-MTU und GATT-Wertkapazität werden folgende tatsächlich von der Firmware gemeldete Werte gelesen und exportiert:

- aktiver GAP-Link, Verbindungsintervall, Peripheral Latency und Supervision Timeout;
- aktueller RX-/TX-PHY, getrennt vom Zustand einer angeforderten PHY-Änderung;
- Zahl lokaler PHY-Anfragen, letztes lokales Anfrageergebnis und HCI-Ereignisstatus.

Parser und JSON-Normalisierung prüfen Längen, Version, reservierte Bits/Bytes, Grenzen, Verfügbarkeitsflags und den zurückgesetzten Zustand nach Disconnect. Nicht verfügbare Werte bleiben `null`. Die Oberfläche übersetzt rohe Intervall- und Timeout-Einheiten in Millisekunden. Eine erfolgreiche 2M-Anfrage wird nicht als bereits ausgehandelter 2M-Link angezeigt. Die Hinweiszeile unterscheidet Funkdatenrate und tatsächlich gemessenen Dateidurchsatz.

Die Fixture `web/tests/fixtures/ble-link-diagnostic-v2.json` stammt aus dem tatsächlichen C-Serializer und ist bytegleich mit der Firmware-Testfixture. Ihr synthetischer Fall enthält 20 ms Intervall, 4.000 ms Timeout, RX/TX 2M und eine erfolgreiche lokale Anfrage. Der JavaScript-Parser wurde gegen diese C-Ausgabe geprüft. Die eigentliche 2M-Anforderung und deren begrenzte Wiederholungen gehören zur separat geprüften Firmwareänderung.

## Eigenes Kapazitätsprofil für DE3.95

`de395` besitzt einen eigenen vollständigen Quellensnapshot, eine eigene WASM und eine Bindung an den tatsächlich gelinkten App668-ARM-Build. Das neue Profil ist im Migrationsdialog vorausgewählt. App667, App665 und App664 bleiben separat auswählbar. Die Version allein reicht weiterhin nicht aus, um eine andere Speicherengine zuzulassen.

Die neue WASM wurde mit dem gepinnten offiziellen WASI SDK 34.0 gebaut und mit dem zugehörigen Reproduktionsskript bytegleich erneut erstellt. Ein weiterer Aufbau ausschließlich aus dem entpackten herunterladbaren Quellenarchiv lieferte wiederum identische Bytes. Compiler, Linker, alle zwölf Simulatorquellen und die sechs Firmware-Kern-/LittleFS-Dateien werden über SHA-256 gebunden.

| Artefakt | Größe / SHA-256 |
| --- | --- |
| `web/public/lfs-capacity-de395.wasm` | 64.830 Byte / `311519a0da49474b57376908f836f2f45deccb90a9bbda855ae09343633b151c` |
| `web/public/sources/LCD_DE3_95_App668_Simulatorquellen.zip` | 151.894 Byte / `1cdab106676d84185f07a0686563f9e4c09e662ab2350264965729110358f776` |
| Neuer Cross-Mount-Bericht | `ea35bacd4fa1376963132b21175e059179975e4e32e34f386453e0f27b3d46b6` |

Das Quellenarchiv enthält 24 Einträge: vollständige Simulatorquellen und Lizenzen, Compilerpins, Reproduktionsskript, Referenz-WASM, App668-Bindung, neue ARM-Qualifikation, neuen Cross-Mount-Bericht und den Hashmanifest der 709 Firmware-Produktionseingaben. Alte Quellenarchive wurden nicht ersetzt.

`docs/validation/DE3_95_PFS.json` dokumentiert vier Aufrufe des tatsächlichen gelinkten ARM-Layoutcodes: Laufwerk E mit Mount, E ohne Mount, unzulässiges Laufwerk I und nicht unterstützte Geometrie. ELF, BIN, HEX, Map und Produktionseingaben sind an denselben Build gebunden. Die Modellzustände sind keine Gerätemessung.

Der neue Cross-Mount-Lauf prüft sechs Schritte zwischen App667- und App668-Engine. Die Ausgangssammlung umfasst 1.131 synthetische Dateien und 77 Ordner. Geprüft werden alle Inhalte, Pfade, Metadaten, Importidentität und Remounts nach Änderungen in beiden Richtungen.

Die WASM-Simulation prüfte alle 1.208 Ausgangseinträge. Sie belegte 238 Blöcke; die konservative Transaktionsreserve führt zu einer Bedarfsspitze von 279 Blöcken. Der gemessene Modellwert `coreHeapPeakBytes` beträgt 4.264 Byte. Diese Größen gelten für die synthetische Sammlung und den Simulator, nicht für den tatsächlichen freien Speicher, das gesamte Geräte-RAM oder die Geschwindigkeit des Allmiibo.

## Durchgeführte Prüfungen

Die folgenden Läufe wurden tatsächlich ausgeführt; überlappende Wiederholungen werden nicht zu einer Gesamtsumme addiert.

| Prüfung | Ergebnis |
| --- | --- |
| `extra-diagnostics-transport.test.cjs` und `transport.test.cjs` nach MTUD-/FileReader-Änderung | 208/208 bestanden |
| Parser, Diagnoseexport, tatsächliche Vue-Diagnosekomponente und App-Aufrufverdrahtung | 271/271 bestanden |
| Erweiterter Parserlauf einschließlich tatsächlicher C-Golden-Fixture | 12/12 bestanden |
| Migrationsdialog und Profilauswahl | 38/38 bestanden |
| Neue de395-WASM, Quellenbindung, manipulierte WASM, tatsächlicher ARM-Build und 1.208 Einträge | 5/5 bestanden |
| Neues vollständiges App668-Quellenarchiv und seine Bindungen | 3/3 bestanden |
| App667-/App668-Small-File-Probe und Cache-Diagnose einschließlich DE3.95 | 3/3 bestanden |
| Neue Cross-Mount-Schritte | 6/6 bestanden |
| Layoutcode im tatsächlichen App668-ARM-ELF | 4/4 bestanden |
| Unabhängige WASM-Reproduktion aus Repository und aus entpacktem Quellenarchiv | jeweils bytegleich |
| Whitespace-/Patchprüfung unter Berücksichtigung vorhandener CRLF-Dateien | bestanden |

Ein unabhängiger Review durch den BLE-Implementierer fand keinen Blocker im FileReader-Abschluss, MTUD-v2-Parser, Rückfallverhalten oder der UI-Interpretation. Das Browserprüfskript wurde um die synthetisch gerenderte C-Golden-Fixture und die getrennte v1-Darstellung ergänzt. Der tatsächliche lokale Versuch wurde vor dem Erzeugen einer Browserseite blockiert; es gibt daraus keine ausgeführten Browserassertionen oder Screenshots.

## Abgeschlossene finale Integration

Die aktuelle Referenz ist App668. App667 besitzt die eigenen Exporte `lcdPreview667` und `lcdPreviewPackage667`; beide direkt ladbaren Pakete stehen in `lcdPreviewPackages`. Die bisherigen App664-/App665-/App667-Beweise und Paketbytes bleiben bestehen. Die stabile Katalogdatei wurde nicht zur Testfirmware umgestellt.

Das tatsächlich signierte App668-OTA hat 362.593 Byte und SHA-256 `ce2bfa724cec1a7f8a6004c95434ac7fd016af68c7f0bf1f63de280bea47651b`. Der öffentliche Produktionscommit lautet `805e445aa072281d8db8645ec80ccae4023c90ba`, der öffentliche Validierungscommit `08a266ee8072bc75878cdfe533e2dc5b5c22e7ad`. Beide stehen in der final gebauten Referenz. Die aktuelle App668-Schaltfläche lädt und prüft das Paket ohne lokale Dateiauswahl; der separate Bluetooth-Schritt bleibt erhalten. Der historische App667-Direktlink bleibt verfügbar.

| Abschließende Prüfung | Ergebnis |
| --- | --- |
| Vollständige Web-Testsuite | 1.938 erfasst, 1.935 bestanden, 0 fehlgeschlagen, 3 vorhandene Auslassungen |
| Referenz-/Paketnachprüfung nach finalem Validierungscommit | 14/14 bestanden |
| Root-Produktionsbuild mit endgültigen Referenzen | erfolgreich, 36/36 Dist-Prüfungen |
| Pages-Produktionsbuild mit endgültigen Referenzen | erfolgreich, 36/36 Dist-Prüfungen |
| Lokaler Chromium-Browserlauf | vor Seitenstart blockiert; 0 Browserassertionen, 0 Screenshots |

Die drei Auslassungen betreffen zwei Windows-spezifische Launcherprüfungen unter Linux und eine optionale historische DE3.17-/Recovery575-OTA-Fixtureprüfung. Die aktuellen App668- und historischen App667-/665-/664-Pakete wurden tatsächlich geprüft. Die Dist-Prüfungen führen den gebauten Loader für stabile Firmware, App668 und App667 sowie den gebauten Worker mit der tatsächlichen de395-WASM aus. Sie prüfen beide bereitgestellten Quellenarchive, das richtige Basisprefix und den Schutz vor vertauschter WASM.

Der lokale Browser wurde mit der vorhandenen Playwright-Runtime und `/usr/bin/chromium` gestartet. Chromium brach mit `process_singleton_posix.cc:297`, `socket() failed: Operation not permitted (1)` ab; danach wurde auch `ptrace` abgewiesen. Es erfolgte keine Umgehung und kein zweiter gleichartiger Start. Die Browser-/Telefonansicht muss nach Veröffentlichung über die verfügbare Cloud-Browserumgebung geprüft werden.

## Nächster konkreter Schritt und offene Gerätetests

Die Hauptkoordination übernimmt Commit, Veröffentlichung, Rückprüfung der ausgelieferten Dateien und Cloud-Browserprüfung. Beide lokalen Produktionsverzeichnisse enthalten bereits dieselbe endgültige App668-Referenz. Die maschinenlesbare Abschlussdatei `web_review_de395/WEB_FINAL.json` bindet die Testergebnisse, Logs und Artefakthashes.

Am Gerät offen bleiben eine frische App668-Diagnose mit SourceID, tatsächlichem PHY und Intervall, ein vergleichbarer Datei-Upload/-Download vor und nach dem Update, ein Verbindungsabbruch während der Dateiauswahl/Übertragung sowie Löschen und erneutes Auslesen des freien Speichers. Die separate Firmwareprüfung behandelt das Verlassen des Einstellungsmenüs nach fehlgeschlagenem Speichern. Keine dieser physischen Abnahmen wird durch die hier dokumentierten Host- und ARM-Modelltests behauptet.
