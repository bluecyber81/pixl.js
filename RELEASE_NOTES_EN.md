# DE3.57 / file manager 3.35.1 – Bluetooth status at a glance

**LCD application 2.22.0-DE3.57 / counter 629 · file manager 3.35.1 · BL8 · Nordic S112 7.3.0 · Packed LittleFS PFS1**

A Bluetooth status indicator replaces the unchanging pictogram beside the voltage. It distinguishes inactive, advertising, a physical link without a ready data channel, a ready data channel, and disconnecting or switching mode. This also applies to optional remote-control connections, without enabling Bluetooth itself. See the [symbol guide](docs/BLUETOOTH_STATUS_DE3_57.md).

The indicator follows existing state changes, without extra radio queries, timers, animation or storage writes. “Data channel ready” does not mean a file is transferring or every remote command is permitted during NFC operation. The existing file-transfer screen retains its own status display.

File manager 3.35.1 carries the matching application OTA and compares the application against DE3.57. Diagnostics from 3.35.0 remain available. BL8, S112, PFS1 and existing collections are not replaced by this application update. Existing matching PFS1 devices need neither formatting nor restoration.

## Downloads

- [Allmiibo_LCD_DE3_57_629_TESTSTAND.zip](https://github.com/bluecyber81/pixl.js/releases/download/de3.57/Allmiibo_LCD_DE3_57_629_TESTSTAND.zip): application-only flashable OTA; use the unchanged ZIP.
- [Allmiibo_Dateimanager_3_35_1.zip](https://github.com/bluecyber81/pixl.js/releases/download/de3.57/Allmiibo_Dateimanager_3_35_1.zip): portable file manager.
- [Allmiibo_DE3_57_Quellcode.zip](https://github.com/bluecyber81/pixl.js/releases/download/de3.57/Allmiibo_DE3_57_Quellcode.zip): firmware/project source and developer documentation.
- [Allmiibo_Dateimanager_3_35_1_Quellcode.zip](https://github.com/bluecyber81/pixl.js/releases/download/de3.57/Allmiibo_Dateimanager_3_35_1_Quellcode.zip): browser source and tests.
- [Allmiibo_DE3_57_Web3_35_1_Gesamtpaket.zip](https://github.com/bluecyber81/pixl.js/releases/download/de3.57/Allmiibo_DE3_57_Web3_35_1_Gesamtpaket.zip): complete download; **the outer ZIP is not flashable**.

[Online file manager](https://bluecyber81.github.io/pixl.js/) · [DFU page](https://bluecyber81.github.io/pixl.js/dfu/web.html) · [Build guide](docs/BUILD_DE3_57.md) · [Validation](docs/validation/DE3_57.json)

## Validation scope

Host tests check state transitions and actual LCD rendering. Build and package checks are documented separately from device testing. **Physical validation of the new indicator is pending.** Earlier successful DE3.56 diagnostics are not relabelled as DE3.57 device tests. This release does not claim faster startup or greater radio range.

Enlarged preview from the firmware renderer, not a device photograph.

![DE3.57 Bluetooth status](https://raw.githubusercontent.com/bluecyber81/pixl.js/de3.57/docs/images/de357-bluetooth-status.png)

---

# File manager 3.35.0 – combined read-only diagnostics

Browser-only update. Firmware DE3.56/628, BL8 and S112 7.3.0 are unchanged.

Device & diagnostics → Read all diagnostic values collects eight sections sequentially. The combined report adds startup markers, RAM details, configured stack/cache sizes, firmware-reported MTU, storage geometry and the last settings-menu session, with per-section receipt times and partial failures. Unknown battery state and unsupported storage commands no longer produce misleading values/errors. No background reads, file changes, formatting or firmware flash.

[Online file manager](https://bluecyber81.github.io/pixl.js/) · [Downloads and source](https://github.com/bluecyber81/pixl.js/releases/tag/web3.35.0) · [Usage and limits](docs/DIAGNOSTICS_3_35.md)

A subsequent user-provided phone report confirms all eight diagnostic sections in 1.352 seconds without section errors. This is readback evidence, not a complete hardware or stress test. [Evidence and limits](docs/validation/WEB3_35_0_READBACK.json).

---

# DE3.56 and Dateimanager 3.34.0: clearer input and an image gallery

**LCD application 2.22.0-DE3.56 / counter 628 Â· Dateimanager 3.34.0 Â· BL8 Â· Nordic S112 7.3.0 Â· Packed LittleFS PFS1**

This release improves LCD and browser usability. It also fixes inconsistent catalogue use after an update: device search, selection previews, file properties and local file inspection now use the same updated session catalogue as the catalogue panel.

## On the Allmiibo

- **When searching or renaming:** Even in an empty field, each key displays the character inserted by a short middle press. Previously it could display an uppercase letter while inserting a lowercase letter.
- **Short/held middle press:** The header shows hints such as `q/Q` for short/held input or `_/SP` for underscore/space. Existing input behavior is preserved. Long titles are clipped so they cannot cover this hint; no additional heap allocation is needed.
- **List position:** The scrollbar thumb remains at least three pixels tall in large folders and correctly reaches both ends. Integer arithmetic replaces floating point; empty lists have no misleading position marker.

## In the file manager

1. **Figure catalogue â†’ Show images:** An optional gallery loads images only for the current page. No gallery images are requested before opt-in. A fixed-size placeholder handles unavailable images. URLs are pinned to the active catalogue revision. GitHub receives the public figure ID and the visitor's IP address, not device files.
2. **Figure catalogue â†’ Filter collection:** After a collection scan, select present, not found, needs inspection, or unconfirmed/outdated entries. Existing green/orange/red evidence rules remain intact: a partial scan cannot establish absence, and a result retained after disconnection remains labelled as an earlier observation.
3. **Next/Previous:** Explicit page changes reveal and focus the start of the new results. Typing does not move focus or scroll the view. Old details close on a page change; the gallery preference remains selected.
4. **Check for new figures:** Accepted catalogue data also applies to device-wide search, selection previews, file properties and local figure-file inspection. An in-progress device search stops when the catalogue changes and can be restarted with the new data. Late results or image errors from the old revision cannot replace the current selection.

The bundled catalogue still contains **952 IDs**. Catalogue entries and images are not figure files, and an ID match proves neither signature validity nor game compatibility. No private BIN collection has been added.

## Downloads and installation

- [Allmiibo_LCD_DE3_56_628_TESTSTAND.zip](https://github.com/bluecyber81/pixl.js/releases/download/de3.56/Allmiibo_LCD_DE3_56_628_TESTSTAND.zip): **application-only OTA** for matching LCD/PFS1 devices. Do not extract and re-zip it.
- [Allmiibo_Dateimanager_3_34_0.zip](https://github.com/bluecyber81/pixl.js/releases/download/de3.56/Allmiibo_Dateimanager_3_34_0.zip): portable file manager with a local launcher.
- [Allmiibo_DE3_56_Quellcode.zip](https://github.com/bluecyber81/pixl.js/releases/download/de3.56/Allmiibo_DE3_56_Quellcode.zip): firmware/project source and contributor documentation.
- [Allmiibo_Dateimanager_3_34_0_Quellcode.zip](https://github.com/bluecyber81/pixl.js/releases/download/de3.56/Allmiibo_Dateimanager_3_34_0_Quellcode.zip): browser source and tests.
- [Allmiibo_DE3_56_Web3_34_0_Gesamtpaket.zip](https://github.com/bluecyber81/pixl.js/releases/download/de3.56/Allmiibo_DE3_56_Web3_34_0_Gesamtpaket.zip): complete download with instructions and checksums. **The outer archive is not flashable.**
- `SHA256SUMS.txt`: published asset checksums.

[Online file manager](https://bluecyber81.github.io/pixl.js/) Â· [Application DFU page](https://bluecyber81.github.io/pixl.js/dfu/web.html) Â· [Build guide](https://github.com/bluecyber81/pixl.js/blob/de3.56/docs/BUILD_DE3_56.md)

The browser additions do not require a device update. DE3.56 is required for the new keyboard rendering and scrollbar. **BL8, Nordic S112 7.3.0 and the PFS1 storage layout are unchanged.** An existing compatible collection needs no format or restore. Old DE3.8/DE3.16/SPIFFS and ordinary upstream LittleFS still require their own migration path; this ZIP does not convert their storage. [Separate BL8/S112 downloads](https://github.com/bluecyber81/pixl.js/releases/tag/bl8-s112-7.3.0) retain their own installation requirements.

## Validation and limits

Targeted regressions exercise the production Vue components with catalogue replacement, image opt-in, filters and pagination, plus device text-entry and scrollbar rendering in host tests. Final outcomes belong in the version-specific validation report. Earlier DE3.55 device observations are not device tests of DE3.56. **Direct testing of this new release on the physical device is still pending.** This update claims neither a faster startup nor new radio/NFC functionality.

Existing storage, button, Bluetooth/NFC, DFU, backup and migration functionality remains in the source. Private keys, device backups and figure dumps are excluded. Attribution and licenses from solosky, cylin577 and component authors remain applicable. [Detailed history](https://github.com/bluecyber81/pixl.js/blob/de3.56/docs/DEVELOPMENT_HISTORY.md).

## Previews

Browser screenshot without a device; LCD render from production code and fonts, not a photograph.

![Galerie](https://raw.githubusercontent.com/bluecyber81/pixl.js/de3.56/docs/images/de356-gallery.png)

![LCD-Tastatur](https://raw.githubusercontent.com/bluecyber81/pixl.js/de3.56/docs/images/de356-keyboard.png)
