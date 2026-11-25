# LCD DE4.2-b2 / App680

This application-only prerelease is for the LCD/ST7567 board with existing PFS1 storage, Z21 and S112 7.3.0. The stable LCD release is DE4.1/App678. The compiled application sources are in `fw/`. This update uses a parent-directory filter for lookup and writes an existing manifest in one LittleFS commit; on a full device the firmware verifies which generation was published before retrying. The same PFS1 format can still be read with App679.

## Rebuild

On Linux, check out this tag with original line endings. The SDK 17.1.0 export recipe and Arm GNU 12.2.Rel1 toolchain pins are documented in [the build guide](BUILD_DE3_67.md). Set `SDK_TAR` and `ARM_TOOLCHAIN` to the pinned SDK archive and compiler directory.

```sh
python3 -B tools/build_lcd.py --mode preview --backend native --sdk-archive "$SDK_TAR" --toolchain "$ARM_TOOLCHAIN" --output build/app680
python3 -B tools/check_release_ota.py --preview --build-dir build/app680
python3 -B fw/tests/de3/run_all.py --minimum-suites 199 --report build/app680/host-suites.json
```

The first command rebuilds the unsigned application and checks its SHA-256 and source fingerprint against the release manifest. The second checks the original signed OTA and compares it to the rebuilt application. Identical application BIN and HEX were obtained in two independent native builds. The package carries only `app_680.bin`, `app_680.dat` and the DFU manifest.

## Validation

A Windows Chrome transfer on one LCD acknowledged 364,464 application bytes in 50.223 seconds through the final Execute response. After restart the device reported App680 and the matching compiled SourceID and storage-engine identity. The 13-file upload was measured twice and every file was read back. The 1,081-file round trip was also verified in the flash model. A full 1,081-file over-the-air timing and an interrupted physical DFU remain open.

See [the verification evidence](validation/DE4_2_B2_APP680.json) and [all 722 production input hashes](validation/DE4_2_B2_APP680_production_inputs.json).
