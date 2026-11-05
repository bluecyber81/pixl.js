# Allmiibo LCD firmware and file manager

[Open file manager](https://bluecyber81.github.io/pixl.js/) · [Firmware and downloads](https://github.com/bluecyber81/pixl.js/releases/tag/de3.61) · [Deutsch](README.de.md)

**DE3.61 / 633** is a signed application update for the nRF52832 Allmiibo LCD with an existing Packed LittleFS (PFS1) volume, including the tested Z15 device configuration with Nordic S112 7.3.0. This application has passed computer-based checks. On-device testing of DE3.61 is pending.

* **Settings.** All 21 main settings and their values fit the German and English LCD layouts with menu animation disabled. The remote control state shows when it expires. The RAM overlay uses its drawing font to calculate text width.
* **Storage startup.** Mounting the same test image with 1,131 files and 77 directories took 4,531 flash reads instead of 4,712. **Device & diagnostics → Read startup times** now separates mounting, journal recovery and the rest of storage initialization.
* **Catalog.** More compact references leave 2,644 additional bytes free in application flash. The final image preserves all 952 figures, 82 games, 1,344 links and their localized descriptions.
* **File manager 3.37.5.** Open a detected drive directly in **Backup** to save its files to a ZIP. Diagnostics distinguish the firmware-reported ATT MTU from the usable transport value size. The version comparison recognizes Z15 and identifies the Z16 return package with its Z13 code separately.

[LCD comparison](docs/validation/DE3_61_LCD.png) · [Validation results](docs/validation/DE3_61.json)

## Install or contribute

1. Back up the collection on a compatible LCD/PFS1 device. Select the inner **Allmiibo_LCD_DE3_61_633_TESTSTAND.zip** from the release. Enter firmware-update mode on the device and follow the [DFU page](https://bluecyber81.github.io/pixl.js/dfu/web.html). Existing PFS1 devices need no storage conversion.
2. For ordinary transfer, open Bluetooth file transfer on the device and choose **Connect** in the browser. For offline Windows use, extract the portable ZIP and open **Start-Dateimanager.cmd**. [File manager instructions](web/README.md)
3. Contributors can find the [application](fw), [browser source](web), and [BL8 source](bootloader-bl8) in this tree. [Contribution guide](CONTRIBUTING.md) · [Build the LCD application](docs/BUILD_DE3_61.md)

This community continuation by bluecyber81 draws on work by [solosky](https://github.com/solosky/pixl.js) and [cylin577](https://github.com/cylin577/pixl.js). The source and distribution boundaries for BL8, Nordic S112 and SDK corrections are documented. [Components and evidence](docs/COMPONENTS.md) · [Development history](docs/DEVELOPMENT_HISTORY.md) · [License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)

Older SPIFFS devices including DE3.8 and ordinary upstream LittleFS devices require their own migration path. [Migration and backup](docs/MIGRATION_PFS1.md)
