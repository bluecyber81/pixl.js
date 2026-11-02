# Allmiibo LCD — DE3 community firmware and file manager

[Deutsch](README.de.md) · [DE3.37 downloads](https://github.com/bluecyber81/pixl.js/releases/tag/de3.37) · [Changes](CHANGELOG_DE3_SERIES.md) · [Build guide](docs/BUILD_DE3_37.md)

Firmware source snapshot under `fw/`: **2.22.0-DE3.37**, DFU counter **609**. The current browser file manager under `web/` is **3.32.5**; the firmware documentation below still describes the DE3.37 release. This community fork combines the [cylin577/pixl.js](https://github.com/cylin577/pixl.js) codebase with the DE-series changes and a custom Packed LittleFS storage layer. The original project is [solosky/pixl.js](https://github.com/solosky/pixl.js). This is not an official release from either upstream project.

**DE3.37 is an application update for matching LCD devices already using this fork's Packed LittleFS (PFS1).** A device still running SPIFFS, including the earlier public DE3.16, requires a separate backup and migration. Upstream's ordinary LittleFS layout is also different. Flashing this application alone does not convert or restore either layout. Read [the storage guide](docs/MIGRATION_PFS1.md) before changing an older device.

## Online file manager 3.32.5

**[Open file manager](https://bluecyber81.github.io/pixl.js/) · [DFU page](https://bluecyber81.github.io/pixl.js/dfu/web.html) · [Portable packages and corresponding sources](https://github.com/bluecyber81/pixl.js/releases/tag/web3.32.5)**

The website works without an always-on local server. Chrome on Android or a
supported computer connects directly to the Allmiibo within Bluetooth range.
Private figure files and backups are not uploaded to GitHub. See the
[website guide](docs/DATEIMANAGER_WEB.md) for use, deployment and limitations.

The file manager optionally offers **DE3.55 / 627** for the matching LCD device
with **Packed LittleFS (PFS1), BL8 and S112 7.3.0**. This is application-only;
using the file manager does not itself require a firmware update. The exact
DE3.55 sources are supplied as a separate archive in the linked web release.
The older `fw/` tree below is **not** the source snapshot for that firmware.

## Downloads and installation

| Download | Purpose |
| --- | --- |
| `Allmiibo_LCD_DE3_37_609.zip` | Flashable application OTA for the matching LCD/PFS1 configuration. Select this ZIP unchanged in Secure DFU. |
| `Allmiibo_Dateimanager_3_27_0_PUBLIC.zip` | Ready-built PC/browser file manager, source and notices. Extract on the computer; do not flash it. |
| `Allmiibo_DE3_37_Quellcode_PUBLIC.zip` | Public source snapshot with build instructions and regression tests. |
| `Allmiibo_DE3_37_Gesamtpaket_PUBLIC.zip` | Download bundle containing the separate packages and documentation. The outer ZIP is **not** a flashable firmware package. |
| `BL6_CODE_ZAEHLER7_BOOTLOADER_ONLY.zip` | Optional advanced bootloader-only OTA, stored counter 7. Read the separate compatibility guide first. |
| `SHA256SUMS.txt` | Checksums for the published release assets. |

For an already migrated matching device:

1. Save a current file backup, then disconnect the file-manager session and enter the device's DFU mode.
2. Select `Allmiibo_LCD_DE3_37_609.zip` in the DFU client and complete the transfer.
3. Confirm the normal menu and version `2.22.0-DE3.37`, then check folders, center-button wake and a familiar NFC tag.

No new formatting or restoration is required for this PFS1 application update. It does not install a bootloader, Nordic SoftDevice, PC Bluetooth driver, figure collection or `key_retail.bin`. BL6 and S112 7.3.0 are separate components in the tested configuration; they are not silently installed by this OTA. The application package declares hardware version 52 and SoftDevice requirements `0x0103`/`0x0126`; these declarations do not identify a particular board or prove that every accepted device is compatible.

BL6 is available separately with [its exact source, portable tests and compatibility instructions](bootloader-bl6/README.md). Existing BL6 installations do not need another flash. The integrated browser flasher accepts application-only packages; use a compatible Nordic Secure DFU client, such as the Android nRF Device Firmware Update app, for the optional bootloader package. A bootloader update can invalidate the application, so keep the matching application OTA available. No SoftDevice binary is included in this release.

## What changed

DE3.37 fixes a persistence failure: if a console changes a tag but the write to storage fails, the unsaved tag now remains in RAM. Changing the application/tag or going to sleep cannot silently discard it. An allocation-free error dialog offers another save attempt or a separate discard confirmation, with **No** selected initially. Confirmed discard removes only the unsaved RAM change and leaves the previously stored file intact. Unsaved RAM still cannot survive power loss or a forced reset. AmiLoop also stops reporting a rejected tag commit as successful.

File manager 3.27.0 preserves folder notes/read-only flags changed during ZIP import, reopens its local recovery database after the browser closes it, and gives clearer restoration and disconnect messages. Missing migration capabilities no longer suggest installing an old SPIFFS preparation firmware on an already migrated or unknown device. The component comparison knows DE3.37/609, BL6 and S112 7.3.0; it is a local expected-version comparison, not an automatic Internet update service.

The cumulative DE-series work includes German/English UI, readable slow scrolling, stable QR information pages, search/favorites, bounded lists for larger collections, MTU23-compatible negotiated file transfer, explicit connection/session handling, diagnostic views and more robust file operations. The PFS1 layer packs small files and all 128 metadata bytes, with checked commits, recovery state and a browser-assisted migration. Later improvements reuse verified indexes, reduce repeated storage reads, release unused list caches and fix two reproduced LittleFS cache/read-error cases. These do not increase physical RAM or promise a fixed transfer speed. See [the cumulative changelog](CHANGELOG_DE3_SERIES.md).

## File manager

Extract the public file-manager ZIP and run `Start-Dateimanager.cmd`. The ready-built package uses a local Python server; Node.js is needed only to rebuild the web application. `Start_8768.cmd` selects port 8768. On the same computer, open `http://127.0.0.1:8768/` in a browser supporting Web Bluetooth, such as Chrome, and open Bluetooth file transfer on the device.

The three work areas cover files, backup/restoration and device updates. Additional device details include storage, application-heap diagnostics, BLE counters and read-only bootloader/SoftDevice information. ZIP import preserves paths and metadata; restoration supports resuming with the same backup and one final complete content/Raw128 comparison. The file manager does not automatically upload private backups. A stopped browser download does not mean that the file was saved; diagnostic preview/copy and alternative save actions remain available.

`127.0.0.1` always refers to the computer or phone opening the link. Opening the page over a VPN does not extend Bluetooth range. Browser support, secure-context requirements and local network access still apply.

## Hardware, verification and limits

The tested target is an Allmiibo **128×64 monochrome LCD** device with an **nRF52832 (512 KiB internal flash, 64 KiB RAM)**, wheel/center button and USB-C connector. `BOARD=LCD` does not establish compatibility with OLED devices or every revision sold under the Allmiibo name. No pin mapping or partition changes are introduced by DE3.37.

- A fresh unsigned rebuild from the public application source is byte-identical to the application binary in the signed DE3.37 OTA. The separate BL6 public source also reproduces its 28 KiB padded release region.
- **102 firmware host test groups**, five targeted ASan/UBSan suites, ARM compilation, source binding, memory-map bounds and OTA signature checks passed for DE3.37.
- **659 file-manager tests** and **7 built-worker/WASM tests** passed for 3.27.0. The production interface was checked at desktop and narrow widths.
- BL6 DFU completion, entry and transport cases were reviewed again in host tests. This does not make an unrelated board bootloader-compatible.
- On 26 October 2026, the device owner reported successful DE3.37 flashing and operation. This is a user report of normal function, not a newly instrumented full NFC/BLE/MTU23 run or physical fault-injection test.

The application binary is 358,880 bytes, leaving 13,856 bytes in the existing application-flash region. The application heap remains 18,432 bytes; those figures are distinct from the full chip RAM and the external file-storage capacity. Static stack-path checks are not a physical stack-watermark measurement. Host tests do not prove every event order, hardware revision, power-loss scenario or complete absence of defects.

The inherited upstream DFU signing key is publicly known. The signature establishes compatibility with that key and package format, **not** a secret publisher identity. Compare release checksums when obtaining the published files.

## Sources and credits

Application sources are in `fw/`, browser sources in `web/`. The [build guide](docs/BUILD_DE3_37.md) uses a pinned SDK image and a documented header override to reproduce the application without signing, flashing or installing a SoftDevice. The ordinary upstream `make all` workflow is not the release procedure for this custom application.

Thanks to solosky, cylin577 and the component contributors. The original [GPL version 2 text](LICENSE) and individual component notices are retained; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `LICENSES/`. This repository does not relicense the bundled components. Public packages exclude private credentials, device backups, private signing keys and figure dumps. Catalog names and IDs are metadata, not a source of valid tag data or a guarantee that every game supports a figure.
