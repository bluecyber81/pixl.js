# Allmiibo LCD-Bootloader Z20

Z20 speichert während einer Nordic Secure-DFU-Übertragung alle 65.536 Byte einen vollständigen, bestätigten Datenstand. Auf dem nRF52832 umfasst das 16 Datenobjekte zu je 4.096 Byte. Vor der ersten Grenze beginnt eine unterbrochene Übertragung bei Byte 0. Für das letzte Objekt übernimmt die vorhandene Imageprüfung und Aktivierung.

Der Bootloader wartet auf abgeschlossene Daten-Schreibzugriffe, schreibt die primären DFU-Einstellungen und vergleicht sie nach dem Schreiben mit dem erwarteten Inhalt. Erst danach aktualisiert und prüft er die Sicherungsseite. Diese Reihenfolge hält beim Wechsel der beiden Seiten eine gültige Kopie verfügbar. Die erfolgreiche Execute-Antwort für einen Zwischenstand folgt nach der Prüfung beider Seiten. Wiederholtes Bestätigen eines bereits vollständig gespeicherten Objekts benötigt keine zusätzliche Löschung. Der Client fragt den gültigen Offset und die CRC per SELECT ab.

Die erste Phase eines Upgrades von Z19 empfängt noch Z19. Nach Aktivierung von Z20 gilt das neue Verhalten für die App-Phase und künftige passende Systemupdates. Der DFU-Signaturschlüssel, die Adressen und das Einstellungenformat 2 entsprechen Z19. Das LCD-Board verwendet S112 7.3.0, FWID 0x0126. Der DFU-Bootloaderzähler ist 20.

## Nachbauen und prüfen

`SOURCE_BINDING.json` bindet jede beim Firmwarebuild verwendete Datei. `TEST_BINDING.json` bindet die Dateien der Prüfumgebung. Im Repository liegen die Z20-Änderungen in diesem Verzeichnis. Der Materialisierer ergänzt die gemeinsamen Dateien aus dem benachbarten `bootloader-z19` und prüft ihre SHA-256-Werte. Im vorbereiteten Verzeichnis stehen die kompletten Buildquellen und Tests. Der dortige `build.py` ist der bewährte, in der Bindung erfasste ARM-Builder.

```bash
python3 -B bootloader-z20/build.py --prepare /tmp/allmiibo-z20-source
cd /tmp/allmiibo-z20-source
python3 -B build.py --check
python3 -B build.py --mode native --toolchain "$ARM_TOOLCHAIN" --sdk-archive "$SDK_ARCHIVE" --stack-report
python3 -B tests/run_offline.py --output _checks
```

Der native Build erwartet Arm GNU 12.2.Rel1 und das im Builder festgelegte SDK-17.1.0-Archiv. Den alternativ unterstützten Docker-Build startet `python3 -B build.py --stack-report` im vorbereiteten Verzeichnis. Die Quellen und der Build enthalten den öffentlichen Verifikationsschlüssel.

Den Datenpfad prüft zusätzlich das folgende Kommando mit einem aus einer bekannten Nordic-DFU-ZIP entnommenen BIN. Es prüft den SHA-256 vor dem Lauf und vergleicht die wiederhergestellten Daten Byte für Byte. Das Beispiel verwendet DE3.80/App653.

```bash
python3 -B tests/check_resume.py app_653.bin 34bb85efbf2fc1e5429ce09361aa2b39831d252f9fad80de425c6a992b78cfb8 app-resume.json
```

Beim Test der 362.652 App-Bytes ergaben zwei Linkunterbrechungen und ein simulierter Neustart bei 40, 180.264 und 360.488 Byte die Wiederaufnahme bei 0, 131.072 und 327.680 Byte. Fünf Zwischenstände erforderten zehn zusätzliche Seitenlöschungen, verteilt auf die beiden DFU-Einstellungsseiten. Die Systemphasendaten der Kombi umfassen 124.984 Byte und benötigen einen zusätzlichen Zwischenstand.

Die Streamtests beginnen mit einem angenommenen Init-Paket und modellieren die Funkverbindung, Flashhardware und den Neustart. Die regulären Host- und ARM-Prüfungen decken zusätzlich die Signaturprüfung, Aktivierungsabschluss, LCD-Zustände und Eingaben ab. Ein realer unterbrochener Handytransfer auf einem Z20-Gerät bleibt als eigener Praxistest offen.
