# DE3.65 / 637 aus den Quellen nachbauen

Der gepinnte SDK-Container verwendet Nordic nRF5 SDK 17.1.0 und Arm GNU 12.2.Rel1. Docker, Python 3 und ein schreibbarer Checkout genügen für den Release-Build. Der Build funktioniert offline, sobald das bezeichnete Containerimage lokal vorhanden ist.

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
python3 tools/build_lcd.py --mode release
python3 tools/check_release_ota.py
```

Für den letzten Befehl benötigt Python das Modul `cryptography`. Der Builder erwartet ein neues oder leeres Ausgabeverzeichnis. Mit `--output` lässt sich ein zweiter Build separat ablegen. Die Paketprüfung verwendet den Standardpfad `build/lcd-de365` sowie die in `RELEASE_INFO.json` benannte Anwendungs-ZIP unter `fw/releases`. Der öffentliche Prüfschlüssel stammt aus dem Repository. Der Befehlsablauf signiert und installiert keine Firmware.

Im Ausgabeordner liegen BIN, HEX, ELF (`pixljs.out`), Linker-Map, der Buildbericht, das Protokoll und die Prüfsummen der 699 Produktionseingaben. Das freigegebene App-BIN hat 361.564 Byte und SHA-256 `ad07ceafabfea1071d512ef63414fa553854659326ba70220a36316754a4a298`.

Der native Linux- oder WSL-Pfad akzeptiert über `--backend native --sdk-archive PFAD --toolchain PFAD` das geprüfte SDK-Quellarchiv und das Arm-GNU-Verzeichnis mit seinem Unterordner `bin`. Die genauen Eingabehashes sind im Buildskript hinterlegt. Für weitere Änderungen an der Anwendung dienen `--mode development`, eine im Versionsheader eingetragene neue Kennung und ein neuer Zähler ab 638.

Die 148 Testsuiten lassen sich auf einem eingerichteten Linux- oder WSL-Testsystem wiederholen. Die Prüfung benötigt das im SDK-Archiv enthaltene Nordic-Testmaterial. Die vollständige CI-Umgebung umfasst GCC, ARM-Binutils und Unicorn.

```sh
python3 tools/run_firmware_tests.py --sdk-archive /pfad/Nordic_SDK_Buildquellen_17_1_0.tar.gz --report /tmp/de365-tests.json
python3 fw/tests/de3/check_stack_watermark_elf.py build/lcd-de365/pixljs.out
```

[Änderungen und Installation](RELEASE_DE3_65.md) · [Ergebnisse und Hashes der geprüften Fassung](validation/DE3_65.json)
