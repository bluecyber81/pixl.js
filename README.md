# Allmiibo LCD firmware and file manager

[Open file manager](https://bluecyber81.github.io/pixl.js/) · [Firmware and downloads](https://github.com/bluecyber81/pixl.js/releases/tag/de3.58) · [Deutsch](README.de.md)

For **Allmiibo LCD with nRF52832 and an existing Packed LittleFS (PFS1) installation**. The 4 November 2026 release combines **2.22.0-DE3.58, counter 630**, **file manager 3.36.0**, **BL8** and **Nordic S112 7.3.0**. The tested Allmiibo reported DE3.58/630. Its owner confirmed card-slot switching and NFC recognition of a figure on Switch 2. [Device readback](docs/validation/DE3_58_READBACK.json).

* **Card emulator.** Slot changes distinguish save errors from load errors. Shrinking from 50 to 8 slots can no longer leave the old slot selected on a failed second save. Selecting the card ID skips unnecessary storage access.
* **Web DFU.** Selecting a ZIP displays the application counter, hardware field and allowed SoftDevice IDs. A boot snapshot received within the last ten minutes enables comparison. Mixed or contradictory init packets are rejected before opening the Bluetooth chooser.
* **Startup.** Compare a saved startup report with current timings in the diagnostics panel. Across one startup per version on the same Allmiibo, storage initialization took 2,387 ms versus 2,450 ms on DE3.57. The first application dispatch occurred at 2,490 ms versus 2,553 ms.
* **Device UI.** German menus have shorter labels. On the emulator's save-error screen a short middle press retries and a long press goes back.

[Changes and menu paths](RELEASE_NOTES_EN.md) · [Validation](docs/validation/DE3_58.json)

## Install or contribute

1. Back up the collection on a compatible LCD/PFS1 device. Select the inner **Allmiibo_LCD_DE3_58_630_TESTSTAND.zip** from the release. Enter firmware-update mode on the device and follow the [DFU page](https://bluecyber81.github.io/pixl.js/dfu/web.html). Existing PFS1 devices need no storage conversion.
2. For ordinary transfer, open Bluetooth file transfer on the device and choose **Connect** in the browser. For offline Windows use, extract the portable ZIP and open **Start-Dateimanager.cmd**. [File manager instructions](web/README.md)
3. Contributors can find the [application](fw), [browser source](web), and [BL8 source](bootloader-bl8) in this tree. [Contribution guide](CONTRIBUTING.md) · [Build the LCD application](docs/BUILD_DE3_58.md)

This community continuation by bluecyber81 draws on work by [solosky](https://github.com/solosky/pixl.js) and [cylin577](https://github.com/cylin577/pixl.js). The source and distribution boundaries for BL8, Nordic S112 and SDK corrections are documented. [Components and evidence](docs/COMPONENTS.md) · [Development history](docs/DEVELOPMENT_HISTORY.md) · [License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)

Older SPIFFS devices including DE3.8 and ordinary upstream LittleFS devices require their own migration path. [Migration and backup](docs/MIGRATION_PFS1.md)
