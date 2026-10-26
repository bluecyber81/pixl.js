# DE3.37 — Allmiibo LCD with Packed LittleFS

**Application 2.22.0-DE3.37 / counter 609 · file manager 3.27.0**

Community release derived from cylin577/pixl.js and the original solosky/pixl.js project; not an official upstream update.

**Before flashing:** this application targets matching LCD devices already using this fork's **Packed LittleFS (PFS1)**. It is not a direct data-preserving update from DE3.16/SPIFFS or ordinary upstream LittleFS. Check [the storage/migration guide](https://github.com/bluecyber81/pixl.js/blob/de3.37/docs/MIGRATION_PFS1.md) first. Existing PFS1 devices need no new formatting for DE3.37.

## Changes

- Failed NFC persistence retains the changed tag in RAM. App/tag changes and sleep cannot silently discard it. An allocation-free error dialog offers a save retry or a separate discard confirmation with No selected initially. Discard preserves the previously stored file. Unsaved RAM does not survive power loss or forced reset.
- AmiLoop no longer acknowledges a rejected tag commit as successful.
- ZIP import preserves folder notes/read-only flags changed while the import was running and reports the conflict.
- The local recovery store can reopen after the browser closes its database. Unavailable or mismatched recovery receipts have clearer guidance.
- Missing storage capabilities no longer suggest an old SPIFFS preparation firmware on an already migrated/unknown device.
- Intentional idle disconnects are informational; unexpected connection loss remains an error. Unsupported optional diagnostic queries no longer produce a misleading device error.

Earlier UI/QR, BLE/MTU23, bounded-list, RAM, PFS1 and targeted LittleFS fixes remain included. See [cumulative changes](https://github.com/bluecyber81/pixl.js/blob/de3.37/CHANGELOG_DE3_SERIES.md).

## Assets

- **Flash:** select `Allmiibo_LCD_DE3_37_609.zip` unchanged in Secure DFU.
- **File manager:** extract `Allmiibo_Dateimanager_3_27_0_PUBLIC.zip` on the PC and run `Start-Dateimanager.cmd`.
- **Sources:** `Allmiibo_DE3_37_Quellcode_PUBLIC.zip`.
- **Complete download bundle:** extract `Allmiibo_DE3_37_Gesamtpaket_PUBLIC.zip`; the outer ZIP is not flashable.
- **Optional bootloader:** `BL6_CODE_ZAEHLER7_BOOTLOADER_ONLY.zip`, stored counter 7. [Compatibility guide and source](https://github.com/bluecyber81/pixl.js/blob/de3.37/bootloader-bl6/README.md). Not needed again when BL6 is already installed. Use a compatible Nordic Secure DFU client; the integrated browser flasher is application-only. A bootloader update can require reinstalling the application.
- **Checksums:** `SHA256SUMS.txt`.

The application OTA replaces **neither bootloader nor SoftDevice**. It does not include a figure collection, private backups or private signing keys. BL6/S112 remain separate components, not mandatory repeat updates for an already compatible device. The Allmiibo product name alone does not qualify an arbitrary LCD/OLED revision.

No SoftDevice binary is included.

## Verification

Fresh builds from the public source reproduce the application BIN and, separately, the complete padded 28 KiB BL6 region byte for byte against their release binaries.

102 firmware host test groups, five targeted ASan/UBSan suites, ARM compilation, source binding, memory-map bounds and OTA signature checks passed. File manager: 659 tests and 7 built-worker/WASM tests passed. BL6 DFU completion, entry and transport were additionally checked in host tests.

On **26 October 2026**, the owner reported successful DE3.37 flashing and normal operation of the functions tried. This is not a fresh exhaustive instrumented hardware/NFC/MTU23 or physical fault-injection test. No claim of complete defect freedom. Application BIN: 358,880 bytes; application-flash reserve: 13,856 bytes; application heap remains 18,432 bytes.

The inherited upstream DFU key is publicly known; the signature is not proof of a secret publisher identity. The source, build instructions, checksums and license notices identify the published artifacts.
