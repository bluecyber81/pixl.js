# Choose the correct installation path

Read the illustrated file manager's step-by-step guide for the required apps, backup, device update and storage migration. [English](https://bluecyber81.github.io/pixl.js/guide/en.html) · [Deutsch](https://bluecyber81.github.io/pixl.js/guide/index.html)

## Compatible LCD with Packed LittleFS PFS1 already in use

Keep a current backup. Choose the application for the release you intend to run.

| LCD application | Release and intended use |
| --- | --- |
| **DE3.65 / 637** | [Stable release and checksums](https://github.com/bluecyber81/pixl.js/releases/tag/de3.65). Verified on an LCD with Z19 and Nordic S112 7.3.0, including Bluetooth readback, scrolling, NFC and wake. |
| **DE3.68 / 640** | [LCD test release and signed app](https://github.com/bluecyber81/pixl.js/releases/tag/de3.68). Exiting an app selects its icon again on the main menu. A cold start selects the first visible app. |
| **DE3.67 / 639** | [Earlier LCD test release](https://github.com/bluecyber81/pixl.js/releases/tag/de3.67). All 54 German game notes across 63 associations and an adjusted final scrollbar pixel. German hints and QR scanning were confirmed on an LCD Allmiibo. [Device checks](RELEASE_DE3_67.md) · [Build instructions](BUILD_DE3_67.md). |
| **DE3.66 / 638** | [Test release and signed application](https://github.com/bluecyber81/pixl.js/releases/tag/de3.66). Adds display capture and on-device hashing for backup resume. [Build and test evidence](validation/DE3_66.json). [LCD capture, interrupted backup and owner checks](validation/DE3_66_LCD_READBACK.md). |

1. Open the [Web DFU page](https://bluecyber81.github.io/pixl.js/dfu/web.html) and select the intended application. On Android you can also select the signed `NUR_APP.zip` from that release in nRF Device Firmware Update. Keep the ZIP intact.
2. Put the matching LCD into DFU mode and select its DFU advertisement. After completion, confirm the expected version in the normal menu or reconnect to the file manager and read the version.
3. These packages update the application only. Your existing compatible PFS1 volume, bootloader and S112 remain in place. The outer review, portable and source ZIPs are for use on a computer.

## SPIFFS, DE3.8/DE3.16 or another storage layout

Do not treat this as the preceding path. Read [MIGRATION_PFS1.md](MIGRATION_PFS1.md), establish actual board/storage/component identity, save a complete external backup including all 128 metadata bytes, and use a qualified preparation/restoration sequence. Plain upstream LittleFS and this project's PFS1 are different. The current application alone is not a data migration and a bootloader update does not convert external storage.

## Bootloader / SoftDevice

See [COMPONENTS.md](COMPONENTS.md) and [Z19 source/build guide](../bootloader-z19/README.md). The web DFU page is for its supported application path. Combined Nordic system updates use a separately qualified package/client and may need an application reinstall. Do not infer compatibility from the Allmiibo name or reuse a package built for another LCD/OLED revision. A freshly compiled unsigned BIN/HEX is a developer artifact, not a ready-to-flash OTA ZIP.

## File manager only

Open [GitHub Pages](https://bluecyber81.github.io/pixl.js/) or extract the portable ZIP and run its documented start script. This updates browser code without flashing anything. Check the browser version shown on the page against the [file manager release history](VERSIONEN_WEB.md). After a website update, disconnect and reload if an old page is still open; it cannot retroactively replace code already loaded in a tab.

Local `127.0.0.1` addresses refer to the machine opening them. Phones use the HTTPS online page or an appropriately configured local server. The Bluetooth device must be within range of the phone/computer running the page. Permission/device choosers require the user's browser interaction.
