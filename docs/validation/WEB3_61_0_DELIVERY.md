# Web 3.61.0 · bestätigte öffentliche Auslieferung

## Ergebnis

Die normale Ausgabe **Web 3.61.0 für LCD DE3.98 / App671** ist veröffentlicht. Der zugehörige Pages-Workflow wurde erfolgreich beendet. Die bereits ausgeführte öffentliche Byteprüfung hat **306 von 306 HTTP-Antworten** bestätigt; der separate Cloud-Desktop-Nachweis umfasst **sieben bestandene UI-Beobachtungen**, einschließlich Laden und Prüfen des echten signierten App671-Pakets.

Diese Quittung dokumentiert vorhandene abgeschlossene Prüfungen. Die **Vollsuite, Builds und die 306-HTTP-Dateiprüfung wurden nicht wiederholt**. Alle vier ursprünglichen Auslieferungsbelege wurden bytegleich übernommen. Eine zusätzliche enge Remote-/Cloud-UI-Kontrolle aus der Fortsetzungssitzung ist gesondert unten gebunden. Die [Softwarequalifikation](WEB3_61_0.md) mit Vollsuite und Buildprüfungen bleibt separat; ihre Fallzahlen werden nicht mit den Auslieferungsbeobachtungen addiert. Die maschinenlesbare Bindung und alle Einzelhashes stehen in [WEB3_61_0_DELIVERY.json](WEB3_61_0_DELIVERY.json).

## Feste Bindung

| Bestandteil | Gebundener Stand |
|---|---|
| Öffentlicher Web-Buildcommit | [`39a183d6a2e86f8b9605d649c5cedfc0ccd20535`](https://github.com/bluecyber81/pixl.js/tree/39a183d6a2e86f8b9605d649c5cedfc0ccd20535), Zweig `web-app671` |
| Web-Buildtree | `155663c88245d3f048a79d920c319592b51309bc` |
| Qualifizierter `web/`-Unterbaum | `e3ac900d892ddbab2c69ab3a708a1b4e2fd3678a`; durch diese Dokumentation unverändert |
| Öffentlicher Pagescommit | [`f83275eb5568ca777a750f70e0b9bb504e5e7c62`](https://github.com/bluecyber81/pixl.js/tree/f83275eb5568ca777a750f70e0b9bb504e5e7c62), Zweig `gh-pages` |
| Pages-Tree | `0263ddb012fe02a337e98d520c8da28760babaac` |
| Firmware-Produktion | [`7ab8d1343d609ecb5bec93863d60f038583f0ba0`](https://github.com/bluecyber81/pixl.js/tree/7ab8d1343d609ecb5bec93863d60f038583f0ba0) |
| Firmwarequalifikation | [`a3ae0e4063f1901e9da98f3ff37fd163388eb72a`](https://github.com/bluecyber81/pixl.js/blob/a3ae0e4063f1901e9da98f3ff37fd163388eb72a/docs/validation/DE3_98.json) |
| SourceID der Anwendung | `067c6740533ca3e390fa04ff0613d543573e4ad401adbb256a6ef17f89650f0a` |
| OTA | `Allmiibo_LCD_DE3_98_671_NUR_APP.zip`, **364781 Byte**, SHA256 `3df205ce3979227a119473807e55d261c00789c6415534d48375876698b90138` |
| BIN | **364180 Byte**, SHA256 `b7d303ee4c4805482827fd79e58535a13210d37931b055d38cf63646a61cdde4` |
| Pages-Ausgabe | 300 Manifestdateien, 14797901 Byte; kanonischer SHA256 `9537b5a15ef2e2aedcd61a22dab17f2c143c9bbb28fdd2d3edb3858f98b0f03f` |

Die Manifest-Kanonisierung verwendet für die Dist-Dateien POSIX-Pfadkomponenten, wie in der [Softwarequalifikation](WEB3_61_0.md) erläutert. Der zusätzliche Dokumentationscommit ist kein neuer Buildquellstand.

## Deployment und öffentliche Dateien

Der [Pages-Workflow 44939142530](https://github.com/bluecyber81/pixl.js/actions/runs/44939142530) gehört genau zum obigen Pagescommit und endete mit `completed / success`. Sein letzter protokollierter Zeitpunkt ist **21.11.2026, 20:07:16 MEZ / 19:07:16 UTC**. Der [unveränderte Workflowbeleg](WEB3_61_0_DELIVERY_evidence/PAGES_WORKFLOW.json) enthält die genaue Commitbindung und die Zeitstempel.

Die [öffentliche HTTP-Prüfung](WEB3_61_0_DELIVERY_evidence/HTTP_DELIVERY_VERIFICATION.json) lief am **21.11.2026 von 20:10:31 bis 20:13:52 MEZ / 19:10:31 bis 19:13:52 UTC**. Sie prüfte Status, Länge, SHA256 und geeignete Antwortmetadaten:

- **298 normale Nutzdateien** der eingefrorenen Pages-Ausgabe;
- **acht erhaltene Dateien** unter den historischen Pfaden `test/app669/` und `test/app670/`: jeweils Managerstart, DFU-Start, DFU-Version und LCD-Testreferenz;
- insgesamt **306 von 306 Antworten bestanden**, ohne automatische Wiederholung.

Nur `.nojekyll` und `_redirects` sind als Buildsteuerdateien von den 300 Manifestdateien ausgenommen. Historische Testseiten bleiben erhalten. Der Nachweis verwendet die tatsächlichen öffentlichen URLs ohne zusätzlich erfundene Cacheparameter; alle lokalen Referenzdateien blieben während der Prüfung unverändert.

## Sichtbare Weboberfläche und Paketprüfung

Der [separate Cloud-Browser-Beleg](WEB3_61_0_DELIVERY_evidence/LIVE_WEB_UI.json) dokumentiert sieben abgeschlossene Beobachtungen am selben Pagescommit:

1. Normale Startseite mit **Allmiibo Dateimanager 3.61.0** und **LCD DE3.98 / App671**.
2. Aktueller App671-Download mit Angaben zu PFS1, Z21 und S112 7.3.0.
3. Updateziel und LCD-Auswahl zeigen App-Zähler **671**.
4. Das historische App662-Komplettpaket bleibt als älterer Systemschritt mit eigenem Bootloader-Gate erklärt.
5. Der tatsächliche App671-Link öffnet den normalen Updater mit der richtigen Vorauswahl.
6. Nach **„Paket laden und prüfen“** bestätigt die Live-Seite die Paketidentität per SHA256, Zähler 671, Hardwarefeld 52 und SoftDevice-FWID `0x0126`.
7. Kein Bluetoothgerät wurde ausgewählt oder verbunden; es fand keine Firmwareübertragung statt.

Der Originalbeleg enthält keinen eigenen UI-Zeitstempel. Die genaue Bindung an den Pagescommit ist vorhanden; eine exakte Beobachtungszeit wird deshalb nicht ergänzt. Der lokale Chromium-Versuch war zuvor bereits beim Start blockiert und hatte **keine Seite erreicht**. Dieser Fehlschlag bleibt unverändert ausgewiesen. Der erfolgreiche separate Nachweis betrifft einen Desktop-Cloud-Browser, kein physisches Android-Gerät.

## Ergänzende Abschlusskontrolle vom 21.11.2026

Der ausführende Root-Agent hat bei der Wiederaufnahme die unveränderten öffentlichen Branchköpfe für Web, Pages und Firmware sowie den erfolgreichen Pages-Workflow erneut per API bestätigt. Zusätzlich hat er die normale Webadresse mit `?v=3.61.0` geöffnet, **Update → LCD** ausgewählt, den App671-Direkteinstieg aufgerufen und **„Paket laden und prüfen“** ausgeführt. Beobachtet wurden **„2.22.0-DE3.98: Paketidentität per SHA-256 bestätigt“**, Anwendungszähler **671**, Hardwarefeld **52** und SoftDevice-FWID **`0x0126`**. Es wurde kein Gerät ausgewählt und keine Firmware übertragen.

Die vom Root-Agenten bereitgestellte [Fortsetzungsquittung](WEB3_61_0_DELIVERY_evidence/CONTINUATION_READBACK_2026_11_21.json) ist bytegleich aufgenommen und im JSON-Bericht gehasht. Sie ergänzt den früheren vollständigen Auslieferungsnachweis. Sie ist keine wiederholte Vollsuite, kein Rebuild und kein neuer vollständiger HTTP-Dateilauf. Eine minutengenaue Beobachtungszeit ist in dieser Quittung nicht enthalten und wird nicht hinzugedichtet.

## Historische „pending“-Felder

Die [ursprüngliche Pages-Veröffentlichungsquittung](WEB3_61_0_DELIVERY_evidence/PAGES_PUBLICATION.json) enthält weiterhin `workflow: pending`, `liveHttp: pending` und `visualReview: pending`. Diese Werte beschreiben ihren früheren Erstellungszeitpunkt unmittelbar nach der Veröffentlichung. Die späteren drei Belege für Workflow, HTTP und UI schließen die Schritte nachweislich ab. Die Rohquittung wurde nicht nachträglich umgeschrieben; diese Abschlussdokumentation erklärt die zeitliche Reihenfolge.

Entsprechend sind Zukunftsformulierungen in älteren Phasenberichten historische Arbeitsstände. Die bereits erfolgreiche Auslieferung wird nicht aus ihnen zurück auf „offen“ gesetzt.

## Benutzung und verbleibende Gerätegrenze

- [Normalen Dateimanager 3.61.0 öffnen](https://bluecyber81.github.io/pixl.js/?v=3.61.0)
- [LCD-App671 im Updater auswählen](https://bluecyber81.github.io/pixl.js/dfu/web.html?v=3.61.0&package=de3.98-lcd-app)
- [Signierte LCD-App671 herunterladen](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_98_671_NUR_APP.zip)
- [Unveränderlicher Download aus dem Firmwarequalifikationscommit](https://raw.githubusercontent.com/bluecyber81/pixl.js/a3ae0e4063f1901e9da98f3ff37fd163388eb72a/fw/releases/Allmiibo_LCD_DE3_98_671_NUR_APP.zip)

Die Anwendung ist für ein passendes LCD mit vorhandenem Packed LittleFS, Z21 und S112 7.3.0 bestimmt. Das Paket enthält nur die Anwendung. Für diesen Anwendungswechsel ist keine erneute Speicherumstellung erforderlich. OLED bleibt separat.

Die öffentliche Auslieferung und Desktop-Bedienung belegen keine Installation von App671 auf einem realen Gerät. Der Status `hardwareAcceptance: pending-for-this-build` bleibt bestehen. Physischer BLE-Transfer, tatsächlicher App671-Betrieb sowie NFC- und Konsolenverhalten sind damit nicht gemessen. Vorhandene App670-Geräteberichte wurden nicht öffentlich in diese Quittung übernommen.

Der nächste konkrete Schritt ist die normale App671-Installation und das Beobachten der bereits beschriebenen neuen Rückkehr-, Speicherstatus- und Wiederaufnahmepfade im üblichen Gebrauch. Eine erneute vollständige Backup-, Speicher- oder Funkvergleichsserie ist keine zusätzliche Voraussetzung dieses Abschlusses.
