# Allmiibo LCD — DE3 community firmware and file manager

[Deutsch](README.de.md) · [Open file manager](https://bluecyber81.github.io/pixl.js/) · [Current downloads](https://github.com/bluecyber81/pixl.js/releases/tag/de3.56) · [Contributing](CONTRIBUTING.md)

Release source, **3 November 2026**:

| Component | Version / source | Installation |
| --- | --- | --- |
| LCD application | **2.22.0-DE3.56**, DFU counter **628**; [`fw/`](fw) | Application-only OTA, existing compatible PFS1 devices |
| Browser file manager | **3.35.0**; [`web/`](web) | [Online](https://bluecyber81.github.io/pixl.js/) or portable ZIP; no device flash |
| Bootloader | **BL8**; [`bootloader-bl8/`](bootloader-bl8) | Separate component; unchanged in DE3.56 |
| Nordic Bluetooth stack | **[S112 7.3.0](softdevice-s112/README.md)**, FWID **0x0126** | Unchanged Nordic binary under vendor terms |
| File storage | **Packed LittleFS, PFS1** | Unchanged; not interchangeable with SPIFFS or ordinary upstream LittleFS |

This is bluecyber81's community continuation of [cylin577/pixl.js](https://github.com/cylin577/pixl.js), originally [solosky/pixl.js](https://github.com/solosky/pixl.js). It combines selected upstream work with the DE-series changes. It is not an official release from either upstream and does not claim every later upstream change has been merged. The version prefix identifies the base, not equality with a current upstream tag.

## New in file manager 3.35.0

**Device & diagnostics → Read all diagnostic values** collects runtime RAM, startup, bootloader/SoftDevice, power, drives, Packed-LittleFS geometry, firmware MTU and the last settings-menu diagnostic session. The combined JSON report includes per-section timestamps and partial failures. **No new firmware flash is needed.** [Usage and measurement limits](docs/DIAGNOSTICS_3_35.md) · [Web downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.35.0).

## New in DE3.56 and 3.34.0

- On the device, text-entry keycaps now match short-press input, including empty fields. Hints such as `q/Q` and `_/SP` explain short/held input when searching or renaming. Long titles cannot cover the hint. List scrollbars remain visible in large folders and correctly reach both ends.
- In **Figure catalogue → Show images**, enable an optional gallery for the current page. No gallery requests are made before opt-in. Fixed-size placeholders handle missing images; image URLs follow the active catalogue revision.
- **Filter collection** selects present, not found, needs inspection or unconfirmed/outdated entries using the existing collection-scan evidence. Explicit page changes reveal the new results; typing does not move focus.
- An accepted catalogue update now reaches device search, selection previews, file properties and local figure-file inspection. Old search results and delayed image errors cannot replace the new revision.

See [release notes](RELEASE_NOTES_EN.md) for menu paths, downloads and validation limits. The user reports DE3.56 installed and working; submitted diagnostic reports are dated observations, not complete hardware proof. No new startup speed improvement is claimed for this release.

## Start here

Use the [online file manager](https://bluecyber81.github.io/pixl.js/) in a browser supporting Web Bluetooth. On the Allmiibo, open **Bluetooth file transfer**, then connect from the page. Bluetooth uses the computer/phone running that browser; a VPN does not extend its radio range. The [online DFU page](https://bluecyber81.github.io/pixl.js/dfu/web.html) handles supported **application** updates.

For offline use, extract `Allmiibo_Dateimanager_3_35_0.zip` and run `Start-Dateimanager.cmd` on Windows with Python installed. Use the unchanged inner `Allmiibo_LCD_DE3_56_628_TESTSTAND.zip` to install the new device UI. The outer `Allmiibo_DE3_56_Web3_34_0_Gesamtpaket.zip` is a download archive, **not flashable**. The browser improvements alone require no firmware flash.

**Before updating an older device:** confirm board, bootloader/SoftDevice and storage layout. DE3.8/DE3.16 SPIFFS devices need a complete backup and a separate migration. Flashing this application alone does not convert their collection. See [installation](docs/INSTALLATION.md) and [PFS1 migration](docs/MIGRATION_PFS1.md). Existing compatible PFS1 devices need no formatting or restoration for DE3.56.

## Retained improvements

- German/English UI, readable scrolling, stable QR information, favorites and bounded folder/database lists.
- Corrected short middle-button handling, explicit Bluetooth radio/client states, timeouts and heap/storage/startup diagnostics.
- File transfer including MTU23, atomic small-file/Raw128 metadata commits, retry/abort handling, retained unsaved NFC changes on persistence errors and optional session-limited Bluetooth remote control.
- Packed LittleFS caching, streamed mount work, shared CRC calculations and targeted read/cache/wear corrections, without changing physical RAM or the PFS1 layout.
- Optional Disney Infinity profile for a suitable own 320-byte MiFare Mini file.
- File previews, cross-folder search, combined file/folder/ZIP uploads, resumable backups, recovery/migration simulation, component comparison and DFU error handling.
- Catalogue freshness checks and collection audit: **green** = ID found, **orange** = inspection note, **red** = not found after a complete whole-drive content scan. Partial or insufficient evidence remains unconfirmed. Disconnected results are dated observations, cleared by reconnection/change/reload.

The bundled catalogue contains **952 IDs**. Metadata and images are not valid figure dumps, and finding an ID does not establish cryptographic validity or game compatibility. Image retrieval exposes the public ID and visitor IP to the image host, not device files. User-supplied files/HTTPS sources can be inspected and uploaded; the project does not distribute private collections.

## Development, bootloader and SoftDevice

[Detailed improvement history](docs/DEVELOPMENT_HISTORY.md) · [BL8/S112 change record](docs/BOOTLOADER_SOFTDEVICE_CHANGES.md) · [Component downloads](https://github.com/bluecyber81/pixl.js/releases/tag/bl8-s112-7.3.0)

BL8 has corresponding source and a separately published signed OTA. S112 7.3.0 is the unchanged Nordic reference distribution with its license. Our integration, SDK workaround, diagnostics and validation are documented separately from Nordic's vendor fixes. The component guide explains the counter-9/counter-11 distinction and why the vendor ZIP is not a direct DFU package. Neither component is replaced by this application update.

Read [CONTRIBUTING.md](CONTRIBUTING.md), the [DE3.56 application build guide](docs/BUILD_DE3_56.md) and [BL8 guide](bootloader-bl8/README.md). Sources: [DE3.56 project](https://github.com/bluecyber81/pixl.js/releases/download/de3.56/Allmiibo_DE3_56_Quellcode.zip) and [file manager 3.35.0](https://github.com/bluecyber81/pixl.js/releases/download/web3.35.0/Allmiibo_Dateimanager_3_35_0_Quellcode.zip). Pinned builds and automated checks do not flash a device.

Targeted tests cover catalogue replacement, image opt-in/errors, status filtering, pagination, text entry and scrollbar rendering. Final release evidence is separate from [historical DE3.55 validation](docs/validation/DE3_55.json). The older MTU23/250, NFC, middle-button, wake and startup observations are not DE3.56 hardware results.

## Hardware and licenses

The target is the matching **128×64 monochrome LCD / nRF52832 / 512 KiB internal flash / 64 KiB RAM** design. The application heap pool remains **18,432 bytes**. Build outputs record the actual flash usage; heap samples do not measure all RAM or the physical stack watermark. Other LCD/OLED board revisions are not automatically compatible.

The inherited upstream DFU key is publicly known: a valid signature proves key/package compatibility, not exclusive publisher identity. Public sources exclude private credentials, backups and figure dumps. No claim is made that every defect or hardware failure mode has been tested.

Thanks to solosky, cylin577 and component contributors. [Mochi](https://github.com/tasken/Mochi) inspired web usability ideas. The original [license text](LICENSE), [component notices](THIRD_PARTY_NOTICES.md) and attribution remain; Nordic components retain their vendor terms.

[Current DE3.56 verification](docs/validation/DE3_56.json) — 137 firmware host suites, 1,082 web tests and 21 production checks for each deployment.

[File manager 3.35.0 verification](docs/validation/WEB3_35_0.json) — 1,128 web tests and 21 production checks per deployment passed. New device readback pending; no firmware change.
