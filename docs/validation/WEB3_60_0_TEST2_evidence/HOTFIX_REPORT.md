# App670: Web-Hotfix für die Testdiagnostik

## Ergebnis

Die vier veralteten Versionsprüfungen im Webprotokoll sind korrigiert. Der echte Rot/Grün-Vergleich ergibt **4 von 8 bestanden vor dem Fix und 8 von 8 danach**. Anschließend bestanden die vier vereinbarten gezielten Testsuiten mit **254 von 254 Fällen**, ohne Fehler oder Skips. Die acht Regressionen sind in den 254 enthalten.

Das ist ein Softwarebefund. Die finale Bereitstellung von Web **3.60.0-test.2** und der erneute Test am Gerät werden gesondert belegt. Die Firmware **LCD DE3.97 / App670 TEST1** wurde durch diese Arbeit nicht verändert oder neu gebaut.

## Ursache und Änderung

App.vue übergab DE3.97 korrekt an die Protokollmethode. Dort war die Auswahl für das neue MTUD-Testprofil noch auf DE3.96 begrenzt. App670 erhielt deshalb eine INFO05-Anfrage ohne Selektor und lieferte korrekt MTUD v1. Das Panel verlangt v3 und zeigte folgerichtig „Dieses Gerät hat die Testfunktion nicht bestätigt.“ Der Parser und die Normalisierung waren bereits für v3 geeignet.

Alle vier betroffenen Funktionen in `web/src/lib/pixl.proto.js` verwenden nun den vorhandenen Helper `supportsBleTestDiagnostics`, der genau DE3.96 und DE3.97 erkennt:

| Funktion | Vorher unter App670 | Nachher für App669 und App670 |
|---|---|---|
| `get_mtu_diagnostics` | Leere INFO05-Anfrage, v1 | Payload `[2]`, v3 mit Testprofil |
| `set_ble_test_extension` | Sofortige Ablehnung | Frische v3-Abfrage vor explizitem EVT!-Befehl |
| `get_startup_diagnostics` | Selektor 3, v4 | Selektor 4, v5 mit Mountprofil |
| `get_storage_gc_diagnostics` | `null`, keine Anfrage | PXGC-RAM-Snapshot mit Payload `[69,2]` |

Der Produktionsdiff besteht exakt aus einem zusätzlichen Import, vier Gate-Ausdrücken und einem präzisierten Kommentar. Ein Bytevergleich gegen die Baseline mit genau diesen Ersetzungen bestätigt diesen Umfang. Parser, Fallbackbedingungen sowie Busy- und Sitzungsprüfungen blieben unverändert.

## Regression und Abdeckungslücke

Die neue Matrix führt die realen Protokollfunktionen für beide Firmwareversionen aus, prüft zuerst die tatsächlichen Requestbytes und speist danach die vorhandenen Produktions-C-Fixtures in Fragmenten ein. Alle vier App669-Verträge bestanden bereits vor der Änderung; alle vier App670-Verträge scheiterten. Nach der Änderung bestehen dieselben acht Tests mit unverändertem Testdateihash.

Zusätzlich werden für beide Versionen die vorhandenen Fehler-, Fallback-, Busy- und Sitzungswechselprüfungen ausgeführt. DE3.98 und OLED bleiben außerhalb der Testfreigabe. Die VM-Fixture der allgemeinen Transportsuite bindet den echten Helper ein.

Die bisherigen Wiretests konzentrierten sich auf App669 und erwarteten für DE3.97 an zwei Stellen sogar ausdrücklich das alte beziehungsweise abgelehnte Verhalten. Die App670-UI-Tests lieferten passende v3-Antworten über Mock-Callbacks; sie prüften damit nicht den echten Selektor im Protokoll. Diese konkrete Lücke wird nun durch die Versionsmatrix abgedeckt.

## Nachweise

- `BASELINE.json` und `before/`: ursprüngliche Dateibindung und unveränderte Ausgangsdateien.
- `REGRESSION_RED.json` / `REGRESSION_RED.log`: 8 Fälle, 4 bestanden, 4 erwartete App670-Fehler auf altem Produktionscode.
- `REGRESSION_GREEN.log`: dieselben 8 Fälle bestanden.
- `TARGETED_SUITES.log`: `extra-diagnostics-transport`, `transport`, `test-build-diagnostics` und `lcd-test-panel`, insgesamt 254 bestanden.
- `HOTFIX_SCOPED.patch`: die drei eigenen geänderten Dateien.
- `HOTFIX_REPORT.json`: genaue Funktionspfade, Baseline-Commit, Datei- und Log-Hashes, Prüfumfang und Grenzen.

Es wurde keine weitere Vollsuite ausgeführt. Alte Qualifikationsberichte und Logs bleiben unverändert. Diese Arbeit enthält keinen Commit und keine Veröffentlichung; der Root-Agent übernimmt die Versionsmetadaten, beide Webbuilds und die Auslieferungsbelege.

## Nächster Schritt am Gerät

Nach der Bereitstellung von Web 3.60.0-test.2 den aktuellen Testmanager neu öffnen, App670 verbinden und **Teststatus lesen** wählen. Erwartet wird die bestätigte v3-Testdiagnose. Dieses physische Ergebnis ist noch offen; aus den Mock-Tests wird kein erfolgreicher Gerätelauf abgeleitet.
