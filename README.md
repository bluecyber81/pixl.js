# Allmiibo LCD — DE3 community firmware

[Deutsch](README.de.md) · [DE3.16 downloads](https://github.com/bluecyber81/pixl.js/releases/tag/de3.16) · [Cumulative changes](CHANGELOG_DE3_SERIES.md) · [Build guide](docs/BUILD_DE3_16.md)

**Community prerelease: `2.21.0-DE3.16`, application update counter `572`.** This fork develops LCD firmware and a separate browser file manager. It is based on [cylin577/pixl.js](https://github.com/cylin577/pixl.js) `v2.21.0`, commit `57a364329436745f780e70ac07a1642989a00d6f`, derived from the original [solosky/pixl.js](https://github.com/solosky/pixl.js) project. DE3.16 is not an official release from either upstream project.

## Hardware and package scope

The tested device is an Allmiibo LCD unit with an **nRF52832, 128×64 monochrome LCD, wheel/center button and USB-C port**. The firmware target is `BOARD=LCD`. This does not establish compatibility with every product sold as “Allmiibo,” every board revision, or OLED devices.

The OTA contains **the application only**. It does not install a bootloader, Nordic SoftDevice, PC Bluetooth driver, figure dump collection or `key_retail.bin`. Existing figure files are separate from firmware. Catalog names and IDs are metadata, not a guarantee of game compatibility or a source of valid tag data.

## What the DE series adds

- German and English UI, catalog search by name or ID, filters and favorites.
- Negotiated Bluetooth request fragmentation and streamed replies for small ATT MTUs, including MTU23, while retaining legacy client mode. Transfer errors, disconnects and stale callbacks receive explicit handling.
- Checked storage operations, bounded paths, settings/data journaling for selected small records, and improved handling of failed cache writes and abandoned file handles.
- Restored center-button wake configuration on the tested LCD design, slower scrolling text with reading pauses, and clearer settings-save feedback without the redundant save check on return to the main menu.
- Checked memory growth in selected UI paths, app-start cleanup, safer UTF-8 and canvas boundaries, reduced QR-code stack buffers, NFC command bounds and standard NTAG215 password-page masking.
- A separate **file manager 3.12.0**, modernized to Vue 3/Vite. The four mini-games and PIXV animation player are retained from the base fork; they are not newly created by DE3.16.

See the [component-by-component history](CHANGELOG_DE3_SERIES.md) for the cumulative fixes and their limits.

## New in DE3.16

1. **SPIFFS allocation:** a failed file-header read now stops free-object-ID allocation instead of treating an occupied ID as available.
2. **Player selection:** building a playback path checks available memory. Failure keeps the existing selection and shows the memory-error screen instead of entering the fatal allocation path.
3. **Player listing:** directory read and close failures no longer appear as an empty directory or a complete partial list. The error is shown and the main-menu entry remains available.

## Install and use

1. Confirm the matching LCD hardware and compatible existing DFU environment; back up your files and settings.
2. Download **`Allmiibo_LCD_DE3_16_572.zip`** from the [release page](https://github.com/bluecyber81/pixl.js/releases/tag/de3.16).
3. Use the existing Secure DFU workflow and select that application ZIP. A source archive or complete download bundle is not a flashable firmware package.
4. After restarting, verify `2.21.0-DE3.16` and check menus, sleep/wake, Bluetooth transfer and NFC on your own device.

The browser file manager is a separate application in `web/`; flashing the firmware does not update it. Its package requires Node.js **22.12.0 or later**. Build and tooling instructions are in the [public build guide](docs/BUILD_DE3_16.md). Firmware builds and flashing are separate operations.

The ready-built file-manager ZIP also includes a local Python launcher; Node.js is needed to rebuild the web application, not to serve that ready-built ZIP.

The DE3.15 recovery application, **`Allmiibo_LCD_DE3_15_RUECKKEHR_573.zip`**, uses counter `573` and contains the exact earlier application. After installing it, a later update must use a counter above `573`. It does not restore a backup of files or settings; the old DE3.15 package with counter `570` is not this recovery package.

## Verification and known limits

For DE3.16, **70 host test suites passed**. The two new focused suites contain **175 cases (17 storage + 158 Player)**, run natively and again with AddressSanitizer/UndefinedBehaviorSanitizer. Negative controls against the prior source reproduce the corrected failures, and the changes received an independent source review. The application package's metadata, payload hash and signature were checked.

The inherited upstream DFU signing key is publicly available. Its signature checks compatibility with the existing bootloader format; it is **not** proof of a secret publisher identity. Use this release's hashes to check that you have the same published files.

On one tested LCD unit, browser DFU reported completion, the normal menu returned, and a fresh Bluetooth query read `2.21.0-DE3.16` with observed **ATT MTU250**. This is version readback, not a full firmware-image readback. NFC, sleep/wake and real MTU23 transfers have **not been rerun on DE3.16**. Earlier real MTU23 read/write/error-case tests passed on DE3.15 and remain historical evidence only. The unchanged file manager carries its original **84-test** evidence; those tests were not rerun for this firmware release.

**Open issue:** an intermittent extra, malformed Tybalt directory entry has been observed. The regular file remained readable, but the extra entry could not be opened. Its cause is unresolved. DE3.16 neither claims to fix it nor automatically filters, deletes, repairs or formats the storage.

Host tests do not prove every event order, hardware variant, free runtime RAM/stack margin, long-term reliability or recovery from arbitrary power loss. The settings-save guard also remains conservative after an initial settings-load failure; remounting alone does not automatically authorize overwriting unknown settings.

## Credits and license

Thanks to solosky, cylin577 and the original component contributors. The project retains its [GNU GPL version 2 license](LICENSE); bundled third-party components retain their own notices. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [LICENSES](LICENSES) for the separate component terms. Please preserve attribution when sharing changes; this snapshot does not relicense third-party code.
