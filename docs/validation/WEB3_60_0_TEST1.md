# Web 3.60.0-test.1 · LCD DE3.97 / App670 TEST1

Dieser Bericht beschreibt den **Zustand bei der Softwarequalifikation vom 21. November 2026**. Die reale App670-OTA ist signiert und softwareseitig geprüft. **Die physische Geräteabnahme bleibt offen.** Der öffentliche Webcommit, die HTTP-Auslieferung und der Live-Readback werden in einer separaten Auslieferungsquittung belegt. Dieser Bericht beschreibt auch nach einer späteren Veröffentlichung weiterhin den hier geprüften Stand.

## Gebundener Stand

| Merkmal | Wert |
| --- | --- |
| Web | 3.60.0-test.1 |
| Firmware | LCD 2.22.0-DE3.97 · App670 · TEST1 |
| Firmware-Produktion/Quelle | d34ecb44fa058a149b58de2dcbffbb751c015864 |
| Firmware-Qualifikation | 898ba1bb46db2e67e3cc6a0216aefa3db4368f70 |
| Firmware-Qualifikationstree | 99fdb8b40d89d5fcd5948d072d94c54e29bf3933 |
| SourceID | b5da931da1f22110ed60d36af7cfdfda090f5191a070acb6e8c550b8b77eddbe |
| Anwendungs-BIN | 363888 Byte |
| BIN-SHA-256 | 2e0db2e1303730d1042bb88619c0f6364f2824d59e306b69fb244b6fc8cbe9b9 |
| OTA | Allmiibo_LCD_DE3_97_670_TEST1_NUR_APP.zip · 364489 Byte |
| OTA-SHA-256 | ff2c056d66f423afade03a47b730f92033645f0db9d74f946cbafd65734d7786 |
| Speicherprofil | de397 |
| Engine-SHA-256 | a5aa9c1b7374c77a0a66f44e1287fd5e18f69a43f46797ed74b99e01de631788 |
| WASM-SHA-256 | d77286b2176a369b957b7259305df82da5f950c6e33b3a90ce54c21bf7e8ec4c |
| Finale Webquellenbindung | fee6838efb71b00cb4e401112b4783d98010c5bf49d847e49143c1723f6e13fe |

Die Quellenbindung umfasst die im [Manifest](WEB3_60_0_TEST1_evidence/SIGNED_SOURCE_MANIFEST.json) einzeln mit Größe und SHA-256 aufgeführten Webdateien und unmittelbar gebundenen Firmware-/PFS-Nachweise. Sie ist kein Vollmanifest der Firmwarehistorie. Der später zugeordnete öffentliche Webcommit gehört in die Auslieferungsquittung, damit kein sich selbst referenzierender Commitwert in diesem Bericht entsteht.

## Verhalten und Schutzgrenzen

Die neue Mehrdatei-Anfrage ist tatsächlich in neue Backups, Wiederaufnahme und den Abgleich mit einem vorhandenen ZIP eingebunden. Pro Gruppe sind höchstens vier Dateien mit jeweils bis zu 572 Byte zugelassen. Die gesamte Anfrage überschreitet weder 243 Byte noch das ausgehandelte Transportlimit. Alte Firmware wird nicht mit dem neuen Capability-Kommando angesprochen. Fehlt die Fähigkeit, bleibt der vorhandene Einzelpfad verfügbar.

Die neue Fähigkeit gehört zur aktuellen Sitzung. Jede Anfrage verwendet die frisch beobachtete Speicherrevision. Antwortlänge, Reihenfolge, Dateipfade, Größen und SHA-256-Zuordnung werden geprüft, bevor Gruppenmitglieder an den fortsetzbaren Backupcache gelangen. Fehlerhafte oder unvollständige Antworten werden nicht als erfolgreiche Teilgruppe verwendet. Die vorhandenen TX-/RX-Abschlussbedingungen und Abbruch-/Sitzungskontrollen bleiben erhalten.

Write Without Response wird nur bei bestätigter Fähigkeit und vollständig in einen GATT-Frame passender Anfrage freigegeben. Der kurze Vergleich wird ausdrücklich gestartet, liest höchstens zwölf kleine Dateien und vergleicht Einzel → Batch → Einzel sowie Dateihashes. Beim Abbruch wird die aktive Antwort abgewartet. Diese Prüfungen ergeben keine Messung der tatsächlichen BLE-Geschwindigkeit oder der Annahme jeder schnellen WNR-Folge am Gerät.

## Prüfphasen

| Phase | Ergebnis | Einordnung |
| --- | --- | --- |
| Vollständige unsigned Basisphase | 2034 bestanden / 2037 Fälle; 0 Fehler; 3 umgebungsbedingt offen | Vollständiger Webtestlauf vor der späteren Signierung |
| Finale signed Paket-/Referenzphase | 87/87 bestanden; 0 Fehler; 0 übersprungen | Reale App670-OTA und finaler Qualifikationscommit |
| Root-Build einschließlich Dist-/Worker-Gates | 44/44 bestanden | Lokaler Basispfad / |
| Isolierter TEST1-Build einschließlich Dist-/Worker-Gates | 44/44 bestanden | Basispfad /pixl.js/test/app670/ |

Die Zahlen werden nicht addiert. Die gezielten Fälle überlappen den vollständigen Lauf; beide Builds prüfen dieselben Dist-Fälle mit unterschiedlichen Basispfaden. Die drei offenen Fälle der vollständigen Basisphase sind zwei Windows-Launcher-Prüfungen in einer Linux-Umgebung sowie ein optionaler historischer DE3.17-/Recovery575-OTA-Test, dessen lokale Dateien fehlen. Sie sind ausdrücklich nicht als bestanden gezählt.

Der vollständige Basislog bleibt [unverändert erhalten](WEB3_60_0_TEST1_evidence/UNSIGNED_WEB_TESTS.log), zusammen mit dem [damals gebundenen Quellmanifest](WEB3_60_0_TEST1_evidence/UNSIGNED_SOURCE_MANIFEST.json). Backup-, Protokoll-, BLE-, Kurzvergleichs-, App-, Panel- und Diagnosequellen sind seit diesem Gesamtlauf bytegleich. Die danach geänderten Paket-/Referenz-/Auslieferungsdateien werden im JSON-Bericht einzeln aufgeführt und durch die finale gezielte Phase beziehungsweise die Builds geprüft.

Die [finale Paketphase](WEB3_60_0_TEST1_evidence/SIGNED_PACKAGE_TESTS.log) verwendet die echte ZIP und bestätigt vollständigen Archivhash, BIN-Hash und -Länge sowie den Init-Zielwert App670, Hardware 52 und ausschließlich S112-FWID 0x0126. Eine unabhängige P-256-ECDSA-Prüfung verifiziert die inneren InitCommand-Bytes mit dem öffentlichen Z21-Punkt; geänderte Initdaten und Signatur werden abgewiesen. Der öffentliche Punkt ist mit SHA-256 9ee942fb8b5fa84aa3287f02451c7f2bf2168f5df2c97af253172d2e90f03a83 gebunden. Private Schlüssel gehören nicht zu diesen Webnachweisen.

Der reale Loader, Updater und ZIP-Parser werden gemeinsam geprüft. Eine gleich große, manipulierte ZIP scheitert vor dem Parser und vor einer Bluetooth-Auswahl. Die beiden gebräuchlichen Handy-MIME-Typen bleiben unterstützt. Android-Handoff und Katalog erzwingen das genaue LCD/PFS1/Z21/S112-TEST1-Profil und den isolierten App670-Pfad. Normale Root-Aliase sind ausgeschlossen. Die tatsächlichen App667/668/669-Pakete bleiben zusätzlich geprüft und verfügbar.

## Builds und unveränderte Kataloge

Die Builds wurden nach der finalen Firmware-Commitbindung erzeugt. Das öffentlich ausgelieferte Referenzmodul und die App670-OTA stimmen in beiden Ausgaben bytegenau mit der Quelle überein; der Qualifikationscommit ist zusätzlich in den gebündelten JavaScript-Assets enthalten. Jeder Build enthält 275 Dateien. Die einzelnen Größen und Hashes stehen in den [Root-](WEB3_60_0_TEST1_evidence/DIST_ROOT_MANIFEST.json) und [TEST1-Manifesten](WEB3_60_0_TEST1_evidence/DIST_TEST1_MANIFEST.json); die vollständigen Buildlogs liegen [hier](WEB3_60_0_TEST1_evidence/BUILD_ROOT.log) und [hier](WEB3_60_0_TEST1_evidence/BUILD_TEST1.log).

Die Stable-/OLED-Kataloge in web/src/data/firmware-releases.json, web/public/firmware/releases.json und web/public/firmware/releases.js sind bytegleich zur Ausgangsbasis. App670 ergänzt die isolierte TEST1-Auswahl. Weder eine Stable-Freigabe noch eine neue OLED-Firmware wird damit erklärt.

## Offene Geräteprüfung und nächster Schritt

1. App670 auf dem vorgesehenen LCD mit Z21 installieren und danach eine frische Gesamtdiagnose exportieren. Version, App-Zähler, SourceID und EngineID mit diesem Stand abgleichen.
2. Den kurzen read-only Vergleich ausdrücklich starten und den vollständigen JSON-Bericht exportieren. Einzel-/Batch-Ergebnisse und Hashgleichheit prüfen.
3. Erst anhand dieses Gerätereports reale Laufzeiten, schnelle WNR-Folgen, Abbruch und Wiederverbindung bewerten. Die vorliegenden Softwaretests begründen keine weitere vollständige Backupserie und keine behauptete Durchsatzsteigerung.

Der Browser prüft Paketstruktur, Größen und Hashes. Die zusätzliche Signaturprüfung in dieser Qualifikation ist ein Softwarebeleg; die authentische Installation auf dem ausgewählten Gerät erzwingt weiterhin dessen Bootloader. Für öffentliche URLs, den endgültigen Webcommit und den späteren Livestatus gilt die getrennte Auslieferungsquittung.

Die maschinenlesbaren Einzelwerte, Befehle, Quellabweichungen und Hashes aller beigefügten Nachweise stehen in [WEB3_60_0_TEST1.json](WEB3_60_0_TEST1.json).
