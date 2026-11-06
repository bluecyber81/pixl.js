# Browserprüfung des Produktionsbuilds

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
