# Web 3.59.0-test.1 · LCD DE3.96 / App669 TEST1

Stand: 2026-11-21T14:43:41+01:00. Der private Web-Teststand ist lokal vollständig vorhanden. Die erhaltenen Tests sind bestanden; die drei Auslassungen sind unten benannt. **Die physische Geräteabnahme bleibt offen.** Die separate HTTP-/Browserkontrolle wird außerhalb dieses Quellabschlusses geführt.

## Zweck und Abgrenzung

Die Version ergänzt das vorhandene Backup-Profil um datierte Funkbeobachtungen vor und nach einem abgeschlossenen Backup. Das LCD-Testfeld liest zunächst die bestätigte Testfähigkeit und schaltet die Ereignisverlängerung nur auf ausdrücklichen Knopfdruck. Ein erfolgreicher SDK-Aufruf beschreibt eine Konfiguration; daraus folgt kein gemessener Durchsatzgewinn.

Der manuell gestartete 512-Byte-Prüflauf legt einen eigenen neuen Zufallsordner an, schreibt synthetische Daten, liest und vergleicht sie zweimal und entfernt den geprüften Inhalt. Vor dem Schreiben, nach dem Schreiben und nach dem Entfernen wird der freie Platz frisch gelesen. Das Ergebnis unterscheidet die erfolgreiche Entfernung vom Wiedererreichen des ursprünglichen Freiplatzes. Nach Fehlern oder Verbindungswechsel wird nicht automatisch nachgelöscht. Die Leerprüfung vor dem rekursiven Entfernen ist nicht atomar gegen einen weiteren Schreiber; während des Prüflaufs ist ausschließlich diese Dateimanager-Verbindung zu benutzen.

Zusätzlich zeigt der Dateimanager die reine RAM-Diagnose zur PackedFS-Bereinigung und das zusätzliche Profil des letzten echten Mountscans. Die Indexzeit umfasst darin enthaltene Flash-/CRC-Arbeit und darf nicht mit diesen Werten aufsummiert werden. Die Instrumentierung hat selbst Aufwand. Ein einzelner 512-Byte-Vorgang ist kein belastbarer Geschwindigkeitsvergleich.

Die Bereitstellung ist auf `/pixl.js/test/app669/` beschränkt. OLED, bestehender stabiler Katalog und normale Hauptseite werden getrennt behandelt. Dieser Abschluss ändert keine Produktionsdatei und behauptet keine neue Gerätebeobachtung.

## Identität und feste Bindung

| Bestandteil | Wert |
|---|---|
| Webversion | `3.59.0-test.1` |
| Lokaler Arbeitszweig | `work/web-app669-test1` |
| Ausgangscommit | `cbd9f8872842c953dc2601d7f2a330a603bed72b` |
| Firmware / Counter | LCD/ST7567, `2.22.0-DE3.96` / `669`, TEST1 |
| Bootloader / SoftDevice | Z21 / S112 7.3.0 |
| Öffentlicher Firmware-Produktionscommit | `feb6c58ad14998f31aef07dc84d8dc0732e32ede` |
| Öffentlicher Firmware-Validierungscommit | `de9f457fac652153f71dc08243368f6283e1159c` |
| SourceID | `dea06409b9ff20a12f446a7baed683b6442573ed427c5dc87cd4bed2885df858` |
| PFS-Engine | `3574b8ea61e7c1563a77eb806eb2ae1fbe3f2d94196d3a2d72e89ca3a6b3b21d` |
| Anwendung | 363.312 Byte; SHA-256 `32d3a83b0692ea06b65af48c236bcffa4eb3469c0e98e9bb6840965cc1dabb80` |
| Signiertes App-only-ZIP | 363.913 Byte; SHA-256 `021d1a35b00b6cb344702c48df609060e51b55bcecaa9781071d1bcd87829b1f` |
| Kapazitäts-WASM | 64.830 Byte; SHA-256 `d3a2e2d9378440c58051349502c51a7977ef7863d1cb2eec303d002b659a8a56` |
| Simulator-Quellenarchiv | 153.464 Byte; SHA-256 `e135cea2079c45668a0392939dc3cf951b4270e6cdef6dcfe95e21f9211054dc` |

Das signierte Paket enthält nur `manifest.json`, `app_669.dat` und `app_669.bin`. Es ersetzt weder Bootloader noch SoftDevice. Signatur- und Firmwareprüfungen sind in der gebundenen [Firmwarevalidierung](https://github.com/bluecyber81/pixl.js/blob/de9f457fac652153f71dc08243368f6283e1159c/docs/validation/DE3_96_TEST1.md) dokumentiert. Dieser Webabschluss prüft die vorhandenen ZIP-/BIN-Bytes gegen die konkrete Webreferenz und führt die Kryptoprüfung nicht erneut aus.

## Vorliegende Tests und Buildnachweise

| Prüfung | Ergebnis | Erhaltener Nachweis |
|---|---|---|
| Vollständige Websuite | **1.996 von 1.999 bestanden**, 0 Fehler, 3 Auslassungen | [Vollständiger Log](WEB3_59_0_TEST1_evidence/FULL_WEB_TESTS_RETRY_FINAL.log) |
| Finale DFU-/Paketreferenzen | **70/70 bestanden** | [DFU-Log](WEB3_59_0_TEST1_evidence/DFU_REFERENCE_TESTS_FINAL2.log) |
| Isolierte Distribution | **40/40 bestanden** | [Dist-Log](WEB3_59_0_TEST1_evidence/DIST_TEST1_FINAL.log) |
| Speicher-Prüflauf im Modell | **10/10 bestanden** | [Speicher-Testlog](WEB3_59_0_TEST1_evidence/STORAGE_SELF_TEST.log) |
| Kapazität und bisherige Profile | **87/87 bestanden** | [Kapazitätsnachweis](WEB3_59_0_TEST1_evidence/CAPACITY_TESTS.json) |
| Produktionsbuild für den Testpfad | Erfolgreich, einschließlich Dist-Nachprüfung | [Buildlog](WEB3_59_0_TEST1_evidence/BUILD_TEST1_FINAL.log) |

**Diese Zahlen überlappen und werden nicht addiert.** Die zwei Windows-Launcherfälle sind unter Linux ausgelassen; außerdem fehlen die optionalen historischen DE3.17-/Recovery575-Fixtures. Die aktuellen App669-Paketprüfungen sind enthalten und bestanden. Die Logs werden hier bytegleich erhalten. Dieser lokale Abschluss führt keine vollständige Suite und keinen Build erneut aus.

Das neue Kapazitätsprofil bleibt an die konkrete Engine, SourceID und gelinkte ARM-Layoutqualifikation gebunden; die [PFS-Qualifikation](DE3_96_PFS.json) und [sechs synthetischen Cross-Mount-Fälle](DE3_96_CROSS_MOUNT.json) sind enthalten. Der erhaltene Quellenarchiv-Build reproduziert die gleiche WASM. Das Modell misst weder den Geräte-RAM-Verbrauch noch reale freie Bytes oder Funkzeiten.

## Frisch durchgeführter Hash- und Bestandsabgleich

- Alle **268 Dateien** der lokalen Testdistribution stimmen in Größe und SHA-256 mit der lokalen Pages-Kopie `test/app669/` überein.
- Alle **85 öffentlichen Quelldateien** sind bytegleich in dieser Distribution enthalten.
- Signiertes ZIP, eingebettete Anwendungs-BIN, konkrete DFU-Referenz, WASM und Simulatorarchiv stimmen mit den festgehaltenen Größen und Hashes überein. **22** Quell-/Qualifikationsdateien aus dem Simulatorarchiv stimmen bytegleich mit dem aktuellen Arbeitsbaum überein.
- Der [Quellmanifest](WEB3_59_0_TEST1_evidence/SOURCE_SNAPSHOT_SHA256.json) hält 822 aktuelle Web-/Test-/Paket-/Qualifikationseingaben fest; der [Distributionsmanifest](WEB3_59_0_TEST1_evidence/DIST_TEST1_SHA256.json) hält sämtliche Ausgabedateien fest. Beide wurden bei diesem Dokumentationsabschluss aufgenommen. Sie sind kein rückwirkend behaupteter Eingabemanifest vor den früheren Testläufen.
- Die zuvor offenen 91 Pfade und 27 eingebetteten ZIP-Dateien wurden auf Aufgabenbezug und bekannte Zugangsdaten-/Privatschlüsselmuster geprüft. `web/.env` enthält ausschließlich einen öffentlichen Buildtext. Abhängigkeiten, gebaute `dist`-Ordner und Schlüsselmaterial werden nicht in den Webquellcommit aufgenommen. Die vorhandenen Dateien unter `web/tests/dist/` sind ausdrücklich Testquellen.

Die Leerraumprüfung der zuvor versionierten Änderungen ist mit Berücksichtigung bestehender CRLF-Zeilenenden bestanden. Der vollständige Index meldet elf harmlose Leerraumstellen in den unverändert übernommenen Logs, Simulator-/Lizenzdateien und am Ende einer neuen Testdatei. Diese Bytes bleiben für die Nachweisbindung erhalten; keine Produktions- oder Testdatei wurde dafür umgeschrieben. Die genauen Meldungen stehen im frischen Abgleich.

Der [frische Abgleich](WEB3_59_0_TEST1_evidence/LOCAL_HASH_RECHECK.json) beschreibt Umfang und Grenzen. Ein Vergleich mit einer lokalen Pages-Kopie ist keine HTTP-Prüfung. HTTP-, sichtbare UI- und Downloadprüfung standen bei diesem Dokumentationsabschluss noch in Arbeit. Der endgültige lokale Commit und vollständige Änderungsbestand stehen nach dem Commit im separaten Abschlussbeleg; eine selbstreferenzielle Commit-ID wird hier nicht vorgetäuscht.

## Offene Gerätetests und nächster Schritt

1. App669 auf dem LCD/ST7567 starten und eine frische vollständige Diagnose mit Counter, SourceID und Ereignisverlängerung AUS exportieren.
2. Im Testfeld „Teststatus lesen“ und anschließend „512-Byte-Prüflauf starten“ ausführen. Prüfbericht und frische Diagnose aufbewahren; erfolgreiche Entfernung und zurückgewonnenen freien Platz getrennt bewerten.
3. Dieselbe unveränderte Auswahl mit **neuen vollständigen Backups in der Reihenfolge AUS → EIN → AUS** vergleichen. Dafür keine Wiederaufnahme und keine frühere ZIP zur Datenwiederverwendung einsetzen. Gesamtdauer, Phasen, tatsächlich gelesene Bytes, Funkbeobachtungen und Fehler sichern.
4. Trennen/Neuverbinden muss die bestätigte Funkoption erhalten; nach Stack-/Gerätestart muss wieder AUS aktiv sein.
5. Normales Speichern, bewusstes Verwerfen einer gewöhnlichen Änderung, Menürückkehr und Persistenz nach normalem Neustart beobachten. Anschließend längere normale Nutzung und eine neue Diagnose prüfen.

Es werden keine künstlichen Flashfehler, Stromabbrüche oder Vollschreibetests an der Sammlung verlangt. Erst nach den Geräteberichten werden nachgewiesene Verbesserungen für einen normalen Build mit höherem Counter ausgewählt. Allgemeines Transfer-Streaming, neue Mehrdatei-Anfragen oder ein SoftDevice-Wechsel sind durch diese Testversion nicht implementiert.

**Nächster konkreter Schritt:** Die getrennte Live-HTTP-/Browser-/Downloadkontrolle und gemeinsame Übergabe abschließen, anschließend die beschriebenen App669-Geräteberichte auswerten.

Der vollständige strukturierte Nachweis steht in [WEB3_59_0_TEST1.json](WEB3_59_0_TEST1.json).
