# LCD DE3.97 / App670 TEST1 – Softwareprüfung abgeschlossen, Signierung ausstehend

**Stand: 21. November 2026. Dieser Kandidat ist nicht als installierbares DFU-Paket veröffentlicht.**

Die Anwendung ist gebaut und softwareseitig geprüft. Die automatische Freigabeprüfung blockiert noch den Bezug des geerbten Projektschlüssels aus seiner externen, gepinnten Quelle. Sie verlangt dafür eine ausdrückliche Nutzerfreigabe im aktuellen Transkript; die wiedergefundene frühere Projektfreigabe wurde von diesem Gate nicht akzeptiert. Es wurde kein alternativer Schlüsselweg verwendet. Im Prüfpaket befinden sich keine privaten Schlüssel.

## Warum dieser Teststand entsteht

Die ursprüngliche Untersuchung hatte fünf Teile: Übertragungsphasen in der Diagnose zusammenführen, ausstehende Speicherfreigabe erklären, kleine Dateien und Prüfsummen gesammelt abfragen, die optionale BLE-Ereignisverlängerung messen und den Dateisystemstart aufteilen. App669 ergänzte zuerst die Messmöglichkeiten. Der abgeschlossene App669-Backupbericht zeigt, dass die Lesephase den größten Zeitanteil hat; beim Start fallen vor allem Flash-Lesen und CRC-Verarbeitung an.

App670 setzt deshalb bei begrenzten Sammelabfragen und einer kleinen CRC-Schleifenoptimierung an. Bereits vorhandenes Speichern/Verwerfen, automatische Bereinigung und Menüverhalten bleiben erhalten. Allgemeines Streaming mit Übertragungsfenster und ein SoftDevice-/DLE-Wechsel sind weiterhin getrennte größere Vorhaben. Nach der Geräteauswertung soll ein späterer normaler Build mit höherem Anwendungscounter folgen.

## Änderungen

- Der neue Capabilitybefehl `0x25/PXBR` bestätigt bis zu vier Dateien mit jeweils höchstens 572 Byte. `0x26` liest deren Inhalte oder SHA-256-Prüfsummen unter einer frischen 64-Bit-Speicherrevision. Die gesamte Anfrage bleibt innerhalb von 243 Byte und der tatsächlich nutzbaren Transportkapazität.
- Die Firmware prüft den gesamten Auftrag vor I/O und bereitet alle Ergebnisse vor dem ersten Nutzdatenframe vor. Größenabweichung, veraltete Revision, Recovery, belegte Handles, Allokations- oder Lesefehler geben keine teilweise erfolgreiche Gruppe frei. Der bestehende Chunk-Sender und sein zwölf Byte großer Zustand werden wiederverwendet.
- Der Dateimanager nutzt Gruppen auch beim Wiederverwenden bereits geprüfter Backupdaten. Eine fehlende Fähigkeit verwendet den bisherigen Einzelpfad; beschädigte Antworten oder Sitzungsfehler werden nicht als erfolgreicher Fallback behandelt.
- Einzelne vollständig passende SmallRead-/Batch-Anfragen können Write Without Response nutzen. Die Anwendung wartet weiterhin auf vollständige Protokollantwort und abgeschlossenen Browser-Sendevorgang. Die Wirkung der tatsächlichen Funkereignisreihenfolge bleibt am Gerät zu prüfen.
- Die beiden CRC-Byte-Schleifen benötigen beim gepinnten ARM-Compiler weniger ausgeführte Instruktionen. Tabelle, CRC-Arithmetik und Prüfumfang bleiben erhalten. SPI-Frequenz und Cachegrößen wurden nicht erhöht.
- Ein kurzer, ausdrücklich gestarteter Vergleich liest höchstens zwölf vorhandene kleine Dateien: einzeln, gesammelt und nochmals einzeln, anschließend Geräte-Digests. Er prüft identische Bytes und Revision, lässt sich nach der laufenden Anfrage abbrechen und schreibt oder löscht keine Dateien. Sein Bericht enthält auch beim Abbruch Firmware-/Webversion, Zeiten und begrenzte Vorher-/Nachher-Linkbeobachtungen.
- Der Build-Preflight erkennt einen veralteten generierten Engine-Header vor SDK-Kopie und Kompilierung. Genau diesen Fehler hatte der erste Qualifikationslauf erkannt; der korrigierte Endstand wurde neu gebaut und vollständig geprüft.

Die vollständige Protokollbeschreibung steht in [DE397_BATCH_PROTOCOL.md](../../fw/docs/DE397_BATCH_PROTOCOL.md).

## Identität und Ressourcen

| Merkmal | Geprüfter Stand |
|---|---|
| Board / Display | LCD / ST7567, 128 × 64 |
| Firmware / Anwendungscounter | 2.22.0-DE3.97 / 670 TEST1 |
| Produktionscommit | `d34ecb44fa058a149b58de2dcbffbb751c015864` |
| SourceID | `b5da931da1f22110ed60d36af7cfdfda090f5191a070acb6e8c550b8b77eddbe` |
| BIN | 363.888 Byte |
| BIN-SHA-256 | `2e0db2e1303730d1042bb88619c0f6364f2824d59e306b69fb244b6fc8cbe9b9` |
| PackedFS-Engine | `a5aa9c1b7374c77a0a66f44e1287fd5e18f69a43f46797ed74b99e01de631788` |
| Flashreserve | 8.836 Byte; Mindestgrenze unverändert 8.192 |
| Statischer Heap-/Stack-Abstand | 1.688 Byte; Mindestgrenze unverändert 1.536 |
| Reservierter Stack | 8.192 Byte |
| Zusätzlicher Programmcode gegenüber App669 | 576 Byte |
| Zusätzlicher statischer RAM | 0 Byte |
| Größte eigene Batch-Heap-Anforderung | READ 2.289 Byte, DIGEST 701 Byte |

Z21 und S112 7.3.0 sind die beabsichtigte vorhandene Systembasis. Der spätere signierte Updateweg soll nur die Anwendung enthalten. PFS1 bleibt unverändert; OLED und der historische private OLED-Dateimanager sind nicht Gegenstand dieses Builds.

## Durchgeführte Prüfungen

| Prüfung | Ergebnis |
|---|---|
| Zwei unabhängige native Firmwarebuilds | BIN, HEX und alle 709 Produktionseingaben identisch |
| Vollständige Firmware-Regression | 183 von 183 Testskripten bestanden, Quellen unverändert |
| Prüfungen am tatsächlich gelinkten ARM-Code | 13 von 13 bestanden |
| Batchprotokoll nativ, ARM32/QEMU und ASan/UBSan | 132 erfolgreiche und 744 verworfene Anfragen; 18 Allokationsfehler, 320 NOR-Lesefehler, 157 Lifecyclefälle; keine verbliebenen Allokationen |
| Gezielte CRC-/Mountprüfungen | Sechs nativ und sechs unter ASan/UBSan bestanden |
| Tatsächliche ARM-CRC-Funktionen gegen unabhängige Bitreferenz | 216 Vergleiche bestanden; keine Instruktionszunahme |
| Exakte PFS-Layoutbindung im gelinkten ARM-Code | Vier Fälle bestanden |
| Wechselseitiger App669/App670-Crossmount | Sechs Phasen mit 1.208 synthetischen Einträgen bestanden |
| Neuer Build-Preflight | Sieben gezielte Unitprüfungen bestanden |

LeakSanitizer kann im verwendeten ptrace-Executor keine Endinspektion ausführen. Die erfolgreichen Sanitizerläufe verwendeten deshalb `detect_leaks=0`; ASan/UBSan und die explizite Allokationsbilanz blieben aktiv. Die direkte modellierte Batch-Stacktiefe ist keine Gesamt-Watermark des Firmware-/Interruptpfads.

Bei einem profilierten 128-Byte-Aufruf sinkt die Zahl ausgeführter ARM-Instruktionen für `crc` von 1.042 auf 912 und für `crc_pair` von 1.557 auf 1.427. Das ist ein Codebefund, keine gemessene Startzeitersparnis am Gerät.

Die maschinenlesbare Übersicht und Hashbindungen stehen in [DE3_97_TEST1.json](DE3_97_TEST1.json). Der separate Webnachweis beschreibt Webtests, Simulator und die ausdrücklich gesperrte App670-Installation.

## Noch offen und nächster Schritt

1. Die konkrete externe Projektschlüsselquelle im aktuellen Chat freigeben lassen. Danach diesen unveränderten BIN signieren und das echte Paket einschließlich negativer Signaturkontrollen und Z21-Init-/CRC-/BIN-Prüfung qualifizieren.
2. Den Dateimanager an die realen signierten OTA-Bytes binden, die Paket-/Auslieferungsprüfungen abschließen und den getrennten App670-Testpfad veröffentlichen.
3. Auf dem passenden LCD-Gerät den kurzen Lesevergleich und eine Diagnose nach Neustart auswerten. Speichern/Verwerfen/Persistenz und normaler längerer Betrieb bleiben getrennte Gerätebeobachtungen.

Das bereits abgeschlossene App669-Backup bleibt ein gültiger Nachweis. Für den kurzen App670-Vergleich sind keine weiteren vollständigen AUS/EIN/AUS-Backups vorgeschrieben. Eine Beschleunigung am Handy oder eine bestimmte Startzeit wird erst nach den passenden Gerätedaten behauptet.
