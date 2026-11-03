# Build the DE3.55 LCD application

The current `fw/` tree contains the application source for
**2.22.0-DE3.55 / counter 627**. The entry point is
`fw/application/src/main.c`; application build rules are in
`fw/application/Makefile`. Generated fonts, translations, catalogue data and
required vendored libraries are included. This guide builds the matching
nRF52832 LCD application for **Packed LittleFS PFS1**.

A fresh public-checkout rebuild on **3 November 2026** reproduced the DE3.55
application BIN, HEX, ELF and linker map byte for byte. The
[validation summary](validation/DE3_55.json) records the evidence and its limits.
That equality does not establish compatibility with another board or storage
format, and is not a device test.

## Prerequisites

- Python **3.10+**. The build helper uses only its standard library.
- Docker CLI with a working x86-64 Linux container engine.
- The exact SDK/compiler image below. Review the Nordic SDK terms before using
  it; the complete Nordic SDK is external and is not redistributed in this tree.

Fetch the image as a separate setup step:

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
```

The image supplies Nordic nRF5 SDK **17.1.0**, GNU Arm Embedded **12.2.Rel1**,
Make and the associated tools. A separate host ARM toolchain, a full SDK copied
into `fw/`, and private signing keys are not needed for this route. The inherited
Dockerfile is a recipe, not a substitute for the pinned image digest.

## Reproduce the release without signing

From the repository root:

```sh
python3 tools/build_lcd.py
```

On Windows use `py -3 tools/build_lcd.py` or your Python executable. Optional
`--jobs 4` limits compiler parallelism. Preserve previous results before another
run: the helper requires an empty **`build/lcd-de355/`**.

The helper archives the application sources, excludes keys/build products and
unused third-party SDK/PC-tool trees, and unpacks them at `/work` in a disposable
container. It uses `--pull never` and `--network none`, applies the checked SDK
header correction below, preserves `fw/application/src/version.inc.h` and runs:

```sh
make -C fw/application -j8 pixljs BOARD=LCD RELEASE=1 APP_VERSION=2.22.0-DE3.55 APP_VERSION_NUM=627
```

`SOURCE_DATE_EPOCH=1793577600` fixes the release environment. The archived header
records `unknown` / `source-archive` and the build date `2026-11-02`; replacing it
with the later publication commit would change the binary. Do not run version
regeneration for a byte-identical release rebuild.

The release helper requires this application BIN SHA-256 and fails without
exporting firmware artifacts if it differs:

```text
e80712735b8076b2d97e0b5fac42ef1c5311d40eeb53725be6232db172c0453d
```

On success, `build/lcd-de355/` contains `pixljs.bin`, application-only
`pixljs.hex`, `pixljs.out`, `pixljs.map`, `build.log` and `BUILD_RESULT.json`.
The report binds source archive, image, header override and output hashes. It
does not reproduce OTA ZIP metadata or signatures. This route invokes neither
the bootloader nor generators, flashing, formatting or installation.

## Nordic header correction

`tools/sdk-overrides/nrf_nvic.h` retains Nordic's copyright and license; it is not
relicensed under the top-level GPL text. Only the disposable SDK's
`components/softdevice/s112/headers/nrf_nvic.h` is replaced. The helper checks:

| Header | SHA-256 |
| --- | --- |
| Original in pinned SDK | `4505df359460dc12df197ab00cb523c0eb3214f379e1a0c24ae3bdc2070ea210` |
| Corrected header | `555417cf107cab5569878ee4f8b1d91e783b55dddc7e2900e204f624e107d7ef` |

The change is the MWU IRQ-mask correction for **DRGN-10613** documented in the
S112 7.3.0 known issues ([Nordic S112 downloads](https://www.nordicsemi.com/Products/Development-software/S112/Download)):

```c
#define __NRF_NVIC_SD_IRQS_1 ((uint32_t)(1U << (MWU_IRQn - 32)))
```

It does not replace an installed SoftDevice or a host SDK. Runtime BL8 and S112
7.3.0 are separate components; this application build installs neither.

## Development builds

For modified source, first change `VERSION` in
`fw/application/src/version.inc.h` to your distinct development version. Then,
with an empty output directory, run for example:

```sh
python3 tools/build_lcd.py --mode development --version 2.22.0-DE3.55-dev1 --counter 628
```

Development mode requires a counter of at least 628 and does not demand release
binary equality. The example counter is not a reservation or an installation
recommendation: coordinate release counters and inspect the actual target before
any separately authorized update. Regenerate fonts, translations or catalogue
data only when their inputs deliberately change, and include those generated
changes in the review.

The application region is `0x19000..0x73fff` (372,736 bytes), with **2,616 bytes
free** for the 370,120-byte DE3.55 BIN. Keep the linker layout and check the map
after changes. The application heap pool is 18,432 bytes; it is not the entire
64-KiB chip RAM. Compilation does not measure the physical stack watermark.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for portable host tests and Web checks.
The source archive also preserves historical workspace helpers and release
evidence; those helpers refer to external review/baseline trees and are not the
standalone contributor build command. Use `tools/build_lcd.py` here.

## Packaging and old instructions

An unsigned application is a build artifact, not a Secure DFU installable ZIP.
OTA signing requires a key matching the installed bootloader and a separate
package review. An arbitrary new key cannot make a package compatible. Do not
upload private keys or use a known public key as proof of publisher identity.

The inherited `fw/Makefile` retains legacy full-system recipes, but its
default/all/OTA entry points are explicitly disabled in this custom build.
Some historical recipes refer to an older SoftDevice. The inherited
`docs/en/03-Build-Firmware.md` describes upstream workflows. Neither is the
current DE3.55 release procedure. A device with SPIFFS or ordinary upstream
LittleFS still needs a deliberate backup/migration; building or flashing the
application does not convert that storage.
