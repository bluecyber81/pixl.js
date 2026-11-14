# Browserprüfung des Produktionsbuilds

## Ordnervergleich, PixLink und iPhone ab 3.49.0

Nach `npm run build:pages` lassen sich die folgenden Prüfungen im Ordner `web` wiederholen. Die ersten beiden verwenden Chrome mit einer nachgebildeten Bluetooth-Gegenstelle. Der letzte Befehl benötigt den zur Playwright-Version passenden WebKit-Browser und prüft den Katalog mit iPhone-Bildschirmgröße in Deutsch und Englisch.

```powershell
node scripts/verify-dfu-sync-browser.mjs dist-pages /pixl.js/ vergleich.json --history-only
node scripts/verify-pixlink-browser.mjs dist-pages /pixl.js/
node scripts/verify-webkit-catalogue.mjs dist-pages
```

`verify-apple-bluetooth-browser.mjs` prüft zusätzlich den Hinweis, die Verbindungsschaltfläche und die DFU-Seite mit fünf verschiedenen nachgebildeten Browserprofilen. Als Argument erwartet es die URL der bereitgestellten Seite. Die Bluetooth-Verbindung in Bluefy und die tatsächliche Tastenreaktion unter cylin577 v2.27.11 müssen direkt am jeweiligen Gerät geprüft werden.

`scripts/verify-browser.mjs` lädt den fertigen `dist`-Ordner über einen kurzlebigen
HTTP-Server auf `127.0.0.1` in einem isolierten Headless-Chrome-Profil. Es werden
keine persönlichen Browserprofile geöffnet. Alle externen Netzabrufe werden
blockiert; `navigator.bluetooth.requestDevice` ist durch eine fehlschlagende
Testfunktion ersetzt. Die Zahl solcher Anfragen muss null bleiben.

Voraussetzungen sind die Projektabhängigkeiten, ein vorhandenes Playwright und
ein passender Chromium-/Chrome-Browser. Bestehende Umgebungen können über
`PLAYWRIGHT_MODULE` (absoluter Pfad zu `playwright/index.mjs`) und
`CHROME_EXECUTABLE` wiederverwendet werden. Ohne diese Variablen gelten die
normalen Playwright-Modul- und Browserpfade. Es werden keine Pakete installiert.

```powershell
node node_modules/vite/bin/vite.js build
node scripts/copy-license-notices.mjs root
node scripts/test-production-build.mjs root
node scripts/verify-browser.mjs dist browser-evidence

node node_modules/vite/bin/vite.js build --base=/pixl.js/ --outDir=dist-pages
node scripts/copy-license-notices.mjs pages
node scripts/test-production-build.mjs pages
node scripts/verify-browser.mjs dist-pages browser-evidence-pages /pixl.js/
```

Die Tests verwenden den unveränderten Produktionsbundle. Im Browser werden
synthetische Diagnosezustände eingesetzt und ausschließlich die Methoden an der
Ordnerlesegrenze simuliert. Produktionshandler, Schaltflächen, Guard-Bedingungen,
Übersetzungen und Layout bleiben aktiv. Das lokale DFU-Paket wird vom echten
ZIP-/SHA-Prüfpfad eingelesen; die Geräteauswahl wird nicht ausgelöst.

Geprüft werden RAM-Stichprobenzahl 0/1/unbekannt, englischer Sprachfallback,
Mountdetails, laufende und fehlgeschlagene Diagnose, Laufwerksauswahl direkt in
der Sicherung, laufendes/erfolgreiches/fehlgeschlagenes Öffnen sowie ein gültiges
und ein ungültiges Anwendungs-DFU-Paket. Das Z18-Rückkehrprofil wird ausdrücklich
als unveränderter Z15-Code mit Zähler 18 dargestellt. Desktop: 1440×1000; Mobil: 390×844.

`browser-evidence.json` enthält Browserfassung, Prüfungen, Browserfehler und
SHA-256 aller Builddateien und Screenshots. Damit lässt sich feststellen, welcher
Build tatsächlich dargestellt wurde. Die Screenshots werden zusätzlich visuell
kontrolliert. Ein neuer Build braucht einen neuen Durchlauf, auch wenn nur
Firmware-Metadaten geändert wurden.

Diese Prüfung ist keine Bluetooth-, Flash-, NFC-, Tasten-, Speicherhaltbarkeits-
oder Hardwareprüfung. Auch die erfolgreiche lokale Prüfung einer Firmware-ZIP
bestätigt keine Installation und keine Kompatibilität eines ausgewählten Geräts.

## Ordnersicherung nach Browserneustart

Führe aus dem Verzeichnis `web` folgenden Test mit Playwright und Chrome aus.

```powershell
node scripts/verify-stored-backup-browser.mjs
```

Der Test startet Chrome mit einem eigenen temporären Profil, liest feste Testdateien
und öffnet das Profil nach einem vollständigen Browserneustart erneut. Er vergleicht
die wiederaufgenommene ZIP mit einer frisch erstellten Referenz. Er kontrolliert
geänderte, neue und entfernte Dateien, die Bindung an Gerät, Ordner, Firmware und
Namenmodus sowie gleichzeitige Zugriffe aus zwei Tabs. Er erzwingt einen
Transaktionsabbruch und einen Speicherplatzfehler und verändert gespeicherte
Prüfdaten. Diese Fälle prüfen das Verhalten der Webanwendung bei den jeweiligen
Fehlern. Die Bluetooth-Gegenstelle und die Dateien sind synthetisch.

Die Prüfung in `scripts/verify-collection-tools-browser.mjs` bedient zusätzlich
die Schaltflächen des gebauten Dateimanagers. Sie aktiviert die lokale Ablage,
speichert die ZIP, lädt die Seite neu, verbindet das Testgerät erneut und verwirft
den Zwischenstand. Für den Gerätetest auf Windows oder Android sind die tatsächlich
eingesetzten Browser- und Dateimanagerversionen und der erfolgreiche ZIP-Download
nach dem Neustart separat festzuhalten.

Am 8. November 2026 bestand zusätzlich ein Lesetest mit Windows-Chrome, einem
echten Allmiibo und einer Windows-BLE-Lesebrücke. Nach dem vollständigen
Browserneustart und erneutem Verbinden bestätigte das Gerät eine zuvor gelesene
540-Byte-Datei. Beide Dateien der ZIP stimmten per CRC, SHA-256 und
Referenzvergleich überein. Der Test schrieb keine Daten auf das Gerät. Die
Wiederaufnahme nach einem vollständigen Chrome-Neustart auf einem echten
Android-Handy steht noch aus.
