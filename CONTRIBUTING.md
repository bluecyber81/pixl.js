# Contributing

Contributions to this community fork are welcome. Start from `main`; keep a pull
request focused on one reproducible problem. Explain the trigger, the resulting
behavior and how you checked it. Hardware access is not required for a source or
host-test contribution; say clearly which checks were performed on a real device.

## Find the right source

| Area | Source and entry point |
| --- | --- |
| Current LCD application | `fw/application/src/`, currently **2.22.0-DE3.62 / 634**; [unsigned build guide](docs/BUILD_DE3_62.md) |
| Storage and capacity simulation | `fw/application/src/mod/vfs/`, `fw/components/littlefs/`; browser adapters and pinned simulators under `web/src/lib/` and `web/third-party/` |
| Browser file manager | `web/`, currently **3.38.0**; [web README](web/README.md) |
| Firmware host regressions | `fw/tests/de2/` and `fw/tests/de3/`; C harnesses and Python runners |
| Application build and memory layout | `fw/application/Makefile`, `fw/ld/application.ld`, `tools/build_lcd.py` |
| New Z17 bootloader candidate | `bootloader-z17/`; source-bound Docker/native build and host/ARM tests; physical test pending |
| Matching BL8 bootloader | `bootloader-bl8/`; [source binding and separate unsigned build](bootloader-bl8/README.md) |
| Historical releases | Git tags, release assets and dated documentation, including [DE3.37](docs/BUILD_DE3_37.md) |

The current application is ordinary editable C source in this repository, not
only a release ZIP. Release archives provide a fixed corresponding-source copy.
The `fw/bootloader/` and `bootloader-bl6/` trees have separate history; the historical
BL8 source is in `bootloader-bl8/`; the new Z17 candidate source is in `bootloader-z17/`. Building the application does not build or
install BL8 or Nordic S112. Do not infer an installed bootloader from a source
checkout.

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

For Pages, only the contents of `dist-pages/` belong in the publication branch.
Do not publish a source checkout, `node_modules/`, server state or private files.
The CI below tests builds; it does not deploy Pages or create releases.

## Firmware changes and tests

Follow [BUILD_DE3_62.md](docs/BUILD_DE3_62.md) to reproduce the unsigned LCD
application. No signing key is required. The current release helper preserves
generated resources and the version header. For an intentional change, use its
development mode with a distinct version and explicit counter.

For the small portable host set used by CI, install Python **3.10+** and GCC on
the host, then run these commands from the repository root:

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

These two suites are a useful CI subset, **not the full 136-suite DE3.55 release
matrix**. Other runners document their own dependencies; some require the Nordic
SDK, sanitizers or ARM Linux/QEMU. The published validation summary describes
release evidence separately. Do not disable a failing assertion, drop older
tests or claim a host result proves NFC, radio timing or physical power-loss
behavior.

The Bluetooth indicator regression is `python3 fw/tests/de3/test_ble_status_de357.py`; `test_ui_comfort_de356.py` retains keyboard/scrollbar coverage. For `test_device_info.py`, set `NRF5_SDK_PATH` or `NRF52_SDK_ROOT` to a matching Nordic SDK 17.1.0 tree. It requires the hash-pinned S112 7.2.0 reference from that SDK as a test input; this does not downgrade the device from S112 7.3.0. Missing or mismatched SDK inputs fail explicitly. This test is not part of the small portable CI subset.

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
hash. A manual run also rebuilds BL8 from its corresponding sources.
