# Allmiibo LCD DE3.99 / App672

Normale signierte Anwendung für Allmiibo LCD/ST7567 mit vorhandenem Packed LittleFS (PFS1), Z21 und Nordic S112 7.3.0. Die passende normale Webausgabe ist 3.62.0; ihre Quellen liegen auf `web-app672`.

## Änderungen

Ein Kartenimport kehrt auch nach einem zunächst fehlgeschlagenen Speichervorgang und anschließend erfolgreichem Wiederholen genau einmal zur ausgewählten Karte zurück. Der bestehende Speichern/Wiederholen/Verwerfen-Pfad bleibt erhalten. Abbruch und ein inzwischen gewechselter Bildschirm lösen keine nachträgliche falsche Fortsetzung aus.

PackedFS merkt sich im bereits vorhandenen Zustandsbyte, wenn ein erfolgreicher Bereinigungslauf ausschließlich noch von alten Lesern oder Verzeichnisansichten gehaltene Gruppen gefunden hat. Vor einer folgenden Änderung entfällt dann der unveränderte Vollscan. Neue unvollständige Dateien, Fehler und die letzte Referenzfreigabe aktivieren die Bereinigung weiterhin. Öffentliche Diagnose, Layout, Dateiformate und RAM-Strukturen bleiben kompatibel.

Im Dateimanager verwenden Oberfläche, Python-Controller, Health-Antwort und PowerShell eine gemeinsame Versionsquelle. Die normale Portable-Ausgabe enthält diese Quelle; der zuvor gemessene Launcher-Startfehler wird behoben. Der Akkuverlauf trennt Protokollfenster, aktive Loggerzeit und geschlossene Pausen. Ein Spannungsverlauf wird nicht als Strommessung oder Restlaufzeit ausgegeben.

## Nachgewiesener Nutzen und Speicherbedarf

| Modellbestand | Lesezugriffe App671 | App672 | Verringerung |
| --- | ---: | ---: | ---: |
| 28 Gruppen | 34.828 | 29.815 | 14,394 % |
| 32 Gruppen | 39.838 | 35.032 | 12,064 % |
| 33 Gruppen | 46.843 | 40.911 | 12,664 % |
| 54 Gruppen | 77.847 | 70.664 | 9,227 % |
| 64 Gruppen | 94.246 | 84.989 | 9,822 % |

Verglichen wurden vollständige gleiche Abläufe einschließlich Abbruch, Commit, letzter Referenzfreigabe und abschließender Bereinigung. Die vollständigen 2-MiB-NOR-Endabbilder sind jeweils bytegleich. Alle Dateien und raw128-Metadaten wurden nach Remount geprüft. Programme, Erases, freie Bytes und angeforderter Heap bleiben gleich. Das sind Backend-Leseoperationen im Modell, keine gemessene Beschleunigung am Gerät.

Das BIN umfasst 364.276 Bytes, 96 mehr als App671. Der Linker bestätigt 8.440 Bytes Flashreserve, 1.720 Bytes statischen Abstand zwischen Heap und Stack und 8.192 Bytes reservierten Stack. Die bisherigen Mindestgrenzen 8.192 / 1.536 / 8.192 Bytes bleiben unverändert. Flash und statische RAM-Lücke bieten weiterhin wenig zusätzlichen Spielraum; weitere Funktionen benötigen eine konkrete Budgetprüfung.

## Prüfung

187 von 187 Firmware-Suiten bestehen im abschließenden vollständigen Lauf. Elf gezielte Suiten und der Vergleich der beiden GC-Versionen laufen mit ASan/UBSan. 39 Importfälle umfassen 24 Eingabe-/Slotfälle und 15 gekoppelte Lebenszyklusfälle. Die beiden ursprünglichen Fehlerkontrollen bleiben dokumentiert.

13 Prüfgruppen führen tatsächlich verknüpfte Cortex-M4-Funktionen aus. Der unveränderte, bytegleich reproduzierte Z21 prüft die neue Signatur, den vollständigen BIN-Hash und CRC einschließlich negativer Kontrollen; App672 wird sowohl nach App671 als auch bei leerer Anwendungsbank angenommen. Das native Wiederaufnahmemodell überträgt das vollständige neue BIN nach simulierten Unterbrechungen wieder bytegleich. LSan ist lokal wegen ptrace nicht verfügbar; ASan und UBSan liefen. Auf GitHub bestanden zusätzlich die tatsächlichen App672-Datenstromprüfungen für Z19 und Z21 mit eingeschalteter LSan-Prüfung und erfolgreicher Positivkontrolle ([Lauf 45029329393](https://github.com/bluecyber81/pixl.js/actions/runs/45029329393)). Das ist keine Behauptung eines physischen Unterbrechungstests.

Drei unabhängige isolierte Builds, darunter der abschließende Release-Modus, liefern identische BIN- und HEX-Dateien. Die GitHub-Anwendungsartefakte reproduzieren dieselben Bytes. Die tatsächlichen Prüfsummen, Quellen und vollständigen Logs stehen in [den Nachweisen](validation/DE3_99.json). Ein alter DE2-App-Mock musste an die neue gemeinsame Importfortsetzung angepasst werden; der erste Lauf mit 186/187 bleibt erhalten, danach wurde der gesamte Lauf erfolgreich wiederholt.

## Übernommene Funktionen

Die Änderungen bauen auf dem vollständigen App671-Stand auf. Sammellesen, Digest/CRC, sichere Speicherfehlerbehandlung, temporäre NFC-Daten, Rückkehr nach NFC, Schlafen/Aufwachen, Spiele/Rotation, Remote, Katalog und raw128 bleiben erhalten. Der frühere Vergleich gegen DE3.91 bleibt als eigener Nachweis erhalten. Diese Ausgabe führt keine neue Dateisystemmigration und keine pauschale Datenbereinigung durch. OLED und historische private Dateimanager bleiben separate Quellen und Pakete.

## Installation und verbleibende Beobachtung

Im normalen Dateimanager `Update → LCD DE3.99 / App672` wählen oder `Allmiibo_LCD_DE3_99_672_NUR_APP.zip` unverändert in nRF Device Firmware Update auswählen. Erwartet werden Firmware `2.22.0-DE3.99`, App-Zähler `672` und Dateimanager `3.62.0`. Das Paket aktualisiert ausschließlich die Anwendung. Für das bereits diagnostizierte LCD/PFS1/Z21/S112-7.3.0-Gerät ist keine neue Formatierung erforderlich.

Eine physische App672-Installation ist durch die Softwareprüfungen noch nicht bestätigt. Nach dem normalen Update genügen zunächst Versions-/Diagnoserückmeldung und die übliche Bedienung. Die neu korrigierte Import-Wiederholung kann gezielt beobachtet werden, falls der Fehler natürlich wieder auftritt; kein erzwungener Speicherfehler und keine neue vollständige Backup-/Funk-Testkampagne sind erforderlich. Die tatsächliche Zeitersparnis und der reale Stromverbrauch benötigen getrennte Messungen.

## Veröffentlichte Webausgabe und CI-Testeingänge

Web3.62.0 liegt auf `web-app672` bei `4dfd9dd6cc731a56abe4aa65af273ca499699989`; der Pages-Stand ist `b64dffd59f7e763c57b6a6cb7033c8bd092892fa`. Der ursprüngliche vollständige Qualifikationsstand ist `2f93268192cfebb5bcc2d2efdc030ed171d520c0`; die anschließende Änderung korrigiert ausschließlich die aktuellen Downloadziele und deren Nachweise. Die Linux-Vollsuite meldet lokal 2.115 bestandene Fälle, null Fehler und drei ausdrücklich ausgewiesene Auslassungen. Root- und Pages-Ausgaben bestehen jeweils 50/50 Distributionsprüfungen. Der native Windows-Launcher-Job besteht zusätzlich auf GitHub.

Im ersten Firmware-CI-Lauf bestand der Hosttest 186/187, weil die reduzierte SDK-Testkopie `ble_conn_params.c` nicht exportierte. Der Workflow exportiert diese benötigte Datei jetzt ebenfalls. Alle sechs SDK-Verbraucher der 187 Suiten wurden gegen den echten Tar-Export abgeglichen; die zuvor fehlgeschlagene Suite besteht mit genau dieser reduzierten SDK-Kopie. Der Fehler betraf den Testaufbau, nicht den App672-Programmcode; der erste Lauf bleibt als solcher dokumentiert.

Der tatsächliche Folgelauf [45030117214](https://github.com/bluecyber81/pixl.js/actions/runs/45030117214) besteht vollständig: Application, Z17, Z19, Z20 und Z21; 187/187 Host-Suiten und acht CI-ELF-Gruppen. Der nur manuell angeforderte BL8-Job ist bei Push erwartungsgemäß ausgelassen. Die heruntergeladenen CI-BIN-/HEX-Dateien stimmen bytegleich mit der signierten Anwendung überein. Die 13 lokalen ARM-Prüfgruppen bleiben ein gesonderter Nachweis.

Das [Portable-Paket 3.62.0](https://bluecyber81.github.io/pixl.js/downloads/web3.62.0/Allmiibo_Dateimanager_3_62_0_Portable.zip) wird direkt über Pages ausgeliefert (SHA-256 `96c70b03e5fdd3ad459da0c61eef095edb15cd1941f87403bd4b7a45578e026c`). Das [Quellarchiv des Webzweigs](https://github.com/bluecyber81/pixl.js/archive/refs/heads/web-app672.zip) wird von GitHub bereitgestellt. Damit sind beide Lieferwege unabhängig von einem gesonderten Release-Asset.
