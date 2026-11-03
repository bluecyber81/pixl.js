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
