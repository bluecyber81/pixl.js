# Build the DE3.58 LCD application

The current `fw/` tree contains **2.22.0-DE3.58 / application counter 630**.
The release uses the established non-LTO compiler profile. The generated game-link
table shares identical English, Chinese and Italian note sets. Personal tag files
and all three source translations retain their existing formats.

Its entry point is `fw/application/src/main.c`; build rules are in
`fw/application/Makefile`. Generated fonts, translations, catalogue data and
required vendored libraries are included. This guide builds the nRF52832 LCD
application for **Packed LittleFS PFS1**. It does not build or install BL8 or S112.

## Prerequisites

- Python **3.10+**; the helper uses its standard library.
- Docker CLI with a working x86-64 Linux container engine.
- The exact SDK/compiler image below. Review the Nordic SDK terms before use.
  The full SDK is external and is not redistributed in this tree.

Fetch the image separately:

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
```

The image provides Nordic nRF5 SDK **17.1.0**, GNU Arm Embedded **12.2.Rel1**
and Make. No separate host ARM toolchain, full SDK copied into `fw/`, or
private signing key is needed. The inherited Dockerfile is a recipe, not a
substitute for the pinned image digest.

## Unsigned release rebuild

Run from the repository root:

```sh
python3 tools/build_lcd.py --mode release
```

On Windows use `py -3` or your Python executable. Optional `--jobs 4` limits
compiler parallelism. Preserve previous results before rerunning: the helper
requires an empty **`build/lcd-de358/`**.

The helper archives application sources, excludes keys/build products and
unused SDK/PC-tool trees, and unpacks them at `/work` in a disposable container.
It uses `--pull never` and `--network none`, applies the pinned SDK correction
below, preserves `fw/application/src/version.inc.h`, and invokes:

```sh
make -C fw/application -j8 pixljs BOARD=LCD RELEASE=1 APP_VERSION=2.22.0-DE3.58 APP_VERSION_NUM=630
```

The build uses `SOURCE_DATE_EPOCH=1793750400` and the source header's
`unknown` / `source-archive` identity dated `2026-11-04`. Regenerating that
header from a later commit changes the release identity and binary.

Release mode compares the application BIN with the pinned SHA-256 in
`tools/build_lcd.py`; a mismatch fails before firmware artifacts are exported.
The published application hash is also recorded in [RELEASE_INFO.json](../RELEASE_INFO.json).
Use the release asset `SHA256SUMS.txt` for download checksums; the signed OTA ZIP
hash is different from the application BIN hash.

On success, `build/lcd-de358/` contains `pixljs.bin`, application-only
`pixljs.hex`, `pixljs.out`, `pixljs.map`, `build.log` and
`BUILD_RESULT.json`. The report binds source, image, SDK override and output
hashes. This route does not reproduce OTA ZIP signatures/metadata, flash,
format, or establish physical device compatibility.

## Nordic header correction

`tools/sdk-overrides/nrf_nvic.h` retains Nordic's license. Only the disposable
SDK's `components/softdevice/s112/headers/nrf_nvic.h` is replaced:

| Header | SHA-256 |
| --- | --- |
| Original in pinned SDK | `4505df359460dc12df197ab00cb523c0eb3214f379e1a0c24ae3bdc2070ea210` |
| Corrected header | `555417cf107cab5569878ee4f8b1d91e783b55dddc7e2900e204f624e107d7ef` |

This is the **DRGN-10613** MWU IRQ-mask workaround documented in the
[S112 known issues](https://www.nordicsemi.com/Products/Development-software/S112/Download):

```c
#define __NRF_NVIC_SD_IRQS_1 ((uint32_t)(1U << (MWU_IRQn - 32)))
```

It does not replace a host SDK or the installed SoftDevice. BL8 and unchanged
Nordic S112 7.3.0 are separate runtime components.

## Development and tests

For a deliberate source change, set `VERSION` in
`fw/application/src/version.inc.h` to a distinct development version. With
an empty output directory, run for example:

```sh
python3 tools/build_lcd.py --mode development --version 2.22.0-DE3.58-dev1 --counter 631
```

Development mode requires an explicit counter of at least 631 and does not
require release binary equality. This example does not reserve a release
counter or authorize installation; inspect the actual target and coordinate
counters before packaging. Regenerate resources only when their inputs change.

Keep the application region `0x19000..0x73fff` (372,736 bytes) and review the
actual linker map/size report. The application heap pool is 18,432 bytes,
not the full 64-KiB hardware RAM. Compilation does not measure stack watermark,
radio behavior or startup time.

[CONTRIBUTING.md](../CONTRIBUTING.md) documents portable host and Web tests.
The Bluetooth indicator regression is `fw/tests/de3/test_ble_status_de357.py`;
`test_ui_comfort_de356.py` retains keyboard/scrollbar coverage. The separate
`test_device_info.py` requires hash-pinned SDK 17.1.0/S112 7.2.0 reference input
via `NRF5_SDK_PATH` or `NRF52_SDK_ROOT`; it does not install that old stack.
Historical workspace helpers in the archive are not standalone contributor
entry points. Use `tools/build_lcd.py` for the application here.

## Packaging and storage compatibility

An unsigned binary is not a Secure DFU installable ZIP. Signing requires a key
accepted by the installed bootloader and a separate package review. An arbitrary
new key cannot create compatibility; the inherited public key does not prove
exclusive publisher identity. Do not publish private keys.

The inherited `fw/Makefile` disables default/all/OTA entry points for this
custom build. Older full-system recipes and upstream build guides are not the
current release process. DE3.58 preserves the DE3.55 storage engine and PFS1
layout. Existing compatible PFS1 devices need no format or restore.
SPIFFS and ordinary upstream LittleFS still require an explicit migration;
building/flashing this application does not convert their collections.
