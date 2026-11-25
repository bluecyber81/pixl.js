# DE4.2 – LCD App680

DE4.2 is the normal LCD release of the previously tested App680. The signed application reports `2.22.0-DE4.2-b2` and counter `680`. Its signature, application bytes and production inputs are identical to those published in the [App680 test release](https://github.com/bluecyber81/pixl.js/releases/tag/de4.2-b2-lcd-transfer-test). Devices already running that build have the final firmware installed.

## Handy-Download und Geräteprüfung

Für ein Allmiibo mit LCD/ST7567, PFS1, Bootloader Z21 und Nordic S112 7.3.0 ist **Allmiibo_LCD_DE4_2_App680_NUR_APP.zip** die signierte App-Datei. Die ungeöffnete ZIP in der DFU-App am Handy auswählen. Die ZIP aktualisiert die Anwendung. Die vorhandenen Systemkomponenten und das Laufwerk E bleiben erhalten. SHA-256 der ZIP: `4348e1757224b076064039feda58b86329b4db0d84681f15fcb22918f148f7ca`.

Nach der Installation meldet „Gerät & Diagnose“ die Firmware `2.22.0-DE4.2-b2`, App680 und als Baukennung `16425b76fc84dc65bd9893d1d8337741abbf0fa8e4fc1aa3545183fb57fe600e`. Auf einem LCD wurden Flashen, Neustart, Baukennung, Speicher-Engine und Dateiübertragung geprüft. Der Besitzer bestätigte den Stand als final. Das Archiv **Allmiibo_LCD_DE4_2_App680_Pruefpaket.zip** enthält BIN, HEX, Prüfsummen und Buildinformationen für die unabhängige Prüfung am Rechner.

## Reproduce on Linux

Check out the [de4.2 source tag](https://github.com/bluecyber81/pixl.js/tree/de4.2) with original Git line endings. The production-input commit is `e6dc031f206ce0d545111ad9f952bc3da4aaaee9`. Obtain the pinned Nordic SDK export and Arm GNU 12.2.Rel1 compiler using [the build guide](BUILD_DE3_67.md). Keep the application Makefile's per-object optimization and LTO settings. Set `SDK_TAR` to the SDK tar archive and `ARM_TOOLCHAIN` to the compiler root. Use Python with the cryptography dependency for OTA verification.

```sh
python3 -B tools/build_lcd.py --mode release --backend native --sdk-archive "$SDK_TAR" --toolchain "$ARM_TOOLCHAIN" --output build/lcd-application
python3 -B tools/check_release_ota.py --build-dir build/lcd-application
python3 -B tools/test_normal_release_identity.py
```

The following host tests use the SDK headers and tools described in the [project CI workflow](../.github/workflows/unsigned-firmware.yml).

```sh
python3 -B fw/tests/de3/run_all.py --minimum-suites 199 --report build/lcd-application/FIRMWARE_TESTS.json
```

The build verifies 722 production input hashes, the engine identifier and linker reserves. The OTA verifier checks the ECDSA-P256 signature against the Z21-bound public key, payload bytes, application counter, SoftDevice requirement, lengths and the identical normal web download. Only the app is distributed in the flashable ZIP. The separate review archive contains the Intel HEX, raw BIN, build results, source hashes and notices.

On one LCD Windows Chrome received the final DFU Execute acknowledgement after 50.223 s for 364,464 bytes. The device reported App680, the expected SourceID and the expected storage engine after restart. The 1,081-file test includes remount and byte checks in the native flash model. A full radio timing for that folder, interrupted DFU on physical hardware and an on-device hash of the complete running application are open. See [the release evidence](validation/DE4_2.json) and [the production-input hashes](validation/DE4_2_B2_APP680_production_inputs.json).
