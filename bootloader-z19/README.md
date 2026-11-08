# Allmiibo LCD · Bootloader Z19

Dieser Quellstand erzeugt den Bootloader mit Zähler **19** für das LCD-Allmiibo mit nRF52832 und Nordic S112 7.3.0 (FWID 0x0126). Z19 nimmt den Abschluss einer Datenübertragung erst an, wenn ein gültiger Updateauftrag mit bekannter Bildgröße vorliegt. Nach einem Verbindungsabbruch prüft er den gespeicherten Auftrag erneut. Das Handy kann den vom Gerät bestätigten Stand abfragen und die noch benötigten Daten erneut übertragen.

## Kennwerte des ausgelieferten Z19

| Merkmal | Wert |
|---|---:|
| DFU-Nutzdaten | 26.772 Byte |
| Bootregion | 28.672 Byte |
| Freie Bootregion | 1.900 Byte |
| Reservierter Stack | 4.096 Byte |
| SHA-256 der DFU-Nutzdaten | `5c3eca5391d40677d95d5c256bfcbeb5e0ffdb3e9368408a27e45100738590af` |
| SHA-256 der gepolsterten Bootregion für die Gerätediagnose | `51f47a2fae5739d4a59114f7d84e9da10a3ca140f1a558c44685fbe0d97811fd` |
| SHA-256 der Intel-HEX-Datei einschließlich UICR-Adresswörtern | `e565fbd66bef939f8ca3421277b3006eaad27fa0bd18b8b977d3d72b31193a3f` |

## Nachbauen

Alle Befehle im Verzeichnis `bootloader-z19` starten. `SOURCE_BINDING.json` enthält die SHA-256-Werte der 23 Build-Eingaben. Die Tests und ihre Hilfsdateien sind in `TEST_BINDING.json` erfasst.

```sh
python3 -B build.py --check
python3 -B build.py --stack-report
```

Der zweite Befehl verwendet das in `build.py` per Digest festgelegte Docker-Image und schreibt in das zunächst leere Verzeichnis `_build`. Alternativ lässt sich der Build mit Python ab 3.12 und GNU Make nativ auf Linux ausführen. `TOOLCHAIN` ist der entpackte Arm-GNU-Toolchain-Ordner 12.2.Rel1 für x86_64 und arm-none-eabi. `SDK_ARCHIV` ist die Datei `Nordic_SDK_Buildquellen_17_1_0.tar.gz` aus dem [hashgenauen SDK-Export](../docs/BUILD_DE3_65.md#sdk-archiv-für-den-nativen-build). Der Builder prüft Compiler, SDK-Archiv, Flashadressen und die beiden erwarteten Eigenschaften des fertigen Bootloaders, Größe und Regionshash.

```sh
python3 -B build.py --mode native --toolchain "$TOOLCHAIN" --sdk-archive "$SDK_ARCHIV" --stack-report
```

Der Build erzeugt BIN, Intel-HEX, ARM-ELF (`bootloader.out`), Linker-Map, die tatsächlichen Compiler- und Linkeraufrufe und auf Wunsch `STACK_USAGE.json`. Die nativen und im Container erzeugten BIN- und HEX-Dateien waren bytegleich. GCC meldet im finalen LTO-Build 192 einzelne Funktionsrahmen, der größte hat 528 Byte. Der Spitzenbedarf hängt zusätzlich von Aufrufketten und Interrupts ab.

## Prüfen

```sh
python3 -B tests/run_offline.py --host-only --output _checks/host
python3 -B tests/run_offline.py --arm-only --output _checks/arm
python3 -B tests/run_offline.py --output _checks/komplett
```

Der Hosttest läuft mit GCC, Bash, AddressSanitizer und UndefinedBehaviorSanitizer. Für die ARM-Tests werden außerdem GNU nm, Unicorn 2.x sowie die Z19-ELF und BIN in `_build` benötigt. Jeder Aufruf erwartet ein neues Ausgabeverzeichnis. `RUN_RESULT.json` nennt ausgeführte, ausgelassene und blockierte Gruppen und die verwendeten Prüfoptionen. Der vollständige Rechnerlauf hat alle zehn Gruppen bestanden. Darunter waren Reset- und Sitzungswechsel sowie Display- und Tastenverhalten im Modell.

Für die Übertragung aller App-Bytes durch den regulären Z19-Datenpfad, einschließlich einer modellierten Unterbrechung, zusätzlich verwenden:

```sh
python3 -B tests/test_app_stream_modes.py
python3 -B tests/DFU_Stream/check_app_stream.py --app-only ../fw/releases/Allmiibo_LCD_DE3_66_638_NUR_APP.zip --output _checks/transfer638.json
```

Der erste Aufruf prüft die Meldungen des Testwerkzeugs. Der zweite überträgt die Bytes des signierten Referenzpakets im C-Modell. Der Tester erkennt die signierten Pakete App636, App637 und App638 an den fest hinterlegten ZIP- und Nutzdaten-Prüfsummen. Für andere Builds steht `--test-bin DATEI --expected-sha256 HASH` zur Verfügung. Bei App638 trennt das Modell nach 4.136 Bytes. Der Bootloader meldet den gespeicherten Offset 0. Der Test überträgt alle 362.060 Bytes erneut und vergleicht anschließend Inhalt und CRC mit der signierten Anwendungsdatei. Ein separater Fall prüft die Wiederaufnahme an einer bestätigten Objektgrenze. Funk, MBR-Kopie und Neustart auf realer Hardware erfordern zusätzliche Geräteversuche.

Der Standardlauf bestätigt vorab mit einer Kontrollprobe, dass die Erkennung von Speicherlecks aktiv ist. Kann die Kontrolle nicht laufen, schreibt das Werkzeug `BLOCKED` und das Kontrollprotokoll in die Ergebnisdatei und beendet sich mit Exitcode 2. Für einen getrennten Lauf ohne Leakprüfung `--no-leak-check` und einen neuen Ausgabedateinamen angeben. ASan und UBSan bleiben eingeschaltet, `leakDetectionConfirmed` ist dann `false`. Beide Prüfstarter verlangen Python mit aktiven Prüfanweisungen. Ein Aufruf mit `-O` endet vor dem ersten Test.

Die [Anleitung zum deutschen Bootdisplay](docs/Bootanzeige_DE.txt) beschreibt den historischen separaten Quellvorschlag und seinen Nachbau. Seine Quellen müssen zusätzlich aus dem früheren DE3.65/637-Nachweisarchiv beschafft werden; das aktuelle DE3.66/638-Gesamtpaket enthält dieses optionale ZIP nicht. Die Anleitung nennt den erwarteten Archivhash und die Zuordnung der aktuellen Paketverzeichnisse.
