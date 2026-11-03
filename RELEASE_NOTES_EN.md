# DE3.55 source synchronization and current complete download

**LCD application 2.22.0-DE3.55 / counter 627 · Dateimanager 3.33.1 · BL8 source · S112 7.3.0 documentation**

The [detailed improvement/bug-fix history](https://github.com/bluecyber81/pixl.js/blob/main/docs/DEVELOPMENT_HISTORY.md) and [BL8/S112 changes](https://github.com/bluecyber81/pixl.js/blob/main/docs/BOOTLOADER_SOFTDEVICE_CHANGES.md) are now published. [Separate BL8 and original Nordic S112 component downloads](https://github.com/bluecyber81/pixl.js/releases/tag/bl8-s112-7.3.0) supplement this standard application release; their counter and installation requirements are different.

This publication brings the main source tree and contributor documentation up to the existing DE3.55 application and 3.33.1 web releases. Existing firmware/web payloads are unchanged; no repeat flash is needed if they are already installed.

- Matching current application source plus independently exported BL8 source, SDK overrides, build guides and CI.
- Dependency checks now distinguish Windows/Linux optional native packages while retaining lockfile, identity and license validation; new regression cases cover platform selection and missing or modified packages.
- Fresh public-source application rebuild matches the archived BIN/HEX/ELF/map byte for byte. BL8 build evidence is documented in its source guide.
- Current file manager, collection color markers, diagnostic and DFU fixes, PFS1 storage improvements and preserved UI/BLE/NFC behavior. See [current README](https://github.com/bluecyber81/pixl.js/blob/de3.55/README.md) and [changes](https://github.com/bluecyber81/pixl.js/blob/de3.55/CHANGELOG_DE3_SERIES.md).

## Downloads

- `Allmiibo_LCD_DE3_55_627_TESTSTAND.zip`: unchanged **application-only OTA** for matching LCD/PFS1 devices. Do not extract/re-zip it.
- `Allmiibo_Dateimanager_3_33_1.zip`: current portable browser application.
- `Allmiibo_DE3_55_BL8_Web3_33_1_Projektquellen.zip`: current public project with standalone application/BL8 build instructions and web sources.
- `Allmiibo_DE3_55_Web3_33_1_Gesamtpaket.zip`: all preceding download files and checksums/documentation. **The outer ZIP is not flashable.**
- `SHA256SUMS.txt`: exact asset checksums.

Use the [online file manager](https://bluecyber81.github.io/pixl.js/) or its [application DFU page](https://bluecyber81.github.io/pixl.js/dfu/web.html).

**Old SPIFFS/DE3.8/DE3.16 and ordinary upstream LittleFS devices are not a direct migration target of this application ZIP.** Read [installation](https://github.com/bluecyber81/pixl.js/blob/de3.55/docs/INSTALLATION.md) first. Existing compatible PFS1 devices need no format. Neither bootloader nor SoftDevice is replaced by the standard OTA; no universal combined system ZIP, private keys, backups or figure dumps are published.

Archived verification: 136 firmware host groups, targeted sanitizer/ARM/storage checks; web 1,057 tests and 21 root +21 Pages production checks. Bounded device read/write/Raw128 tests at actual MTU23/250 passed on 2 November; NFC/middle/wake confirmed by the owner. These are scoped, dated observations, not a claim that all hardware or failure modes are covered.

Credits to solosky, cylin577 and component contributors; vendor licenses and original notices remain applicable. This is an independent community continuation.
