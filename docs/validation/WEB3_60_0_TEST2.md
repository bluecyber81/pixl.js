# Web 3.60.0-test.2 · App670-Teststatus-Hotfix

## Ergebnis

Der Web-Hotfix korrigiert vier Diagnoseaufrufe für **LCD DE3.97 / App670 TEST1**. Die Firmware, die signierte OTA-Datei, der Speicheraufbau und die OLED-/Stable-Kataloge bleiben unverändert. Ein erneutes Flashen ist für diese Korrektur nicht erforderlich.

Diese Qualifikation belegt Quellstand, gezielte Softwareprüfungen und beide fertigen Builds. Der öffentliche Commit und die tatsächliche HTTP-Auslieferung werden in `WEB3_60_0_TEST2_DELIVERY.json` separat festgehalten. Die erneute physische Abfrage am Gerät steht noch aus.

## Ursache und Änderung

Die Oberfläche übergab DE3.97 korrekt. Vier Funktionen in `pixl.proto.js` enthielten jedoch noch eine ausschließliche DE3.96-Prüfung. „Teststatus lesen“ schickte deshalb INFO05 ohne den v3-Selektor; die Firmware antwortete korrekt mit MTUD v1. Das Panel verlangt für das Testprofil v3 und meldete entsprechend die fehlende Testbestätigung.

Alle vier Funktionen verwenden jetzt den vorhandenen Helper `supportsBleTestDiagnostics`, der exakt DE3.96 und DE3.97 unterstützt:

| Aufruf | Korrigiertes Verhalten |
|---|---|
| Teststatus | INFO05 mit `[2]`, MTUD v3 einschließlich Testprofil |
| Funkverlängerung | Frische v3-Vorprüfung vor der ausdrücklich gewählten EVT!-Änderung |
| Startdiagnose | Selektor `[4]`, Startup v5 einschließlich Mountprofil |
| Speicherfreigabestatus | PXGC-RAM-Snapshot; die reine Abfrage führt keine Bereinigung aus |

Der Produktionsdiff umfasst einen Import, vier Gate-Ausdrücke und einen Kommentar. Parser, Fallbacks, Queue-, Busy- und Sitzungsgrenzen sind unverändert. Zusätzlich wurden die Webversionsangaben exakt von 3.60.0-test.1 auf 3.60.0-test.2 ersetzt. Das Firmwarelabel bleibt TEST1.

## Nachweise und frühere Abdeckungslücke

| Prüfung | Ergebnis |
|---|---|
| Identische acht Regressionen mit altem Produktionscode | 4 App669-Fälle bestanden, 4 App670-Fälle gescheitert |
| Dieselben acht Regressionen nach Korrektur | 8/8 bestanden |
| Transport, Diagnosen und Testpanel | 254/254 bestanden, keine Skips |
| Version, Launcher, DFU und UI-Integration | 325 bestanden, 0 Fehler, 2 Windows-Fälle unter Linux übersprungen |
| Root-Build | Fertig; 44/44 Dist-/Worker-Fälle bestanden |
| Isolierter App670-Build | Fertig; 44/44 Dist-/Worker-Fälle bestanden |

Die acht grünen Regressionen sind in den 254 Fällen enthalten. Die Läufe und Buildvarianten überlappen; die Zahlen werden nicht addiert. Eine weitere Vollsuite oder Firmwareprüfung wurde für den engen Webfix nicht wiederholt.

Die früheren Wiretests behandelten DE3.97 teilweise ausdrücklich als Legacy beziehungsweise nicht unterstützt. Die UI-Tests lieferten v3-Objekte über Mock-Callbacks und umgingen dadurch die echte Selektorwahl. Die neue Versionsmatrix prüft die tatsächlichen Produktionsfunktionen, Requestbytes, C-Serializer-Fixtures und fragmentierten Antworten für beide Firmwarestände. Diese konkrete Lücke ist damit reproduziert und abgedeckt.

`WEB3_60_0_TEST2.json` enthält die vollständigen Hashbindungen, den exakten Web-Unterbaum, die 21 geänderten Pfade und die unveränderten Firmware-/Katalogdateien. Die Rohlogs und beide 275-Datei-Buildmanifeste stehen in `WEB3_60_0_TEST2_evidence/`.

## Nächster Gerätetest

Nach bestätigter Veröffentlichung die Testseite mit Webversion **3.60.0-test.2** neu öffnen, App670 erneut verbinden und **Teststatus lesen** wählen. Erwartet wird „Teststatus gelesen; keine Einstellung verändert.“ Anschließend kann der begrenzte, nur lesende Einzel-/Batch-/Einzel-Vergleich mit höchstens zwölf kleinen Dateien folgen. Ein weiteres Vollbackup ist dafür nicht erforderlich. Erfolgreicher physischer Teststatus und reale Geschwindigkeitsverbesserung werden erst nach der Gerätebeobachtung bestätigt.
