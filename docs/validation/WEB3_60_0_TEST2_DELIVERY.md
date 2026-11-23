# Web 3.60.0-test.2 · bestätigte Auslieferung

**Die App670-Testseite ist veröffentlicht und über die öffentliche HTTPS-Adresse geprüft.**

[Dateimanager 3.60.0-test.2 öffnen](https://bluecyber81.github.io/pixl.js/test/app670/?v=3.60.0-test.2)

## Bindung der ausgelieferten Dateien

| Bereich | Exakter Stand |
|---|---|
| Web-Buildquelle | `0ae7369c05ffc3c7d50618ad7c1c6d83c17a2ef2` |
| Web-Quelltree | `7403cefd8ad86fb67d92667f14c1a53632ebf389` |
| Qualifizierter Web-Unterbaum | `bab05d2931ca742ca7ac7cd34cba863bfde45136` |
| Pages-Commit | `99a274476f9acad6a13057e3fecd52e43af4f4aa` |
| Pages-Tree | `c46aedaddd946552a54ef9f3338181317285038a` |
| Pages-Deployment | [Workflow 44925825998](https://github.com/bluecyber81/pixl.js/actions/runs/44925825998), abgeschlossen und erfolgreich |

Alle **56/56 HTTP-Abgleiche** bestanden bytegenau: sämtliche 44 geänderten Webdateien sowie 12 gezielt ausgewählte unveränderte Firmware-, Referenz-, Simulator-, Root-/App669- und bisherige Hashdateien. Die vollständigen Pfade und SHA-256-Werte stehen im beigefügten HTTP-Protokoll. Es wird kein erneuter HTTP-Vollscan unveränderter Dateien behauptet.

Alle 275 Dateien des qualifizierten Builds stimmen lokal mit dem Pages-Overlay überein. Änderungen betreffen ausschließlich `test/app670/`: 39 neue und fünf aktualisierte Dateien, keine Löschung. Alle 2186 Dateien außerhalb dieses Pfads sowie alle 76 bisherigen gehashten Assets sind unverändert erhalten. Die 39 im neuen Build nicht mehr vorkommenden alten Assets bleiben verfügbar, damit bereits geöffnete Clients ihre nachgeladenen Module weiterhin finden.

## Korrektur und Prüfung

Der Fix verwendet bei vier Diagnoseaufrufen die vorhandene gemeinsame Freigabe für DE3.96 und DE3.97. Das Statuslesen fordert dadurch unter App670 korrekt MTUD v3 an. Firmware **LCD DE3.97 / App670 TEST1**, signierte OTA, Speicherformat und Firmwarekataloge sind unverändert; ein neuer Firmwareflash ist für diesen Webfix nicht erforderlich.

Die identischen Wire-Regressionen reproduzierten vor dem Fix vier App670-Fehler und bestanden danach mit 8/8 Fällen. Die gezielten Transport-/Diagnose-/Panel-Suiten bestanden mit 254/254. Zusätzliche Versions-/DFU-/UI-Prüfungen: 325 bestanden, keine Fehler, zwei Windows-Skips unter Linux. Beide finalen Builds bestanden jeweils 44/44 Dist-/Worker-Fälle. Diese überlappenden Gruppen werden getrennt gezählt. Ursache, Abdeckungslücke und Rohlogs sind in `WEB3_60_0_TEST2.json` und dessen Evidenzverzeichnis dokumentiert.

## Noch am Gerät zu beobachten

Den neuen Link frisch öffnen, die bestehende App670-Firmware verbinden und **Teststatus lesen** wählen. Erwartet wird **„Teststatus gelesen; keine Einstellung verändert.“** Danach folgt der begrenzte, nur lesende Einzel-/Batch-/Einzel-Vergleich mit höchstens zwölf kleinen Dateien. Ein weiteres vollständiges Backup ist dafür nicht erforderlich.

Die Auslieferung ist bestätigt. Eine erfolgreiche TEST2-Statusabfrage am physischen Gerät sowie eine reale App670-Geschwindigkeitsverbesserung wurden noch nicht beobachtet.
