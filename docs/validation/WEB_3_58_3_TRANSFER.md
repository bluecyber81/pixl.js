# Dateimanager 3.58.3: Inhaltsprüfung und Download-Warteschlange

Stand: 20. November 2026. Basis: `web-app665-mobile`, Commit
`e2c55cc96a1342a1d15d3fa3d0f8c062d2e5a27d`, Tree
`7b71de226a35f203e0d1fbcc4d794262392ecacd`.

Zielgerät bleibt **LCD / ST7567, Firmware 2.22.0-DE3.92 / App665**.
Die Firmwareproduktion ist an `73df4e3d16f0e51b3bbd3e9bf10387010ed32934`
gebunden; ihr Abschlusscommit ist `05028b679591e3d228f2b43c6057e3905f5cca88`.
Diese Webänderung benötigt kein neues Firmwarepaket. OLED bleibt ein eigener
Kompatibilitätspfad; die passende vollständige Leseprüfung bleibt verfügbar.

## Behobene Probleme

### Kompakte SHA-256-Prüfung bei sicheren Uploads

`App.vue: transfer_adapters()` stellt dem bestehenden `safeUpload()` jetzt
`readFileDigest()` zur Verfügung. Dafür verwendet der Adapter die bereits
implementierte Gerätefunktion `vfs_backup_digest()` mit Kommando `0x21`.
Die Verbindungssitzung wird vor und nach dem asynchronen Aufruf geprüft.

Die Gerätefunktion prüft die erwartete Dateigröße und berechnet SHA-256 über
die frisch gelesenen Dateiinhalte. Bei geeigneter LCD-Firmware, Laufwerk E:
und Dateien bis einschließlich 572 Byte werden 32 Hashbytes zurückgesendet.
Alle bisherigen Prüfpunkte bleiben bestehen: ursprünglicher Inhalt bei
Ersetzungen, Staging-Datei und endgültiger Zielinhalt. Metadatenprüfungen,
Commit-Reihenfolge und Wiederherstellung bleiben unverändert.

Fehlende Unterstützung erlaubt weiterhin das vollständige Rücklesen. Ein
echter Gerätefehler, eine falsche Antwortlänge, eine SHA-Abweichung oder ein
Sitzungswechsel können keinen erfolgreichen Transfer erzeugen. Der direkte
Uploadmodus mit vollständigem Rücklesen wurde nicht geändert.

### Ungültiger Downloadpfad blockiert die Queue nicht mehr

`vfs_process_file_read()` validiert den Pfad vor dessen Verwendung, vor der
Capability-Abfrage und vor dem Öffnen einer Datei. Ein ungültiger Wert wird
über die bestehende Abschlussroutine `entry.finish(error)` beendet.

Vorher konnten insbesondere `null`, `undefined`, Zahlen oder Objekte bereits
beim Zugriff auf `.startsWith()` eine Ausnahme auslösen und die gemeinsame
Datei-Warteschlange belegen. Ein folgender gültiger Download konnte dadurch
hängen bleiben. Ungültige Zeichenketten im kleinen Lesepfad konnten zudem
unnötige Capability-Abfragen auslösen. Die neue Prüfung beendet solche
Aufträge einmalig und lässt Folgeaufträge weiterlaufen. Fremde Dateihandles
werden dabei nicht geschlossen.

## Protokollvergleich, keine Messung der Handygeschwindigkeit

Der Integrationstest verbindet die tatsächlichen App-Methoden, `safeUpload`
und den Produktionsparser aus `pixl.proto.js` mit einer deterministischen
BLE-Gegenstelle. Für eine neue Datei mit 540 Byte und GATT-Kapazität 247 Byte
ergibt sich für die Staging- und Zielprüfung zusammen:

| Messgröße des Tests | Vorher | 3.58.3 |
|---|---:|---:|
| Inhaltsprüfungen | 2 × kleiner Snapshot-Read `0x24` | 2 × SHA-256 `0x21` |
| Inhaltsbytes in Antworten | 1.080 B | 64 B |
| Antwortpakete für den Inhalt | 6 | 2 |
| GATT-Wertbytes einschließlich DF-Header | 1.104 B | 72 B |

In einer frischen Verbindung gab es vorher zusätzlich eine einmalige
Capability-Abfrage `0x22` mit 20 Antwortbytes. Aufgezeichnete Kommandofolge:
vorher `0x22, 0x24, 0x24`, danach `0x21, 0x21`.

Die Inhaltsprüfung benötigt in diesem Beispiel rund **94 % weniger
Antwort-Nutzdaten**. Daraus folgt keine entsprechende prozentuale Verkürzung
der Gesamtübertragung. Schreiben, Verzeichniszugriffe, Metadaten und
Dateisystemarbeit gehören weiterhin zum Ablauf. Es liegt kein neuer
physischer Handy-/BLE-Durchsatztest vor.

## Prüfungen am endgültigen Code

| Prüfung | Ergebnis |
|---|---|
| Vollständige Websuite: `npm test` | 1.880 Fälle, 1.877 bestanden, 3 übersprungen, 0 Fehler |
| Pages-Build: `npm run build:pages` | erfolgreich; 26/26 Produktionsprüfungen bestanden |
| Gebaute Ausgabe | 265 Dateien, 11.728.398 Byte |
| Neue Download-Regressionen | 17 Fälle, in der Vollsuite enthalten |
| Neue App-/Digest-Integrationsfälle | 13 Fälle, in der Vollsuite enthalten |
| Unabhängiger statischer Review | keine konkrete verbleibende Regression im Produktionsdiff gefunden |

Die drei bisherigen Auslassungen sind zwei Windows-spezifische Launcherfälle
und eine optionale historische DE3.17/Recovery575-Fixture. Gezielte Testmengen
sind Teilmengen und werden nicht zur Vollsuite addiert. Physisches Windows,
OLED und die Übertragung am Handy wurden für diese Änderung nicht getestet.

Die neuen Fälle decken unter anderem Ersetzungen mit Metadatenerhalt, ältere
Firmware, OLED, Dateien über 572 Byte, Status 255, echte Gerätefehler,
31-/33-Byte-Antworten, SHA-Abweichungen, Fehler an der endgültigen Zieldatei
und Verbindungswechsel während der Prüfung ab. Die Queue-Fälle prüfen auch
ungültige Aufträge zwischen zwei gültigen Downloads und getrennte Handles.

SHA-256 des endgültigen Webtestlogs:
`3ce88fdd4fbc19609a3cb3063efebdf0be171eb50664c4182fd63b76cafc3a42`.

SHA-256 des Pages-Buildlogs:
`f1421c51a995cf228f7573ee4436f0b88f98d964ccfe22966b7e724d1792c0e7`.

Versionsangaben von Weboberfläche, Diagnosen, Launchern und DFU-Seite sind
auf 3.58.3 abgestimmt. DFU-Übertragungslogik und Firmwarebytes bleiben gleich.
Vorhandene Downloadlinks auf tatsächlich veröffentlichte 3.58.2-Archive
behalten ihre bisherige Versionsbezeichnung.

## Noch am Gerät zu prüfen

1. Einen zusätzlichen, entbehrlichen Testsatz übertragen und Dauer,
   Dateianzahl, Nutzbytes sowie den verifizierten Abschluss festhalten.
2. Für die Sofortfreigabe den freien Speicher vor dem Schreiben, nach dem
   Schreiben und unmittelbar nach dem Löschen dieser Testdateien messen.
   Abschluss abwarten und einen gegebenenfalls offenen alten Leser schließen;
   zwischen den Messungen nicht neu starten. Block- und Metadateneffekte
   berücksichtigen, ohne die bestehende Sammlung umzubauen.
3. Die noch offenen Alltagsproben der Firmware durchführen: Einstellungen
   speichern/verwerfen, Slotnamen und Rückkehr, NFC sowie Schlafen/Aufwachen.

Für eine weitergehende Funkoptimierung wären tatsächliches
Verbindungsintervall und PHY sowie ein reproduzierbarer Durchsatzlauf nötig.
ATT-MTU 250 beziehungsweise GATT 247 allein belegt diese Größen nicht.
Dieses Update ändert keine MTU, RAM-Puffer oder GATT-Parallelisierung.
