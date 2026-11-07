# DE3.66 / 638 aus den Quellen nachbauen

Der gepinnte SDK-Container verwendet Nordic nRF5 SDK 17.1.0 und Arm GNU 12.2.Rel1. Docker, Python 3 und ein schreibbarer Checkout genügen für den Release-Build. Der Build funktioniert offline, sobald das bezeichnete Containerimage lokal vorhanden ist.

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
python3 tools/build_lcd.py --mode release
python3 tools/check_release_ota.py
```

Für den letzten Befehl benötigt Python das Modul `cryptography`. Der Builder erwartet ein neues oder leeres Ausgabeverzeichnis. Mit `--output` lässt sich ein zweiter Build separat ablegen. Die Paketprüfung verwendet den Standardpfad `build/lcd-de366` sowie die in `RELEASE_INFO.json` benannte Anwendungs-ZIP unter `fw/releases`. Die Paketprüfung verwendet den öffentlichen Schlüssel des Z19 und gleicht die Schlüsselquelle und den erwarteten Bootbereich mit seiner Quellbindung ab. Der Befehlsablauf signiert und installiert keine Firmware.

Im Ausgabeordner liegen BIN, HEX, ELF (`pixljs.out`), Linker-Map, der Buildbericht, das Protokoll und die Prüfsummen der 699 Produktionseingaben. Das App-BIN der Testversion hat 362.060 Byte und SHA-256 `26c3ad95953ae4df204fe7de93b68423f1d5f1c0bb7581663afb52e795932ef3`.

Der native Linux- oder WSL-Pfad akzeptiert über `--backend native --sdk-archive PFAD --toolchain PFAD` das geprüfte SDK-Quellarchiv und das Arm-GNU-Verzeichnis mit seinem Unterordner `bin`. Die genauen Eingabehashes sind im Buildskript hinterlegt. Für weitere Änderungen an der Anwendung dienen `--mode development`, eine im Versionsheader eingetragene neue Kennung und ein neuer Zähler ab 639.

Die 149 Testsuiten lassen sich unter Linux oder WSL mit Python ab 3.12 wiederholen. Der unten genannte Starter benötigt das im SDK-Archiv enthaltene Nordic-Testmaterial, GCC, den Cross-Compiler `arm-linux-gnueabihf-gcc` und Unicorn. Für die ELF-Prüfung gehören die ARM-Binutils in den Suchpfad.

```sh
python3 tools/run_firmware_tests.py --sdk-archive /pfad/Nordic_SDK_Buildquellen_17_1_0.tar.gz --report /tmp/de366-tests.json
python3 fw/tests/de3/check_stack_watermark_elf.py build/lcd-de366/pixljs.out
```

[Änderungen und Installation](RELEASE_DE3_66.md) · [Ergebnisse und Hashes der geprüften Fassung](validation/DE3_66.json)

## SDK-Archiv für den nativen Build

Unter Linux oder WSL erzeugt folgender Befehl aus dem oben genannten Containerimage das SDK-Archiv für die nativen App- und Bootloader-Builds und die vollständigen Firmwaretests. In einem neuen Arbeitsverzeichnis ausführen.

```sh
docker run --rm --network none --entrypoint tar \
  solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16 \
  --sort=name -C /opt/nRF5_SDK_17.1.0_ddde560 -czf - \
  components external modules integration config license.txt > Nordic_SDK_Buildquellen_17_1_0.tar.gz
echo 'f726a4e717a0d8e00fe3de9f1e76b19a0c9646291de00097a75cda44c4bcd6d6  Nordic_SDK_Buildquellen_17_1_0.tar.gz' | sha256sum -c -
```

Beim Nachbau am 7. November 2026 ergab das 51.183.174 Byte mit der angegebenen Prüfsumme. Für den Compiler erwartet der native Build Arm GNU 12.2.Rel1. Die Toolchain liegt im selben Image unter `/opt/arm-gnu-toolchain-12.2.rel1-x86_64-arm-none-eabi`.
