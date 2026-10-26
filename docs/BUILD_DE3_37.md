# Building the DE3.37 LCD application

This checkout contains the corresponding application sources for
**2.22.0-DE3.37 / counter 609**, including frozen generated translations, fonts,
catalog metadata and vendored dependencies. The application targets the tested
nRF52832 LCD design and the **Packed LittleFS PFS1** storage layout. Building it
does not migrate a device or prove compatibility with another board or storage
layout. The separate bootloader source is not built by this helper.

## Prerequisites and exact toolchain

- Python 3.10 or later; the helper uses only its standard library.
- Docker CLI and a local engine for x86-64 Linux containers.
- The exact SDK image already present locally:

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
```

The download above is a separate, explicit setup step. Review the Nordic SDK
terms before using the image. The helper itself runs with `--pull never` and
`--network none`, installs nothing and accesses no Bluetooth, USB or serial
device. The full SDK is not redistributed in this repository.

## Build and verify

From the repository root:

```sh
python tools/build_lcd.py
```

On Windows, `py -3 tools/build_lcd.py` is also suitable. Use `--jobs 4` for fewer
parallel compiler processes. The output directory is **`build/lcd-de337`**;
preserve or move previous results before rebuilding because a nonempty output
directory is rejected.

The source archive contains only `fw/`, excluding caches, private key inputs,
Git metadata, previous build products and the unused Chameleon SDK/PC-tool
subtrees. It is unpacked at `/work`, matching the archived build. The helper
preserves `fw/application/src/version.inc.h` and compiles only:

```sh
make -C fw/application -j8 pixljs BOARD=LCD RELEASE=1 APP_VERSION=2.22.0-DE3.37 APP_VERSION_NUM=609
```

It does not invoke the default/full build, bootloader, OTA packaging, flashing,
formatting, or code generators. Frozen generated sources already belong to the
release. `SOURCE_DATE_EPOCH=1792972800` is kept to reproduce the archived build
environment. The header deliberately records `unknown` / `source-archive` as
Git provenance; it does not invent the later publication commit identity.

Release mode requires the unsigned application binary to have SHA-256:

```text
3a3d060d9359c57fc1633e2daecff5a5764841890152599eeded010ee39d8b27
```

A mismatch fails and exports no firmware artifacts. On success, the directory
contains `pixljs.bin`, application-only `pixljs.hex`, ELF `pixljs.out`, linker
map `pixljs.map`, `build.log` and `BUILD_RESULT.json`. The report records image,
source archive, version header, SDK override and output hashes. Binary equality
proves correspondence to the archived application; it is not a device test or
a reproduction of ZIP metadata/signatures.

## Nordic SDK header correction

`tools/sdk-overrides/nrf_nvic.h` retains the full Nordic Semiconductor copyright,
redistribution conditions and disclaimer. Those terms require Nordic-chip use;
this header is not relicensed under the project's top-level GPL text.

The file is the pinned SDK's S112 header with the single MWU IRQ-mask definition
recommended for **DRGN-10613** in the S112 7.3.0 release notes (Known Issues,
SoftDevice). The source documentation is available from
[Nordic's S112 download page](https://www.nordicsemi.com/Products/Development-software/S112/Download).

```c
#define __NRF_NVIC_SD_IRQS_1 ((uint32_t)(1U << (MWU_IRQn - 32)))
```

Before compiling, only the disposable container's
`components/softdevice/s112/headers/nrf_nvic.h` is replaced. The helper requires
its original SHA-256 to equal
`4505df359460dc12df197ab00cb523c0eb3214f379e1a0c24ae3bdc2070ea210`
and the corrected file to equal
`555417cf107cab5569878ee4f8b1d91e783b55dddc7e2900e204f624e107d7ef`.
No installed SDK, bootloader or device SoftDevice image is modified.

## Development and signing

For a changed application, choose a different version, update its development
header and deliberately assign a new monotonic counter, for example:

```sh
python tools/build_lcd.py --mode development --version 2.22.0-DE3.37-dev1 --counter 610
```

Development mode requires an explicit counter at least 610 and does not claim
release binary equality. Regenerate affected translations/fonts/catalog data
separately when modifying their inputs. This helper deliberately never changes
the source header or runs those generators.

No private signing keys are included. Creating an installable OTA is a separate
operation requiring a signing key compatible with the installed bootloader.
The published DE3.37 OTA declares hardware 52 and SoftDevice IDs `0x0103` and
`0x0126`; these are package compatibility requirements, not a device readout.
An arbitrary new signing key cannot make an OTA compatible. The application OTA
does not replace BL6 or S112, and is not a migration package for SPIFFS devices.

Host regression tests remain under `fw/tests`; some use the pinned SDK through
`NRF52_SDK_ROOT`. The build helper only compiles and checks binary identity; it
does not silently rerun the whole test matrix or claim hardware validation.
