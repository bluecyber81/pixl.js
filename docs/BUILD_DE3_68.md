# LCD DE3.68 / 640 nachbauen

Aus dem Quellstand dieser Version im Projektverzeichnis ausführen. Das gepinnte Image verwendet Nordic nRF5 SDK 17.1.0 und Arm GNU 12.2.Rel1.

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
python3 tools/build_lcd.py --mode release --stack-report
python3 tools/check_release_ota.py
```

Der Paketvergleich benötigt Python mit cryptography. BIN, HEX, ELF und Linker-Map liegen in `build/lcd-de368/`. Der erwartete SHA-256 des App-BIN lautet `0cc4aefa5de41fd7b11d8f356ab545414381bdd22c88a5fbdeb53b2f9eb37f02`. [Baudaten](validation/DE3_68.json) · [Linux- und SDK-Anleitung](BUILD_DE3_67.md)
