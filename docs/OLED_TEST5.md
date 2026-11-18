# Allmiibo OLED DE3.85 Test 5 / App85

[Phone ZIP, German/English guides and review package](https://github.com/bluecyber81/pixl.js/releases/tag/de3.85-oled-t5)

This test application targets the three-button SH1106 OLED, nRF52832, compatible Secure DFU and existing S112 7.2.0 (FWID 0x0103). German and English are included. Existing SPIFFS and native LittleFS are detected without automatic formatting. The application starts at 0x19000; it does not replace the bootloader or SoftDevice. It is not an LCD image.

## Changes / Änderungen

- Remote uses a separate stable Bluetooth address. Its complete NUS service is advertised in the primary packet and the full `Pixl.Remote` name in the scan response. Other modes retain their existing addresses and advertising layouts. Local remote permission still expires at sleep/restart.
- The OLED device test shows the cached BLE startup stage/error when setup fails. These are software observations, not a radio measurement.
- Short Center opens a fixed-pattern contrast comparison: Left selects 5%, Right 100%. Short Center returns to the information page; holding Center exits. The previous contrast is restored on page exit, app termination and sleep. No test level is saved to settings.
- Die Fernbedienung erhält eine eigene Bluetooth-Adresse und anders angeordnete Werbedaten. Das verbessert die Voraussetzungen für eine frische Browsererkennung; der tatsächliche Verbindungsfehler am fremden OLED ist noch nicht reproduziert.
- Unter **Einstellungen → Gerätetest** öffnet Mitte den Kontrasttest. Links wählt 5 %, rechts 100 %. Beim Verlassen gilt wieder der vorherige Wert. Die Prozentzahlen sind Controller-Sollwerte, keine gemessene Helligkeit. Panelspannung und Pumpenregister bleiben unverändert.

Use file manager 3.55.8 or later, Remote control, `Allmiibo DE`. On the OLED, leave File Transfer/AmiiboLink and choose **Settings → Remote → until off**. Select `Pixl.Remote` again in the browser because its address has changed. The device must be awake.

## Rebuild and verification

Use the pinned SDK and ARM GNU Toolchain 12.2.Rel1 supported by `tools/build_lcd.py`. Set `SDK_TAR` and `ARM_TOOLCHAIN` to their locations and add the compiler bin directory to PATH. Build from a fresh checkout of this tag in two separate directories:

```sh
for out in out1 out2; do
    python3 tools/build_lcd.py --board OLED --mode development --version 2.22.0-DE3.85-OLEDt5 --counter 85 --backend native --sdk-archive "$SDK_TAR" --toolchain "$ARM_TOOLCHAIN" --output "$PWD/$out" || exit 1
    python3 tools/check_oled_trial_image.py "$out" --version 2.22.0-DE3.85-OLEDt5 --counter 85 || exit 1
done
python3 tools/check_oled_trial.py out1 out2 Allmiibo_OLED_DE3_85_Test5_APP.zip --trial 5
python3 fw/tests/de3/check_oled_brightness_spi_elf.py out1
python3 fw/tests/de3/check_oled_device_test_elf.py out1
python3 fw/tests/de3/check_build_fault_elf.py out1
python3 fw/tests/de3/check_oled_game_rotation_elf.py out1
python3 fw/tests/de3/run_all.py --profile full --report HOST_TESTS.json
```

The host tests require GCC and `NRF52_SDK_ROOT` pointing to the SDK; the ARM checks require the pinned Unicorn runtime in `tools/ci-unicorn-linux-x64.txt` and ARM binutils. Signature verification requires Python cryptography. These tools are identified by the build reports; no private signing input is distributed.

## Device acceptance still needed

Real OLED discovery/control and display capture, visible 5/100 contrast response/restoration, files, NFC recognition and sleep/resume remain physical tests for an OLED owner. Host and linked-ARM checks do not establish panel luminance, RF reception, battery life or complete hardware acceptance. Earlier owner feedback concerned an earlier OLED trial and is not acceptance of App85.
