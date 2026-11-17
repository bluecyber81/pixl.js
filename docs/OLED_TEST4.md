# Allmiibo OLED DE3.84 Test 4

The application targets the three-button SH1106 OLED, nRF52832, Secure DFU and S112 7.2.0 (FWID 0x0103). The OTA application counter is 84. Existing SPIFFS and native LittleFS volumes are supported. The OLED application starts at 0x19000. See the [phone ZIP and German/English instructions](https://github.com/bluecyber81/pixl.js/releases/tag/de3.84-oled-t4).

Der Gerätetest, alle vier Spiele und die Fernbedienungsdiagnose sind für das OLED angepasst. Dieser Teststand benötigt noch eine Rückmeldung von einem OLED-Besitzer. Die früher gemeldete allgemeine Funktion betraf Test 1.

## Rebuild and verify

Use a fresh checkout of this tag, the SDK archive and Arm GNU Toolchain 12.2.Rel1 supported by `tools/build_lcd.py`. Set `SDK_TAR` and `ARM_TOOLCHAIN` to their paths and put the compiler's bin directory on PATH. Run the following from the repository root. Use separate clean build directories.

```sh
for out in out1 out2; do
    python3 tools/build_lcd.py --board OLED --mode development --version 2.22.0-DE3.84-OLEDt4 --counter 84 --backend native --sdk-archive "$SDK_TAR" --toolchain "$ARM_TOOLCHAIN" --output "$PWD/$out" || exit 1
    python3 tools/check_oled_trial_image.py "$out" --version 2.22.0-DE3.84-OLEDt4 --counter 84 || exit 1
done
python3 tools/check_oled_trial.py out1 out2 Allmiibo_OLED_DE3_84_Test4_APP.zip --trial 4
python3 fw/tests/de3/check_build_fault_elf.py out1
python3 fw/tests/de3/check_oled_game_rotation_elf.py out1
python3 fw/tests/de3/check_display_profile_elf.py out1/pixljs.out out1/pixljs.bin --board OLED
python3 fw/tests/de3/test_oled_device_test.py
python3 fw/tests/de3/test_oled_storage.py --sanitize
```

The two BIN and HEX outputs are checked byte for byte. The package check validates the application against its production sources and verifies the signature, target, version counter, required SoftDevice, flash bounds and payload. The Cortex-M4 and host tests exercise rendering, input, BLE serialization and storage. The OLED panel, NFC recognition, a real BLE connection, sleep/wake and interrupted DFU require a physical device.
