# App670 TEST1 ist veröffentlicht und über HTTPS geprüft

Stand: 21. November 2026. Web **3.60.0-test.1** und die signierte LCD-Firmware **2.22.0-DE3.97 / App670 TEST1** sind unter dem getrennten Testpfad ausgeliefert. Die physische Geräteabnahme und die Messung des Nutzens bleiben offen.

- [Dateimanager öffnen](https://bluecyber81.github.io/pixl.js/test/app670/?v=3.60.0-test.1)
- [App670-Aktualisierung öffnen](https://bluecyber81.github.io/pixl.js/test/app670/dfu/web.html?v=3.60.0-test.1&package=de3.97-lcd-app-test1)
- [Signiertes App-only-ZIP](https://bluecyber81.github.io/pixl.js/test/app670/firmware/Allmiibo_LCD_DE3_97_670_TEST1_NUR_APP.zip)

Das Paket ist für LCD/ST7567 mit vorhandenem Z21 und S112 7.3.0 bestimmt. Es enthält ausschließlich die Anwendung. Die Datenstruktur bleibt PFS1. ZIP: 364.489 Byte, SHA-256 `ff2c056d66f423afade03a47b730f92033645f0db9d74f946cbafd65734d7786`.

## Exakt ausgelieferter Stand

| Bestandteil | Öffentlicher Commit |
| --- | --- |
| Firmwareproduktion | `d34ecb44fa058a149b58de2dcbffbb751c015864` |
| Signierte Firmwarequalifikation | `898ba1bb46db2e67e3cc6a0216aefa3db4368f70` |
| Webquellen des Builds | `613a0aa189c100a93fe04033d04a2ce7608769c0` |
| Pages-Auslieferung | `982c457fdfebb148ef2d25d3d8988ab1c29c50ed` |

Dieser reine Belegnachtrag verändert die Programmquellen oder ausgelieferten Bytes nicht. Die Softwarequalifikation steht in [WEB3_60_0_TEST1.md](WEB3_60_0_TEST1.md). Ihre Basisphase mit 2034 bestandenen und drei übersprungenen Fällen bleibt getrennt von den 87 finalen Paket-/Referenzfällen. Beide finalen Builds haben jeweils 44 Dist-/Worker-Prüfungen bestanden.

Die vollständige Onlineprüfung hat **285 von 285 Dateien** bytegenau bestätigt: alle 275 neuen Dateien im App670-Testpfad sowie zehn erhaltene Hauptseiten-/App669-Dateien. Der passende Pages-Workflow und jeder HTTP-Hash sind im [Auslieferungsbericht](WEB3_60_0_TEST1_DELIVERY.json) gebunden. Im Git-Tree sind sämtliche 2186 bisherigen Pages-Dateien unverändert erhalten; ausschließlich `test/app670/` wurde ergänzt.

## Kurzer nächster Gerätetest

1. App670 über die Aktualisierungsseite installieren und danach den neuen Dateimanager verbinden.
2. Einen Ordner mit kleinen Dateien öffnen. Unter **Gerät & Diagnose → LCD App670 · Test 1** zuerst **Teststatus lesen** wählen. Die Funkverlängerung für die Ausgangsmessung AUS lassen.
3. **Kurzvergleich starten** wählen. Er liest höchstens zwölf vorhandene Dateien einzeln, gebündelt und nochmals einzeln und prüft Inhalte sowie Geräte-Prüfsummen. **Kurzvergleich speichern** exportiert den Bericht.
4. Eine Gesamtdiagnose nach dem Neustart ergänzen. Speichern, Verwerfen und Persistenz bleiben eigene Gerätebeobachtungen.

Der abgeschlossene App669-Vollbackup ist weiterhin die Ausgangsmessung. Für diesen Vergleich ist keine neue vollständige Backupserie erforderlich. Tatsächliche Beschleunigung und Startzeitverbesserung werden erst anhand der Gerätedaten bewertet.
