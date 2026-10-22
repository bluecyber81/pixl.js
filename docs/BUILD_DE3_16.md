# Building the DE3.16 LCD application

This repository contains the generated firmware sources and vendored dependency
files for the custom **2.21.0-DE3.16 LCD application**. It is not an official
solosky release. The helper below compiles an unsigned application; it does not
flash a device, generate a signed OTA package, or build/update the bootloader or
Nordic SoftDevice.

## Prerequisites

- Python 3.10 or newer, using only its standard library.
- Docker CLI and a running Docker engine capable of Linux containers.
- The exact SDK image below, available locally. Review its upstream licensing
  terms before obtaining/using it. The SDK itself is not redistributed here.

If the image is not already present, fetching it is a separate, explicit network
step:

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
```

The build helper uses `--pull never` and `--network none`. It installs nothing and
requires no private signing key, serial connection, Bluetooth adapter, or USB
device. Use a local Docker engine: the script uses bind mounts from the current
host's temporary directory.

## Reproduce the archived release application

From the repository root:

```sh
python tools/build_lcd.py
```

On Windows, `py -3 tools/build_lcd.py` is also suitable. `--jobs 4` can reduce
parallel compiler processes. Output goes only to `build/lcd` inside the checkout:

- `pixljs.bin`: raw unsigned application image.
- `pixljs.hex`: application-only address records, not a full-device image.
- `pixljs.out` and `pixljs.map`: ELF/debug information and linker map.
- `build.log` and `BUILD_RESULT.json`: compiler output, hashes and result.

Keep or move previous output before another run; the helper refuses a nonempty
`build/lcd`. Source files remain unchanged. A disposable source archive excludes
Git metadata, signing-key files, dependency caches and previous build products.
The container unpacks it under `/work`, matching the archived build's source
location, and invokes only:

```sh
make -C fw/application -j8 pixljs BOARD=LCD RELEASE=1 APP_VERSION=2.21.0-DE3.16 APP_VERSION_NUM=572
```

It deliberately does **not** invoke `default`, `all`, `version`, `gen`, `ota`,
`full`, `flash` or `erase`. No database/font/translation generator runs. Their
generated sources already belong to this release snapshot.

Release mode checks the frozen `fw/application/src/version.inc.h` metadata and
requires the produced `pixljs.bin` SHA-256 to equal:

```text
7a92e95a62556b45cc0f9ce06dbed4ba90a9415f41932cdda0267b3f7265e697
```

A mismatch fails the command and exports no firmware artifacts. A passed result
establishes binary equality to the archived application, not hardware testing of
a new modification. Matching the binary does not reproduce an OTA ZIP signature
or its archive metadata.

## Frozen provenance and development builds

The frozen header intentionally identifies the original build: upstream commit
`57a3643`, detached `HEAD`, commit count `1`, dirty flag `1`, build date
`2026-10-21`, version `2.21.0-DE3.16`. These describe the archived application;
they do not pretend to be the later public repository's Git commit. The helper
also uses the archived `SOURCE_DATE_EPOCH=1792540800`.

For changed firmware, first choose a new version and update your development
source header and its provenance explicitly. Regenerate affected database/font/
translation inputs separately if your changes require it. Then use, for example:

```sh
python tools/build_lcd.py --mode development --version 2.21.0-DE3.16-dev1 --counter 574
```

The header's `VERSION` must already match that identifier. The helper never edits
it. Development mode requires a version different from DE3.16 and an explicit
counter of at least 574: 572 identifies DE3.16 and 573 was reserved for its
recovery package. The counter is passed explicitly to make; this compile-only
step does not create a DFU init packet. A successful development compilation is
reported as `development_build_unverified`, not as the validated DE3.16 release.
Future release/signing policy must assign counters deliberately; a new fork's
GitHub Actions run number is not a compatible replacement for this policy.

## Signing and validation boundaries

No private signing keys belong in this checkout. Creating an application OTA is
a separate release operation using an external private key compatible with the
installed bootloader. An arbitrary newly generated key does not make an OTA
compatible, and this build procedure does not replace the bootloader to change
that requirement. The archived OTA uses hardware version 52 and SoftDevice
requirement `0x0103`; those are compatibility declarations, not a readout of a
particular device.

The existing host regression tests remain in `fw/tests`. Some use the pinned
SDK's real GATT source through `NRF52_SDK_ROOT`; the image supplies
`/opt/nRF5_SDK_17.1.0_ddde560`. This helper performs compilation and the release
binary-hash check only. It does not claim a fresh complete test run or physical
device validation.

Deutsch: `python tools/build_lcd.py` baut ausschließlich die unsignierte
LCD-Anwendung und prüft ihren Hash. Es wird nichts geflasht. Änderungen erhalten
eine eigene Versionsnummer; sie gelten nach dem Kompilieren noch nicht als
getestete Veröffentlichung.
