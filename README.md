# Allmiibo LCD — DE3 community firmware and file manager

[Deutsch](README.de.md) · [Open file manager](https://bluecyber81.github.io/pixl.js/) · [Current downloads](https://github.com/bluecyber81/pixl.js/releases/tag/de3.55) · [Contributing](CONTRIBUTING.md)

Current published components, checked **3 November 2026**:

| Component | Version / source | Installation |
| --- | --- | --- |
| LCD application | **2.22.0-DE3.55**, DFU counter **627**; [`fw/`](fw) | Application-only OTA, existing compatible PFS1 devices |
| Browser file manager | **3.33.1**; [`web/`](web) | [Online](https://bluecyber81.github.io/pixl.js/) or portable ZIP; no device flash |
| Bootloader | **BL8**; [`bootloader-bl8/`](bootloader-bl8) | Separate advanced component; not replaced by application OTA |
| Nordic Bluetooth stack | **S112 7.3.0**, FWID **0x0126** | Nordic binary under vendor terms; not our own SoftDevice build |
| File storage | **Packed LittleFS, PFS1** | Not interchangeable with SPIFFS or ordinary upstream LittleFS |

This is bluecyber81's community continuation of [cylin577/pixl.js](https://github.com/cylin577/pixl.js), originally [solosky/pixl.js](https://github.com/solosky/pixl.js). It combines selected upstream work with the DE-series changes. It is not an official release from either upstream and does not claim every later upstream change has been merged. The version prefix identifies the base, not equality with a current upstream tag.

## Start here

Use the [online file manager](https://bluecyber81.github.io/pixl.js/) in a browser supporting Web Bluetooth. On the Allmiibo, open **Bluetooth file transfer**, then connect from the page. Bluetooth uses the computer/phone running that browser; a VPN does not extend its radio range. The [online DFU page](https://bluecyber81.github.io/pixl.js/dfu/web.html) handles supported **application** updates.

For offline use, extract `Allmiibo_Dateimanager_3_33_1.zip` and run `Start-Dateimanager.cmd` on Windows with Python installed. The outer complete-download ZIP is **not** a flashable firmware package. Use the unchanged inner `Allmiibo_LCD_DE3_55_627_TESTSTAND.zip` for the application. Its historical filename is retained so existing checksums stay valid.

**Before updating an older device:** confirm board, bootloader/SoftDevice and storage layout. DE3.8/DE3.16 SPIFFS devices need a complete backup and a separate migration. Flashing this application alone does not convert their collection. See [installation and component compatibility](docs/INSTALLATION.md) and [PFS1 migration](docs/MIGRATION_PFS1.md). Existing compatible PFS1 devices need no new formatting for DE3.55. Do not flash a guessed combined system package onto an unidentified device.

## What this fork adds

- German/English device UI, readable slow scrolling, stable scannable QR pages, figure information, favorites and bounded folder/database lists for larger collections.
- Corrected short middle-button handling, explicit Bluetooth radio/client states and timeouts, diagnostics for application heap, storage and startup phases.
- Negotiated file transfer including MTU23, atomic small-file and Raw128 metadata commits, retry/abort handling, retained unsaved NFC changes when persistence fails, and session-limited optional Bluetooth remote control.
- Packed LittleFS small-file storage, cached/streamed mount work, targeted cache/read-error and metadata-wear fixes. DE3.55 calculates two CRC states in one pass without changing PFS1 records. It does not increase physical RAM or promise a universal boot time.
- Optional Disney Infinity card-emulator profile for a suitable user-supplied 320-byte MiFare Mini file; no figure data is supplied.
- Web file previews/images, device-folder search, combined file/folder/ZIP uploads, resumable ZIP/Raw128 backups, recovery and migration simulation, component comparison, runtime/startup diagnostics and clearer DFU errors.
- Catalogue freshness checks and device collection audit: **green** = ID found, **orange** = inspection note, **red** = not found after a complete whole-drive content scan. Missing metadata or a partial scan remains unconfirmed. Results survive disconnect only as a dated observation in the open page; reconnect/change/reload invalidates them.

The bundled catalogue contains **952 IDs**. Catalogue metadata and images are not valid figure dumps, and finding an ID is not proof of cryptographic validity or game compatibility. User-supplied files/HTTPS sources can be inspected and uploaded; the project does not distribute a private collection. See [changes](CHANGELOG_DE3_SERIES.md).

## Build, test and contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md), the [DE3.55 application build guide](docs/BUILD_DE3_55.md), and the independent [BL8 guide](bootloader-bl8/README.md). The public checkout now contains the matching application and bootloader sources, not just release ZIPs. A pinned Docker toolchain builds the application without signing or accessing a device. Web dependencies are pinned in `web/package-lock.json`; CI checks the web build and a documented subset of portable firmware tests.

On 3 November, a fresh build from this publication checkout reproduced the DE3.55 **BIN, HEX, ELF and map byte for byte** against the archived build. Release evidence also records **136 firmware host test groups**, targeted sanitizer/ARM/storage tests, and **1,057 web tests plus 21 checks for each production build**. [Validation summary](docs/validation/DE3_55.json) separates archived evidence, fresh publication checks and actual device observations.

On 2 November, bounded device tests read DE3.55, BL8 and S112 7.3.0, exercised actual ATT MTU **250 and 23**, checked scratch-file read/write/Raw128/reconnect operations and removed their test files. The owner separately confirmed NFC recognition, short middle press and wake. The startup marker observation was about **2.31 s**, excluding bootloader and early SDK startup. These are dated, scoped observations, not universal timing or exhaustive hardware validation.

## Hardware and limits

The verified target is the matching **128×64 monochrome LCD / nRF52832 / 512 KiB internal flash / 64 KiB RAM** design. The application binary is **370,120 bytes**, leaving **2,616 bytes** in its configured application flash region; the application heap pool is **18,432 bytes**. Heap samples do not cover all chip RAM or the physical stack high-water mark. OLED and other Allmiibo board revisions are not automatically compatible.

BL8 and S112 are separate from the application. BL8 code identity and its stored DFU version counter are different values; see [components](docs/COMPONENTS.md). The inherited upstream DFU key is publicly known: a valid signature proves key/package compatibility, not exclusive publisher identity. Public source packages exclude private credentials, device backups and figure dumps. No claim is made that all defects, physical power failures or endurance limits have been tested.

## Credits and licenses

Thanks to solosky, cylin577 and the component contributors. Mochi inspired web usability ideas; its separately developed project is [tasken/Mochi](https://github.com/tasken/Mochi). The original [license text](LICENSE), component notices and attribution remain in place. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); Nordic components retain their vendor terms. This repository does not relicense every component under one license.
