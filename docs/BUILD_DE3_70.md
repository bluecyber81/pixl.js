# LCD DE3.70 / 642 nachbauen

Aus dem Quellstand dieser Version im Projektverzeichnis ausführen. Das gepinnte Image verwendet Nordic nRF5 SDK 17.1.0 und Arm GNU 12.2.Rel1.

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
python3 tools/build_lcd.py --mode release --stack-report
python3 tools/check_release_ota.py
```

Der Paketvergleich benötigt Python mit cryptography. BIN, HEX, ELF und Linker-Map liegen in `build/lcd-de370/`. Der erwartete SHA-256 des App-BIN lautet `45aa511db37076bf9b0dce6d73c27522407b0234a6de9f38e2ec058aa4d01844`. [Baudaten](validation/DE3_70.json) · [Linux- und SDK-Anleitung](BUILD_DE3_67.md)
