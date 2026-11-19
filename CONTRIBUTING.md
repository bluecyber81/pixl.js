# Contributing

Contributions to this community fork are welcome. Start from `main`; keep a pull
request focused on one reproducible problem. Explain the trigger, the resulting
behavior and how you checked it. Hardware access is not required for a source or
host-test contribution; say clearly which checks were performed on a real device.

## Find the right source

| Area | Source and entry point |
| --- | --- |
| LCD application | [DE3.89 / App662 release sources](fw/application/src/) and [unsigned release builder](tools/build_lcd.py). The [DE3.75 tag](https://github.com/bluecyber81/pixl.js/tree/de3.75/fw/application/src) preserves the archived App648 sources. |
| Storage and capacity simulation | `fw/application/src/mod/vfs/`, `fw/components/littlefs/`; browser adapters and pinned simulators under `web/src/lib/` and `web/third-party/` |
| Browser file manager | [Web sources and build instructions](web/README.md). [Web 3.58.2](https://github.com/bluecyber81/pixl.js/releases/tag/web3.58.2) provides portable and source packages. |
| Firmware host regressions | `fw/tests/de2/` and `fw/tests/de3/`; C harnesses and Python runners |
| Application build and memory layout | `fw/application/Makefile`, `fw/ld/application.ld`, `tools/build_lcd.py` |
| Current Z21 bootloader | [Build and test instructions](bootloader-z21/README.md) and [Z21 and App654 production evidence](docs/validation/DE3_81.json). |
| Earlier Z19 bootloader | [Build and test instructions](bootloader-z19/README.md), including the DFU interruption and resume model. The device reports counter 19. |
| Historical Z17 bootloader | `bootloader-z17/`; source-bound Docker/native build and host/ARM tests; [historical device readback](docs/COMPONENTS.md) |
| Historical BL8 bootloader | [Source binding and separate unsigned build](bootloader-bl8/README.md) |
| Historical releases | Git tags, release assets and dated documentation, including [DE3.37](docs/BUILD_DE3_37.md) |

Release archives and Git tags preserve the source used for a particular build.
The application, Z21, Z20, Z19, Z17 and BL8 each have their own build instructions.
The inherited `fw/bootloader/` and `bootloader-bl6/` trees document earlier
implementations. The device diagnosis reports the installed bootloader counter
and code-region hash. [Component identities and Nordic S112 integration](docs/COMPONENTS.md)

## Web development

Use Node.js **22.12 or newer** and the npm version declared in
`web/package.json` (`11.19.1` for this snapshot). CI selects Node **26.13.0**.
Install Node/npm separately if needed; keep the checked-in lockfile.

```sh
cd web
npm ci
npm test
npm run build
npm run build:pages
npm run dev
```

`npm ci` downloads the locked dependencies. The two builds produce `dist/` and
`dist-pages/`; their post-build commands copy existing license notices and test
the finished bundles. The development server binds to `127.0.0.1:8010`. Normal
tests use synthetic fixtures, mocked Bluetooth and local WASM, not a device.
Windows-specific launcher tests are skipped on other operating systems.

Upload the portable and source ZIPs to the `web3.58.2` release.
Upload the signed LCD application, two-stage Android package and review kit to the `de3.89` release.
The footer and license page link to those release assets. Verify their sizes and SHA-256
after upload. Publish the contents of `dist-pages/` at the root of the `gh-pages`
branch, preserving the test previews, firmware ZIPs and historical download URLs. Compare the published
`firmware/Allmiibo_LCD_DE3_89_662_NUR_APP.zip` with the signed release asset before
using the Android handoff.
Do not publish a source checkout, `node_modules/`, server state or private files.
The CI below tests builds; it does not deploy Pages or create releases.

## Firmware changes and tests

The checked-in LCD sources build DE3.89 / App662. Use the pinned SDK image from the repository root to reproduce the application.

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
python3 tools/build_lcd.py --mode release --output build/lcd-de389
python3 tools/check_release_ota.py --build-dir build/lcd-de389
python3 tools/verify_lcd_combo.py --profile de3.89
```

Compare the application BIN and HEX digests with the published build evidence and the contents of the signed phone ZIP. For intentional firmware changes, use development mode with a distinct version and explicit counter. [App662 build evidence](docs/validation/DE3_89_LCD_TEST1.json) · [Device readback](docs/validation/DE3_89_LCD_READBACK.json) · [Z21 build instructions](bootloader-z21/README.md)

For two quick storage checks from the portable CI subset, install Python
**3.10+** and GCC on the host and run from the repository root:

```sh
python3 fw/tests/de3/test_packed_crc_pair_de355.py
python3 fw/tests/de3/test_lfs_wear_de355.py
```

On Windows use `py -3` or your Python executable and ensure `gcc` is on `PATH`.
These tests need neither the Nordic SDK nor historical local workspace trees.
They compile real production code into temporary native harnesses: paired CRC
outputs are checked against independent oracles, and LittleFS wear behavior is
compared with the previous predicate under simulated NOR and interrupted writes.
The old variant is made only in a temporary directory.

The Linux/WSL helper `tools/run_firmware_tests.py` runs the current full
158-suite firmware matrix from the hash-pinned SDK archive and sets both SDK
path variables for its disposable test copy. Linked Cortex-M4 checks are
separate runs described in the build guide. Each individual runner documents
its dependencies. Publish hardware observations,
such as NFC recognition or behavior during an interrupted radio transfer,
separately from host test results.

The Bluetooth indicator regression is `python3 fw/tests/de3/test_ble_status_de357.py`; `test_ui_comfort_de356.py` retains keyboard/scrollbar coverage. For direct `test_device_info.py` and `test_mtu_diagnostic.py` runs, set `NRF5_SDK_PATH` or `NRF52_SDK_ROOT` to the same matching Nordic SDK 17.1.0 tree. The MTU runner also accepts an explicit `--sdk-root`, which takes precedence; if both environment variables are set, it preserves the existing `NRF52_SDK_ROOT` priority. The device-info test requires the hash-pinned S112 7.2.0 reference from that SDK as a test input; this does not downgrade the device from S112 7.3.0. The MTU runner checks the pinned Nordic GATT source. Missing or mismatched SDK inputs fail explicitly. These SDK-dependent tests are not part of the small portable CI subset.

Changes to the storage core need particular care: retain PFS1 format, Raw128
metadata and migration compatibility unless a deliberate migration is designed.
Run the relevant storage tests and the cross-version harness described in
`web/README.md`. A changed core also requires a matching engine identity and a
separate browser simulation profile; do not silently replace an old profile.

## Pull requests and reports

- Include the application/web version, affected path, reproduction and expected
  behavior. For hardware findings also describe the board/display and storage
  format; a marketing name alone does not identify a board.
- List tests actually run and their results. Keep host, build, browser and device
  evidence separate. A test you could not run belongs in the limitations.
- Use synthetic IDs and generated files in fixtures. Do not attach personal tag
  dumps, backups, UID/device addresses, keys, credentials or browser server state.
- Preserve component licenses and notices. Dependency updates need their lockfile
  and corresponding notices, not only a changed version in `package.json`.
- Keep signing, flashing, formatting, migration and publishing separate from a
  code/build contribution. Do not commit private signing keys.

The [checks workflow](.github/workflows/checks.yml) runs Web tests/builds and the
portable firmware subsets with read-only repository permissions. The separate
[unsigned firmware workflow](.github/workflows/unsigned-firmware.yml) compiles the
LCD application and checks its linked flash and RAM reserves for changes to the
build inputs. Pull requests build candidates. Pushes to main verify the release
hash and signed application package. The same workflow builds Z17, Z19, Z20 and Z21,
runs their host and ARM tests, and exercises interrupted application transfer
with the Z19 model and both DFU stages in the Z20 and Z21 models. Manual runs also rebuild historical BL8.
