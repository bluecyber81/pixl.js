# Allmiibo LCD firmware and file manager

[Open file manager](https://bluecyber81.github.io/pixl.js/) · [Firmware and downloads](https://github.com/bluecyber81/pixl.js/releases/tag/de3.60) · [Deutsch](README.de.md)

**DE3.60 / 632** improves the 128 × 64 LCD controls. The signed update contains the device application for the nRF52832 Allmiibo LCD with an existing Packed LittleFS (PFS1) volume.

* **Bluetooth file transfer.** Holding left or right changes the QR page once. The code opens the file manager on GitHub Pages. The status screen also shows the exit gesture.
* **On-screen keyboard.** Holding a letter enters one uppercase character. Holding Enter confirms once. Backspace still repeats. Use X to cancel without saving.
* **Settings.** Short values such as ON and OFF have a fixed column. Disabling animation still shows the title. A save error stays on screen for acknowledgement. A failed card export preserves the filename for retry.
* **Amiibo emulator → file menu → create multiple tags.** The display shows the file and its number in the batch. Cancel stops between committed files. Existing names, a full drive and insufficient RAM have distinct messages.
* **File manager 3.37.3 → Firmware update.** The page distinguishes transfer, checksum checks and final Execute acknowledgement. The running application version is confirmed separately after restarting.

[LCD pixels](docs/validation/DE3_60_LCD.png) · [Build and test results](docs/validation/DE3_60.json)

## Install or contribute

1. Back up the collection on a compatible LCD/PFS1 device. Select the inner **Allmiibo_LCD_DE3_60_632_TESTSTAND.zip** from the release. Enter firmware-update mode on the device and follow the [DFU page](https://bluecyber81.github.io/pixl.js/dfu/web.html). Existing PFS1 devices need no storage conversion.
2. For ordinary transfer, open Bluetooth file transfer on the device and choose **Connect** in the browser. For offline Windows use, extract the portable ZIP and open **Start-Dateimanager.cmd**. [File manager instructions](web/README.md)
3. Contributors can find the [application](fw), [browser source](web), and [BL8 source](bootloader-bl8) in this tree. [Contribution guide](CONTRIBUTING.md) · [Build the LCD application](docs/BUILD_DE3_60.md)

This community continuation by bluecyber81 draws on work by [solosky](https://github.com/solosky/pixl.js) and [cylin577](https://github.com/cylin577/pixl.js). The source and distribution boundaries for BL8, Nordic S112 and SDK corrections are documented. [Components and evidence](docs/COMPONENTS.md) · [Development history](docs/DEVELOPMENT_HISTORY.md) · [License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)

Older SPIFFS devices including DE3.8 and ordinary upstream LittleFS devices require their own migration path. [Migration and backup](docs/MIGRATION_PFS1.md)
