# Gesamtdiagnose im Dateimanager 3.35.0

Unter **Gerät & Diagnose → Alle Diagnosewerte auslesen** werden die vorhandenen, lesenden Firmwarebefehle nacheinander abgefragt. Danach öffnet **Gesamtdiagnose speichern** einen gemeinsamen JSON-Bericht. Vorschau, Kopieren und Speichern verwenden denselben Bericht; Speichern löst keine zweite Geräteabfrage aus.

Die Erweiterung funktioniert mit DE3.56 ohne neues Flashen. Anwendung, BL8, Nordic S112, Speicherlayout und Figurensammlung werden nicht geändert. Ältere Firmware darf einzelne Befehle als nicht unterstützt melden.

| Abschnitt | Zusätzlicher Nutzen und Grenze |
| --- | --- |
| RAM | Kleinster beobachteter größter freier Block, maximal belegte Nutzdaten und reservierter Stack. Die tatsächliche minimale Stackreserve bleibt unbekannt, wenn die Firmware sie nicht misst. |
| Startzeiten | Alle sechs gespeicherten Phasen im selben Bericht. Bootloader und früher SDK-Start sind nicht enthalten. |
| Bluetooth | Vom Firmware-GATT-Stack gemeldete ATT-MTU und NUS-Wertkapazität. Dies ist keine unabhängige Funkmessung und kein MTU23-Belastungstest. Die Abfrage ändert keine MTU. |
| Speicher | Backend, Einhängezustand, externe Flashgeometrie und Packed-LittleFS-Parameter einschließlich Cachegröße, Metadaten, Grenzen und Engine-Fingerabdruck. Cachegröße ist Konfiguration, keine gemessene Cache-Auslastung. |
| Tasten/Einstellungen | Ereignisse und Warteschlange der letzten Einstellungsmenü-Sitzung. Keine allgemeine Statistik sämtlicher Tastendrücke und kein Nachweis mechanisch fehlerfreier Kontakte. |
| Bootloader, SoftDevice, Akku, Laufwerk | Gemeinsam mit den übrigen Werten abrufbar. Akkudaten stammen aus der gespeicherten Messung; Abrufzeit ist nicht der Zeitpunkt dieser ADC-Messung. |

Jeder Abschnitt enthält einen Lesestatus und einen Abrufzeitpunkt. Nicht unterstützte Werte werden als nicht verfügbar, Fehler als fehlgeschlagen ausgewiesen. Die Abfragen sind aufeinanderfolgende Beobachtungen, keine atomare Momentaufnahme. Bei einem Verbindungswechsel werden alte Ergebnisse verworfen. Eine neue Einzelabfrage verwirft die vorige Gesamtdiagnose; für einen neuen vollständigen Bericht wieder **Alle Diagnosewerte auslesen** verwenden.

Die bekannten lokalen Transportzähler erscheinen zusätzlich im JSON. Der Export enthält ausdrücklich erlaubte technische Felder, keine Bluetooth-Adresse, Gerätenamen, Dateipfade, Notizen, Figureninhalte oder Wiederherstellungs-Archivkennung. Er wird nicht automatisch versendet.

## Für Mitentwickler

- `web/src/lib/device-extra-diagnostics.js`: begrenzte MTUD-/UIDG-Parser und Normalisierung.
- `web/src/lib/pixl.proto.js`: leere INFO-Anfragen 0x05 und 0x04; kein `MTU!`-Schreibbefehl.
- `web/src/lib/diagnostic-snapshot.js`: serielle Sammlung, Sitzungsprüfung, Teilfehler und Export-Feldliste.
- `web/src/components/DiagnosticOverview.vue`: bedarfsgesteuerte Übersicht; keine eigenen Bluetooth-Abfragen oder Hintergrund-Polls.
- `web/src/App.vue`: bestehende Arbeitssperren und Verbindungswechsel, gemeinsame Speichervorschau.

Nicht implementiert sind erfundene Messungen für Cache-Trefferquote, Flash-Verschleiß, Funk-RSSI, NFC-Erfolgszahlen oder Bootloader-Startdauer. Solche Werte benötigen jeweils echte Firmware-Instrumentierung und separate Validierung.
