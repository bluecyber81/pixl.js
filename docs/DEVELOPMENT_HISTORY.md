# Improvements and fixed bugs in the DE series

## File manager 3.41.0 · 7 November 2026

Each catalogue entry can remember a direct HTTPS link to its BIN file. Click the figure name to download it. The browser checks the size, basic structure and figure ID first. [Web 3.41.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.41.0) · [Usage](DATEIMANAGER_WEB.md#dateimanager-3410)

## File manager 3.40.1 · 7 November 2026

The updater preselects the package from its download card and clears the loaded ZIP when the selection changes. The catalogue filter includes the three series with announcements only. Completed backups report fresh and reused file counts and sizes. [Web release](https://github.com/bluecyber81/pixl.js/releases/tag/web3.40.1) · [LCD and Android backup observations](validation/DE3_66_LCD_READBACK.md)

## DE3.66 / 638 and file manager 3.40.0 · 7 November 2026

The LCD test application supports display capture and can hash files up to 572 bytes on E: when resuming a backup. Web 3.40.0 adds nine figure announcements, inline search previews and estimated time remaining during DFU. Inventory still uses 952 confirmed figure IDs. DE3.65 / 637 is the stable application verified on LCD with Z19 and Nordic S112 7.3.0. Display capture, button input, menus and NFC on a Switch were confirmed on one LCD unit. An interrupted backup resumed over Windows Bluetooth and in Chrome on Android. [Features and installation](RELEASE_DE3_66.md) · [Web downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.40.0)

[Firmware and bootloader history](VERSIONEN_FIRMWARE.md) · [File manager patch history](VERSIONEN_WEB.md)

## DE3.65 final and file manager 3.39.5

Sync explains how to repeat a comparison when a device or local file has changed. Backup explains the limits of resuming. Web DFU and the phone download offer identical App637 bytes. An LCD device reported Z19 and Nordic S112 7.3.0. [LCD](validation/DE3_65_LCD_READBACK.json) · [Web](RELEASE_WEB3_39_5.de.md)

## DE3.65 / 637 and file manager 3.39.4

The LCD application corrects the three-line scrollbar and frees 2,672 bytes of program flash versus DE3.64. The file manager explains filename conflicts, translates the 54 distinct English catalogue hints into German and supports a screen wake lock during DFU. The signed app was accepted by Z19 with App636 in an ARM model. [Application and checks](https://github.com/bluecyber81/pixl.js/releases/tag/de3.65) · [Web release](https://github.com/bluecyber81/pixl.js/releases/tag/web3.39.4)

## File manager 3.39.1

Optional screen wake lock during active operations, visible state, explicit retry and release at completion, disconnect or unmount. No BLE/device changes; manual screen locking remains outside its guarantee.


## File manager 3.39.0

This locally prepared browser update adds catalogue notes to figure details and the selected-file preview: 952 figures, 1,344 associations, eight partial German translations used by 13 associations, with English fallback. These are not game-test results. Collection checks separate matching IDs from SHA-256 content groups without additional BLE reads. Local MF0 slot inspection offers a corrected copy only for matching v8 configuration/slot files, the known legacy UID-copy pattern and valid BCC bytes. Normal ZIP restores visibly exclude inactive OLD/NEW journals; active or unknown transactions block the entire import. App DE3.62/634, Z17 and S112 remain unchanged. Publication, physical testing and a fresh personal backup remain separate steps. [Usage and limits](RELEASE_WEB3_39_0.de.md).

## File manager 3.38.1

A failed backup-drive opening keeps its error visible after a successful return to drive selection. Retry and connection resets clear the scoped error. The browser fixture now reproduces the previously missed listing-error reset. App634/DE3.62, Z17 and S112 are unchanged. The card-buffer test now counts all 5,150 existing assertions; this is a reporting correction, not another firmware fix. [Review](RELEASE_WEB3_38_1.de.md).

## DE3.62 / 634 and file manager3.38.0

The card-buffer boundary is checked before import/export. Critical own-C type
diagnostics now fail the build. Docker and native Linux builds reproduce the
same application bytes. Startup schema3 exposes actual mount counters without
changing the storage layout or cache size. The browser explains RAM sample
counts and shows backup drive failures where the action was started.

The separate Z17 candidate adds real final-validation/commit LCD phases and
the required font glyphs. S112 remains Nordic7.3.0. Host results are complete;
new physical tests are pending. [Release record](RELEASE_DE3_62.md) ·
[Build and tests](BUILD_DE3_62.md) · [Storage evidence](diagnostics/DE3_62_STORAGE.md).

## DE3.59 / 631

**DE3.59 / 631** is an application update for the nRF52832 Allmiibo LCD with an existing Packed LittleFS (PFS1) volume. **File manager 3.37.0** also supports older diagnostic reports. The BL8 bootloader, Nordic S112 7.3.0, on-disk format and catalog remain in place.

* **Startup reads.** The four existing cache pages now keep recently used block headers. Mounting the same synthetic collection (1,131 files, 77 directories) required 4,712 SPI reads instead of 4,802. The mount-only cache still needs 1,032 bytes. This measures reads, not elapsed time on hardware.
* **Card emulator → Slots → Slot count.** A failed save identifies a slot count that is still in RAM. A short center press retries without re-reading a card that was already saved; a long press returns and preserves the pending change for a later save.
* **Device diagnostics → Runtime.** DE3.59 reports the untouched portion of the reserved stack. In **Startup times → Compare multiple cold starts**, the browser calculates median and range from 3–20 reports of the same firmware.
* **Settings → Version info.** The short source identifier for this release is `7b4822b045b4`. Two independent builds produced the same image. The catalog in that image contains 952 figure IDs, 82 games and 1,344 associations.

Historical baseline for the following comparison: **DE3.58 / 630 · file manager 3.36.0 · BL8 · Nordic S112 7.3.0**.

This is the English entry point to the [detailed German before/after record](DEVELOPMENT_HISTORY.de.md), which links each topic to published source and regression tests. The [earlier cumulative changelog](../CHANGELOG_DE3_SERIES.md) retains DE1–DE3.16 history. “Before” refers to the reviewed older downstream code: it is not an assertion that the same problem exists in today's upstream repositories. Some fixes address regressions introduced during this fork's own storage transition.

## DE3.58 and file manager 3.36.0

The emulator reports save and load failures separately and saves the old card once when shrinking the slot count. The DFU page shows package fields and can compare them with a recent boot diagnostic. The owner confirmed switching card slots and reading a figure on Switch 2. The device reported DE3.58/630 over Bluetooth. [Device readback](validation/DE3_58_READBACK.json) · [Changes and verification](../RELEASE_NOTES_EN.md).

## New in DE3.57 / file manager 3.35.1

The static symbol beside the battery voltage is replaced by a **Bluetooth status indicator**: crossed out = inactive, radio waves = advertising, open dot = physical link without a ready data channel, filled dot = data channel ready, minus = disconnecting or switching mode. It also reflects active remote-control connections. The indicator neither enables Bluetooth nor blinks.

Existing firmware state changes update the indicator, without extra radio queries, timers or storage writes. The file-transfer screen retains its own status messages. [Symbols, use and limits](BLUETOOTH_STATUS_DE3_57.md).

File manager **3.35.1** updates the packaged application OTA and expected application identity to DE3.57; diagnostics from 3.35.0 remain available. **BL8, Nordic S112 7.3.0, PFS1 and existing Amiibos are unchanged.** The DE3.57 advertising state was subsequently observed on the LCD. [DE3.57 readback](validation/DE3_57_READBACK.json).

## File manager 3.35.0: combined read-only diagnostics

Eight existing firmware diagnostic sections are read sequentially on demand, with per-section receipt times and one allowlisted JSON export. Adds startup/RAM details, firmware MTU, PFS geometry/cache configuration and the last settings session. Corrects stale free-space displays, unknown battery state and misleading errors for unsupported read commands. Firmware DE3.56, BL8, S112 and PFS1 are unchanged. [Usage and limits](DIAGNOSTICS_3_35.md).

## DE3.56 / Dateimanager 3.34.0: input, gallery and catalogue consistency

BL8, Nordic S112 7.3.0, PFS1 layout and the storage core are unchanged. Existing compatible collections need no migration. Physical DE3.56 testing is pending; no additional startup speed improvement is claimed.

| Earlier behavior | Change and use |
| --- | --- |
| An empty text field could show an uppercase key while a short press inserted lowercase. | Search/rename keycaps now match short input. `q/Q` explains short/held input and `_/SP` underscore/space. Long Unicode titles cannot obscure the hint; insertion behavior is unchanged. |
| The list marker could shrink to one pixel and miss the exact end position. | A minimum three-pixel LCD thumb, correct endpoints, integer calculation and no marker on an empty list. |
| Images required opening individual details. | Figure catalogue → Show images enables a current-page gallery with fixed-size placeholders and revision-pinned URLs. No gallery requests before opt-in. |
| Coloured collection cards could not be filtered by inspection state. | Filter collection selects present, not found, needs inspection or unconfirmed/outdated entries. Partial scans never prove absence; disconnected results retain their historical label. |
| Paging left the user below the new results. | Next/Previous reveals the result start and closes old details. Typing never steals focus. |
| Following a catalogue update, search, preview and file inspection could retain the bundled data. | Device search, selection preview, properties and local file inspection share the accepted session catalogue. In-flight searches stop on replacement; late old results/image errors cannot overwrite the new view. |

Device paths include **Amiibo database → Search** and **Amiibo emulator → file-browser action menu → Rename / New folder / New tag**. The keyboard hint needs no additional heap allocation. The scrollbar applies to the existing list/folder views.

Focused host regressions exercise production drawing code and Vue components, including App bindings, catalogue replacement during pending search, image opt-in/errors, status filters, pagination and local BIN inspection. Sources: [device graphics](../fw/tests/de3/test_ui_comfort_de356.py), [catalogue comfort](../web/tests/catalogue-comfort.test.mjs), [active catalogue](../web/tests/active-catalogue.test.mjs), [figure details](../web/tests/figure-components.test.mjs), [device search](../web/tests/device-search-ui.test.mjs) and [selection preview](../web/tests/selection-preview-ui.test.mjs). Final release outcomes and physical testing remain separate evidence.

The catalogue still contains 952 IDs. Image retrieval shares the public ID and visitor IP with the image host, not device files; catalogue metadata/images are not new figure dumps. See [release notes](../RELEASE_NOTES_EN.md) and [build guide](BUILD_DE3_56.md).

## Device UI, input and RAM

| Earlier behavior | Retained change |
| --- | --- |
| Scrolling descriptions interfered with scanning figure QR information. | Separate stable QR area, figure information/navigation and corrected public information URLs. |
| Full in-memory database/large-folder lists exhausted the application heap after migration. | Bounded/paged lists, partial-allocation cleanup, bounded favorites and released unused view capacity. |
| Short middle presses could be lost through debounce/event sequencing or queue pressure. | Corrected input lifecycle and queue handling with targeted negative/regression tests. |
| Settings navigation lost focus or repeated expensive storage work. | Restore selection, cache/invalidate relevant storage statistics and avoid redundant operations. |
| Text editing/display edge cases mishandled UTF-8 or temporary buffers. | Bounded rendering and in-place edits; backlight/editor paths received targeted tests. |

## Storage, startup and data preservation

| Earlier behavior | Retained change |
| --- | --- |
| SPIFFS migration could not be treated as a simple firmware replacement. | Dedicated preparation/Raw128 backup, qualified PFS1 initialization, resumable restoration and a final complete comparison. |
| Startup repeatedly loaded/scanned metadata and computed related checksums separately. | Reuse verified indexes, stream mount work, use a CRC lookup table and calculate the two PFS1 CRC states in one pass. |
| Repeated garbage collection/status work added latency and writes. | Targeted reduction of redundant GC, writes and repeated status checks. |
| Specific LittleFS read/cache/wear edge cases affected correctness or metadata placement. | Backports for FCRC read-error propagation, invalid read-cache handling after block-end seek, and a metadata-wear correction. |
| Filesystem and drive-boundary errors could leak through inconsistent paths. | Explicit boundary/error handling, bounded recovery and checked persistent operations. |

PFS1 remains a custom packed layout. It is not ordinary upstream LittleFS, and an application update does not migrate SPIFFS. Physical RAM and flash capacity are unchanged. The recorded DE3.55 application startup of about 2.31 seconds excludes bootloader/early SDK time; it is a dated observation, not a universal boot-time guarantee.

## NFC, card emulator and saved state

- Preserve unsaved tag changes when storage fails; offer retry or deliberate discard and prevent silent loss on application/tag/sleep transitions. RAM cannot survive power loss.
- Complete NFC shutdown and protect transitions between NFC ownership, application state and remote control.
- Validate card factory/load/UID failure paths and avoid exposing partially initialized slot state.
- Correct AmiLoop/database-slot persistence behavior, bounded slot/configuration handling and raw metadata restoration.
- Correct NFC sector-select framing/recovery, including the LEGO/NTAG213-related path.
- Provide an optional Disney Infinity profile for a suitable own 320-byte MiFare Mini file; it is not a source of card contents or proof of portal compatibility.
- Correct card shadow-save retry, the dirty-state ambiguity of CRC16 collisions, and NFC/card-stop persistence handling.

## Bluetooth and remote control

- Distinguish a radio connection, an initialized file client and advertising visibility. Incomplete clients are released after the configured 30-second grace period.
- Negotiate transfer sizes, retain MTU23 behavior and check request/response framing and legacy-client boundaries.
- Improve disconnect, timeout, reply/session ownership, abort and reconnect handling.
- Provide opt-in remote control until power-off and a guarded direct transition into file-transfer mode.
- Commit small file content with complete Raw128 metadata and preserve restoration/abort semantics.

These are application/browser changes. They are not custom patches to the proprietary Nordic stack.

## Browser, backup, DFU and collection workflow

- ZIP import preserves logical paths and metadata; recovery can resume with the same archive and matching device/receipt. Folder metadata conflicts are retained/reported.
- Diagnostic preview/copy/save options distinguish a requested browser download from a file actually saved.
- DFU object/resume validation handles a longer init packet left from an earlier update instead of unnecessarily rejecting the new package. This is a **browser DFU fix**, not a new device bootloader revision.
- Figure previews/images, cross-folder search and a unified file/folder/ZIP upload flow reduce navigation work.
- Package choices and capacity simulations are tied to compatible firmware/storage-engine identities. Older simulation profiles remain distinct.
- Pinned dependency patches, corresponding notices and a static HTTPS GitHub Pages build are maintained.
- Catalogue freshness/collection checks distinguish metadata-only, partial and full content scans. Own files or own HTTPS sources can be inspected and transferred.
- Full-card green/orange/red frames show found IDs, inspection notes and confirmed absence only after the required complete scan. Missing metadata is unconfirmed. A completed disconnected observation is dated and held only in the open page; reconnection/change/reload invalidates it.
- Contributor checks now handle Windows/Linux native optional packages correctly while validating lock identity and licenses. Issue/PR templates, reproducible unsigned builds and GitHub CI make the current code accessible to other developers.

The bundled catalogue has 952 IDs. Metadata, images and ID matches do not prove a valid/authentic NFC tag or compatibility with every game. Private collections and keys are excluded from public packages.

## Bootloader and SoftDevice

The [dedicated change record](BOOTLOADER_SOFTDEVICE_CHANGES.md) documents cumulative BL8 work: bounded LCD rendering, SPI/DMA error handling, DFU input/activation checks, bounded session-aware BLE replies, verified flash/settings completion, buffer ownership and terminal Execute error handling.

The startup right-hold gesture is inherited upstream work. **Nordic S112 7.3.0 is unchanged vendor software.** Our contribution is its integration, the DRGN-10613 SDK interrupt-mask workaround, diagnostics and package compatibility/signature checks. [Component downloads and counters](COMPONENT_DOWNLOADS.md) keep the standalone counter-9 BL8 OTA separate from the vendor reference ZIP and existing counter-11 installations.

## Evidence

[Application/device summary](validation/DE3_55.json), [BL8 evidence](../bootloader-bl8/EVIDENCE.json), [contributor instructions](../CONTRIBUTING.md) and the current [GitHub Actions runs](https://github.com/bluecyber81/pixl.js/actions) separate source tests, unsigned builds, dated device observations and owner-reported physical checks. The detailed German record links to individual regressions. A passing test is scoped evidence, not proof that every board, power failure, RF event ordering or lifetime wear condition has been covered.
