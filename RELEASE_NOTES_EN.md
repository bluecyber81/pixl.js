# DE3.16 — Allmiibo LCD community prerelease

Application version **2.21.0-DE3.16**, DFU counter **572**. Based on cylin577/pixl.js v2.21.0 (`57a364329436745f780e70ac07a1642989a00d6f`), derived from solosky/pixl.js. This is a community release, not an official upstream update.

[Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/de3.16) · [Cumulative DE-series changes](https://github.com/bluecyber81/pixl.js/blob/de3.16/CHANGELOG_DE3_SERIES.md)

## Changes from DE3.15

- **SPIFFS:** propagate failed header reads during object-ID allocation, preventing the reproduced error path from selecting an already occupied ID and then writing.
- **Player:** check memory when constructing the selected playback path; preserve the prior selection and report allocation failure.
- **Player directory loading:** distinguish normal EOF from read/close errors, discard an incomplete list and retain the main-menu entry. Handle list-allocation failure through the existing memory-error UI.

These are the new changes in DE3.16. Earlier DE-series improvements remain included: negotiated MTU23 transport, transfer cleanup and invalid-READ continuation protection, storage/cache error handling, settings-save feedback, center-button wake restoration, slower LCD text, UI memory/UTF-8 fixes, NFC bounds, and the separate Vue 3/Vite file manager. The cumulative changelog documents the individual scopes.

## Verification

- 70 firmware host suites passed.
- 175 focused cases (17 SPIFFS + 158 Player) passed natively and again under ASan/UBSan, with baseline negative controls and independent source review.
- ARM LCD build, source/test binding, application-only package metadata, payload hash and signature checked.
- Browser DFU completed on one matching LCD unit; normal menu and fresh `2.21.0-DE3.16` readback with observed ATT MTU250 confirmed.
- File manager **3.12.0** is unchanged; its original 84-test evidence is reused, not a new web test run.

NFC, sleep/wake and actual ATT MTU23 have not been rerun on DE3.16. Real MTU23 read/write/error-case results from DE3.15 are historical evidence, not DE3.16 certification. No runtime RAM/stack watermark, endurance or arbitrary power-loss guarantee is claimed.

## Downloads and limits

Flash **`Allmiibo_LCD_DE3_16_572.zip`** only on a matching nRF52832 LCD device with a compatible existing DFU environment. The tested design has a 128×64 monochrome LCD and wheel/center button; other board revisions and OLED variants are not covered. The application OTA does not install a bootloader, SoftDevice, figure dumps or `key_retail.bin`. The browser file manager is separate.

An intermittent malformed extra **Tybalt** directory entry remains unresolved. This release is not a confirmed fix for it and performs no automatic storage repair, deletion or formatting.

The DE3.15 recovery application uses counter **573** and preserves the previous application bytes. After recovery, later updates need a counter above 573. Recovery does not restore file/settings backups.

Credits and the GNU GPL version 2 license are retained. Please consult the README and cumulative changelog before installing.
