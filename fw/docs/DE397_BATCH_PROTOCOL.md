# LCD DE3.97 / App670: begrenzte Mehrdatei-Leseanfragen

Dieser Zusatz erweitert den vorhandenen PackedFS-Dateidienst um eine begrenzte
Sammelanfrage für kleine Dateien. Er betrifft das LCD-Build mit
`PIXL_SMALL_CREATE_ENABLE`, `PIXL_FILE_DIGEST_ENABLE` und `VFS_PACKED_LFS_ENABLE`.
Die bestehenden Befehle, insbesondere `PXSC` mit Flags **7**, bleiben unverändert.
OLED und ein privater Webmanager sind kein Bestandteil dieses Protokollzusatzes.

## Capability: `0x25`

Die Anfrage hat keine Nutzdaten, Status 0 und Chunk 0. Die erfolgreiche Antwort
hat Status 0, Chunk 0 und genau 16 Nutzbytes:

| Offset | Länge | Inhalt |
| --- | ---: | --- |
| 0 | 4 | ASCII `PXBR` |
| 4 | 1 | Version 1 |
| 5 | 1 | Maximale Dateianzahl: 4 |
| 6 | 2 | Maximale Dateigröße: 572, Little Endian |
| 8 | 8 | Aktuelle, von null verschiedene PackedFS-Revision, Little Endian |

Version 1 bietet beide unten definierten Modi. Der Client darf diese neue
Capability erst nach einer passenden LCD-Firmwarekennung ab DE3.97 anfragen;
eine unbekannte Anfrage an alte Firmware darf keinen routinemäßigen VFS-Fehler
erzeugen. Die Capability darf pro Verbindung zwischengespeichert werden, ihre
Revision darf jedoch keine spätere frische Revisionsabfrage ersetzen. Ein
Backup bindet jeden Batch an seine frisch gelesene Ausgangsrevision.

Bei Recovery, laufendem Import, offenen Dateisystem-Handles, einer laufenden
Datei-/Verzeichnisübertragung oder einem ausstehenden SmallCreate ist die
Capability nicht verfügbar. Es wird eine leere Fehlerantwort gesendet.

## Sammelanfrage: `0x26`

Status und Chunk müssen 0 sein. Die Anfrage passt vollständig in einen
zulässigen Request; alle Mehrbytefelder sind Little Endian.

| Reihenfolge | Länge | Inhalt |
| --- | ---: | --- |
| Header | 1 | Modus: 0 = READ, 1 = SHA-256 |
| Header | 1 | Anzahl: 1 bis 4 |
| Header | 8 | Erwartete, von null verschiedene PackedFS-Revision |
| Je Datei | 2 | Pfadlänge in **Bytes** |
| Je Datei | Pfadlänge | UTF-8-Pfad einschließlich `E:/`, ohne NUL |
| Je Datei | 2 | Erwartete Dateigröße: 0 bis 572 |

Die Gesamtlänge ist `10 + Summe(4 + Pfadbytes)` und höchstens 243 Byte. Der
Client begrenzt sie zusätzlich auf seine tatsächlich zulässige Requestkapazität.
Passt die Anfrage dort nicht hinein, benutzt er den vorhandenen Einzelfilepfad;
er führt keine neue Fragmentierung großer Batchanfragen ein. Unbekannte Modi,
Anzahl 0 oder größer 4, abgeschnittene Felder und Restbytes werden abgewiesen.

Es gelten dieselben bytebasierten Pfadregeln wie beim vorhandenen SmallRead:
nur `E:/`, maximal 65 Byte einschließlich Laufwerk, kein eingebettetes NUL,
keine leeren Komponenten, `.` oder `..`; jede Komponente umfasst 1 bis 47 Byte.
Die Firmware übernimmt die Pfadbytes ohne Unicode-Normalisierung. Eine
Mehrbytezeichenfolge zählt daher mit ihrer UTF-8-Bytezahl, nicht ihrer Zeichenanzahl.

## Antwort und Fehlerverhalten

READ liefert die reinen Dateiinhalte in der Reihenfolge der Anfrage,
unmittelbar aneinandergehängt. Die erwarteten Größen bestimmen die Grenzen.
SHA-256 liefert genau einen 32-Byte-Digest pro Datei, ebenfalls in dieser
Reihenfolge. Es gibt keinen zusätzlichen Antwortheader und keine Einzelstatusfelder.
Die Gesamtlänge beträgt bei READ genau die Summe der erwarteten Dateigrößen,
bei SHA-256 genau `32 × Anzahl`.

Die vorhandene DF-Chunkfolge beginnt bei 0. Bit `0x8000` kennzeichnet weitere
Frames; der letzte Frame hat dieses Bit nicht gesetzt. Seine Nutzlast bleibt
innerhalb der ausgehandelten Kapazität. Auch vier leere Dateien sind gültig:
READ antwortet in diesem Fall mit einem einzigen erfolgreichen leeren Endframe.

Die Firmware validiert zunächst die gesamte Anfrage. Danach liest sie jede
Datei mit `erwartete Größe + 1` als Obergrenze, um auch Wachstum einer zuvor
leeren Datei zu erkennen. Der gemeldete Umfang muss exakt der erwarteten Größe
entsprechen. Der vorhandene PackedFS-Lesepfad mit seiner CRC-Prüfung bleibt
zuständig. Alle Dateihandles werden geschlossen, bevor eine Antwort übertragen
wird. Erst wenn sämtliche Inhalte beziehungsweise Digests fertig sind und
Revision, Recovery-/Importstatus und Handlefreiheit erneut passen, beginnt
die Ausgabe. Ein Fehler davor verwirft die gesamte vorbereitete Antwort und
liefert Status 1, Chunk 0, Länge 0.

Der Client veröffentlicht Ergebnisse erst nach einer vollständig empfangenen,
erfolgreichen und exakt längengeprüften Antwort. Bei Transportabbruch können
bereits einzelne Frames angekommen sein; diese ergeben kein gültiges
Teilergebnis. Ein Ersatzkommando, ein Disconnect oder die bestehende
TX-Fehlerbehandlung räumt den Antwortzustand auf. Ein verspätetes TX_READY
setzt eine abgebrochene Antwort nicht fort. Die Hosttests verwenden dafür den
tatsächlichen `df_core`, einschließlich seiner bestehenden Abortgrenze.

Diese Antwortvorbereitung ist keine neue atomare Mehrdatei-Snapshot-API.
Die bestehende Revisionsprüfung vor und nach dem gesamten Backup bleibt nötig.
Die Sammelanfrage erstellt, entfernt oder verändert keine Datei. Save/Discard,
Writer-Ownership, Pins, GC- und Publish-Regeln werden nicht ersetzt.

## Ressourcen und erwartete Wirkung

Der bestehende 12-Byte-`small_read`-Zustand und sein Chunk-Sender werden
wiederverwendet. Es gibt keine neue statische Nutzdatenreserve. Ein READ benötigt
höchstens `4 × 572 + 1 = 2289` angeforderte Heapbytes. SHA-256 benötigt höchstens
`4 × 32 + 572 + 1 = 701` Heapbytes; alle Dateien benutzen denselben Scratchbereich.
Temporäre interne PackedFS-Allokationen und TLSF-Verwaltung kommen hinzu.

Bei 243 Byte Antwortkapazität benötigen vier 540-Byte-Dateien neun anstelle
von zwölf Nutzdatenframes, vier 572-Byte-Dateien zehn anstelle von zwölf.
Vier Einzelanfragen werden jeweils durch eine Anfrage ersetzt. Vier Digests
passen gemeinsam in einen Antwortframe. Das beschreibt das Protokollvolumen;
es ist keine gemessene Beschleunigung und keine Aussage über DLE oder Funkzeit.

Die gemeinsame frühe App670-ARM-Budgetprobe ergab 363888 Byte BIN,
8836 Byte Flashreserve bei unverändertem Minimum 8192 sowie 1688 Byte
statischen Heap-/Stack-Abstand bei Minimum 1536. Die Stackreserve bleibt
8192 Byte. Dies sind Werte des gesamten damaligen Buildstands, keine isolierte
Größenmessung allein dieser Erweiterung. Der finale Buildbericht ist maßgeblich.

Die zugehörigen `.su`-Einzelframes betragen 152 Byte für den Batchhandler,
264 Byte für den gemeinsamen Sender und 24 Byte für den Elementparser.
Einzelframes sind keine vollständige Stack-Watermark des BLE-/VFS-/IRQ-Pfads.

## Nachweise und Grenzen

`fw/tests/de3/test_batch_read_de397.py` kompiliert die tatsächlichen
Protokoll-, `df_core`-, PackedFS-, VFS- und LittleFS-Quellen mit synthetischem NOR.
Die finale Testfassung umfasst 132 gezählt erfolgreiche und 744 gezählt
verworfene Anfragen, 18 injizierte Allokationsfehler, 320 NOR-Lesefehler und
157 Lifecyclefälle. Dazu gehören UTF-8, leere Dateien, exakte 243-Byte-Anfragen,
65/66-Byte-Pfadgrenzen, Größenabweichungen, alte Capabilities/Einzelfilebefehle,
bestehende Reader/Verzeichnis-/SmallCreate-Eigentümer und Abbruch an jedem
kleinen Antwortchunk. Die Befehle verursachten im geprüften NOR-Modell keine
Programmierung oder Löschung; am Ende blieb keine angeforderte Allokation offen.

Die Suite bestand nativ, mit ARM32/QEMU und mit ASan/UBSan. Die
LeakSanitizer-Endinspektion muss in diesem Executor wegen `ptrace` deaktiviert
werden; Speicherzugriffs-/UB-Prüfung und die explizite Allokationsbilanz bleiben
aktiv. Der jeweilige JSON-Bericht hält die benutzten Optionen und Quellhashes fest.

`fw/tests/de3/check_batch_read_elf_de397.py` führt den tatsächlich verknüpften
Cortex-M4-Code aus, bindet ELF und BIN an `BUILD_RESULT.json` und prüft Registry,
Parser, TLSF, SHA-256, Fehlerbehandlung und Antwortchunks. Nur Storage-Readiness,
Revision, `read_file_data` und Antwortausgabe sind dort Modellgrenzen. In der
frühen Probe belegt die größte Antwort 2296 Byte des echten TLSF-Pools inklusive
Rundung/Verwaltung; freier Speicher und größter Block werden vollständig
wiederhergestellt. Die beobachteten 688 Byte Stack betreffen die direkten
Modellaufrufe, nicht den vollständigen Firmware- oder Interruptpfad.

Beide Prüfarten ersetzen keine Geräteabnahme. Der nächste kurze Gerätetest
soll Firmwareidentität, Antwortbindung und READ/DIGEST mit einer begrenzten
Dateiauswahl belegen; ein erneut verpflichtender vollständiger AUS/EIN/AUS-
Backupvergleich ist nicht vorgesehen. Der Normalbuild folgt erst nach dem
vereinbarten Teststand und einer passenden Freigabe mit höherem Counter.
