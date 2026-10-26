# Allmiibo LCD bootloader BL6

This directory is the exact corresponding source of the separately delivered
BL6 bootloader. It is **not a new bootloader update for DE3.37**. Existing BL6
installations do not need another bootloader flash. The main firmware source
snapshot's inherited `fw/bootloader` is not this BL6 source.

## Compatibility and update boundary

- nRF52832, 512 KiB internal flash / 64 KiB RAM; reviewed LCD pin map in
  `fw/application/src/boards/board_lcd.h` and `fw/bootloader/src/lcd_comm.h`.
- Bootloader region: `0x77000..0x7DFFF` (28 KiB). Settings and MBR parameter
  pages are not part of the bootloader firmware payload.
- BL6's stored version counter is **7**. A higher installed bootloader counter
  may reject this package. The counter alone does not identify installed code.
- Existing signing key policy, partition boundaries and S112 are preserved.
  The OTA metadata accepts SoftDevice FWIDs `0x0103` and `0x0126`.
- This is not an OLED or arbitrary Allmiibo board compatibility guarantee.
  Inspect actual board pins, bootloader layout, signing compatibility and
  current SoftDevice before considering a bootloader update.
- A standalone bootloader update can invalidate the installed application.
  Have a compatible current application package available. Old combined
  BL6/DE3.24 ZIPs are intentionally not part of this current source delivery.
- The integrated browser flasher is for application-only packages. A standalone
  bootloader OTA requires a compatible Nordic Secure DFU client, such as the
  Android nRF Device Firmware Update app. No update is performed by these tools.

## What BL6 changes

BL6 keeps the DFU final Execute response pending until queued notifications have
completed or a bounded recovery timeout expires. Finalization rejects new
requests, waits for settings/flash completion and handles late callbacks and
scheduler/notification failures. It retains the preceding LCD display,
button-entry, validation and transport fixes.

## Rebuild the frozen source (without signing or flashing)

Requirements: Python 3.10+, Docker on an x86-64 host. The SDK image contains
nRF5 SDK 17.1.0 and the ARM compiler. Fetch the exact image once:

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
python build.py
```

`build.py` checks every frozen source hash, applies the existing
`sdk-overrides/nrf_nvic.h` workaround only inside an ephemeral offline container,
and compares the rebuilt padded bootloader region with the signed release.
It never modifies your installed SDK or accesses a device. The override retains
Nordic's license; its original and patched SHA-256 values are recorded in the
script. Build output is stored in `_build/`; an existing result is not overwritten.

The signing private key is intentionally absent. `dfu_public_key.c` is the
public verification key. Generating a different key does not make an OTA
compatible with an existing bootloader. The generated HEX is a developer build
artifact, not the application-only ZIP used by the browser dateimanager.

## Portable regression tests

Requirements: Python 3 and GCC or Clang on PATH.

```sh
python tests/run_host.py
# Linux with sanitizer-capable compiler:
python tests/run_host.py --sanitize --out _host-tests-sanitize
```

These execute **221 transport assertions and 18 final-Execute scenarios** using
selected actual production C functions and synthetic SDK callbacks. They test
queue/CCCD/session accounting, final ACK handling, late flash callbacks,
terminal request rejection and reset fallback. They do not prove RF delivery,
power-loss recovery or physical timing. Historical BL4/BL5 negative controls and
other review harnesses reference old local review snapshots; those are not
advertised as part of this portable subset.

## Attribution

The Pixl.js code remains under the repository's GPL-2.0 license, derived from
solosky/pixl.js and subsequent fork work. Nordic SDK overrides retain their
original file headers and `sdk-overrides/nRF5_Nordic_license.txt`; their use is
restricted to Nordic Semiconductor integrated circuits. Review those terms
before reuse. No private signing key, Amiibo dump, user backup or retail key is
included.
