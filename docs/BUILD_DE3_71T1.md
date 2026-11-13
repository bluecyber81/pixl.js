# LCD DE3.71t1 / App644 reproduzieren

Den Quellstand des Tags `de3.71t1` verwenden. Benötigt werden Python 3, Docker und für die OTA-Prüfung das Python-Paket `cryptography`. Der Build nutzt das festgelegte Nordic nRF5 SDK 17.1.0 und Arm GNU 12.2.Rel1.

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
python3 tools/build_lcd.py --mode release --stack-report
python3 tools/check_release_ota.py
```

Die Ausgaben liegen in `build/lcd-de371t1/`. Die Firmware-BIN hat 363292 Byte und SHA-256 `fbade80d03a44a3bb3bb7e76df422b24a879d2ff81b433e6bf4f6d6e1b955273`. Ihre eingebettete Source-ID lautet `3c62a24a8aecab7a81af6b73cb86642d4a248755d739c5e37b1fcdeea7451d02`. Der OTA-Vergleich prüft das mitgelieferte App-Update gegen die erzeugten Bytes und den öffentlichen Z19-Schlüssel. Für diesen Vergleich wird kein privater Schlüssel gebraucht.

[Linux-Buildumgebung](BUILD_DE3_67.md) · [Getrennte Firmware- und Gerätetests](RELEASE_DE3_71T1.md) · [GitHub Actions](https://github.com/bluecyber81/pixl.js/actions/workflows/unsigned-firmware.yml)
