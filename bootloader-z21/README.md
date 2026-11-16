# Allmiibo LCD-Bootloader Z21

Z21 zeigt auf dem Allmiibo LCD bei einer fortgesetzten DFU-Übertragung wieder „Receiving...“ an. Ein Handy kann nach einem Verbindungsabbruch das bereits angenommene Init-Paket weiterverwenden. In diesem Fall wechselt die Anzeige beim ersten bestätigten Datenobjekt von „Ready“ auf „Receiving...“. Weitere Objektmeldungen lösen keinen erneuten Bildaufbau aus. Fehlertexte und Abschlussanzeigen bleiben erhalten.

Der Produktionspatch von Review 2 ändert ausschließlich `fw/bootloader/src/main.c`. Der Hash dieser Datei ist `19c0fdd1894d490d49142e20bd19a5273a8cbb4fb4baa558fed1addd7d9b5b7d`. Die gespeicherten Zwischenstände liegen wie in Z20 alle 65.536 Byte. Beide Bootloader verwenden das Nordic-Einstellungsformat 2 und denselben öffentlichen Signaturprüfschlüssel. Die neue signierte Systemphase hat den DFU-Bootloaderzähler 21 und enthält Nordic S112 7.3.0, FWID 0x0126.

## Nachbauen

Der Befehl mit `--prepare` erstellt ein eigenständig baubares Verzeichnis aus den Z21-Änderungen und den gemeinsamen Dateien von Z20 und Z19. Beim Kopieren wird jeder gebundene SHA-256-Wert überprüft. `SOURCE_BINDING.json` bindet die 23 Produktionsdateien und die erwarteten ARM-Bytes. `TEST_BINDING.json` erfasst die Testwerkzeuge und die verwendeten Fixtures. Der gemeinsame Builder stammt aus Z19 und prüft die Bindungen des aktuellen Verzeichnisses.

```sh
python3 -B build.py --prepare /tmp/allmiibo-z21
cd /tmp/allmiibo-z21
python3 -B build.py --check
python3 -B build.py --mode native --toolchain "$ARM_TOOLCHAIN" --sdk-archive "$SDK_ARCHIVE" --stack-report
python3 -B tests/run_offline.py --output _checks
```

Der native Build braucht Arm GNU 12.2.Rel1 und das im Builder festgelegte Nordic-SDK-17.1.0-Archiv. Die Firmware wurde zweimal sauber gebaut. Der BIN-Payload mit 26.932 Byte und das HEX stimmen bei beiden Builds bytegenau überein. Der Bootbereich umfasst 28.672 Byte. Davon bleiben 1.740 Byte frei. Der gepolsterte Bootbereich hat SHA‑256 `d3f9da7c477ce56a38d4458585222bffca793fddf614f54937012e4819d717fb`.

Der Linker reserviert 4.096 Byte Stack. GCC nennt 528 Byte für den größten einzelnen Stackframe. Die tatsächliche Spitzenauslastung mit Aufrufketten und Interrupts ist offen. Der ARM-Test vergleicht den LCD-Bildpuffer einer fortgesetzten mit dem einer frisch gestarteten Übertragung. Bei 101 Objektmeldungen zählt er einen Bildaufbau. Der Streamtest kann die signierte Systemphase separat prüfen.

```sh
python3 -B tests/check_resume.py sd_bl.bin aba8a0bedb8ad8cef3a00cdb865bdaaa8d7af0ed7daef4888c1ec6e4192694d0 system-resume.json
```

Mit den 125.000 Systembytes wurden Unterbrechungen bei 40, 65.576 und 122.920 Byte modelliert. Der jeweils gespeicherte Stand lag bei 0, 65.536 und 65.536 Byte. Der Test vergleicht am Ende alle Daten byteweise. Die Prüfung am echten LCD und ein unterbrochener Handytransfer mit installiertem Z21 stehen aus. Beim ersten Wechsel von Z20 empfängt zunächst Z20 die Systemphase. Erst nach deren Aktivierung läuft Z21.
