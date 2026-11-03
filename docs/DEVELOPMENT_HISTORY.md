# Improvements and fixed bugs in the DE series

**DE3.55 / application counter 627 · Dateimanager 3.33.1 · BL8 · Nordic S112 7.3.0**

This is the English entry point to the [detailed German before/after record](DEVELOPMENT_HISTORY.de.md), which links each topic to published source and regression tests. The [earlier cumulative changelog](../CHANGELOG_DE3_SERIES.md) retains DE1–DE3.16 history. “Before” refers to the reviewed older downstream code: it is not an assertion that the same problem exists in today's upstream repositories. Some fixes address regressions introduced during this fork's own storage transition.

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
