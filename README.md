# Allmiibo LCD firmware and file manager

[Open file manager](https://bluecyber81.github.io/pixl.js/) · [Firmware and downloads](https://github.com/bluecyber81/pixl.js/releases/tag/de3.59) · [Deutsch](README.de.md)

**DE3.59 / 631** is an application update for the nRF52832 Allmiibo LCD with an existing Packed LittleFS (PFS1) volume. **File manager 3.37.0** also supports older diagnostic reports. The BL8 bootloader, Nordic S112 7.3.0, on-disk format and catalog remain in place.

* **Startup reads.** The four existing cache pages now keep recently used block headers. Mounting the same synthetic collection (1,131 files, 77 directories) required 4,712 SPI reads instead of 4,802. The mount-only cache still needs 1,032 bytes. This measures reads, not elapsed time on hardware.
* **Card emulator → Slots → Slot count.** A failed save identifies a slot count that is still in RAM. A short center press retries without re-reading a card that was already saved; a long press returns and preserves the pending change for a later save.
* **Device diagnostics → Runtime.** DE3.59 reports the untouched portion of the reserved stack. In **Startup times → Compare multiple cold starts**, the browser calculates median and range from 3–20 reports of the same firmware.
* **Settings → Version info.** The short source identifier for this release is `7b4822b045b4`. Two independent builds produced the same image. The catalog in that image contains 952 figure IDs, 82 games and 1,344 associations.

[Changes and menu paths](RELEASE_NOTES_EN.md) · [Validation](docs/validation/DE3_59.json)

## Install or contribute

1. Back up the collection on a compatible LCD/PFS1 device. Select the inner **Allmiibo_LCD_DE3_59_631_TESTSTAND.zip** from the release. Enter firmware-update mode on the device and follow the [DFU page](https://bluecyber81.github.io/pixl.js/dfu/web.html). Existing PFS1 devices need no storage conversion.
2. For ordinary transfer, open Bluetooth file transfer on the device and choose **Connect** in the browser. For offline Windows use, extract the portable ZIP and open **Start-Dateimanager.cmd**. [File manager instructions](web/README.md)
3. Contributors can find the [application](fw), [browser source](web), and [BL8 source](bootloader-bl8) in this tree. [Contribution guide](CONTRIBUTING.md) · [Build the LCD application](docs/BUILD_DE3_59.md)

This community continuation by bluecyber81 draws on work by [solosky](https://github.com/solosky/pixl.js) and [cylin577](https://github.com/cylin577/pixl.js). The source and distribution boundaries for BL8, Nordic S112 and SDK corrections are documented. [Components and evidence](docs/COMPONENTS.md) · [Development history](docs/DEVELOPMENT_HISTORY.md) · [License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)

Older SPIFFS devices including DE3.8 and ordinary upstream LittleFS devices require their own migration path. [Migration and backup](docs/MIGRATION_PFS1.md)
