# Choose the correct installation path

Read the illustrated file manager's step-by-step guide for the required apps, backup, device update and storage migration. [English](https://bluecyber81.github.io/pixl.js/guide/en.html) · [Deutsch](https://bluecyber81.github.io/pixl.js/guide/index.html)

## Three downloads for the LCD Allmiibo

| Starting device | Package and procedure |
| --- | --- |
| Compatible nRF52832 LCD with mounted PFS1, Z19 and S112 7.3.0 (FWID 0x0126) | [DE3.72 / 645 application only](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_DE3_72_645_NUR_APP.zip). Save a current backup of E: and select the ZIP in the web updater or nRF Device Firmware Update on Android. |
| Compatible 512 KiB flash / 64 KiB RAM nRF52832 LCD with a bootloader at 0x77000 (MBR parameters 0x7E000, DFU settings 0x7F000), bootloader counter below 19, S112 FWID 0x0103 or 0x0126 and a working Nordic Secure DFU bootloader that trusts the project's key | [DE3.72 / 645 full system](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_S112_7_3_0_Z19_DE3_72_645_KOMPLETT.zip). On Android keep the ZIP intact and use nRF Device Firmware Update. Complete the S112 + Z19 stage and the application stage. Reconnect and read back App645, bootloader 19 with the [Z19 region hash](../bootloader-z19/README.md), and S112 FWID 0x0126. |
| Confirmed SPIFFS, compatible LCD/key, S112 FWID 0x0103 or 0x0126 and an installed application counter below 600 (or PREP600 already running) | [DE3.30-PREP / 600](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_SPIFFS_DE3_30_PREP_600.zip) exposes all 128 metadata bytes. First back up the readable collection outside the device. Follow the [migration procedure](MIGRATION_PFS1.md) before installing either target package. |

Check the starting firmware before using any ZIP. On an OLED board, with an unknown signing key, or with a newer counter, establish a compatible board-specific path first. An open PFS1 import resumes with its original ZIP and browser receipt.

## Compatible LCD with Packed LittleFS PFS1 already in use

Keep a current backup. Choose the application for the release you intend to run.

| LCD application | Release and intended use |
| --- | --- |
| **DE3.72 / 645** | [Current LCD release and device-test status](https://github.com/bluecyber81/pixl.js/releases/tag/de3.72). Restores the correct figure and slot selection and corrects four Zelda game notes. |
| **DE3.65 / 637** | [Stable release and checksums](https://github.com/bluecyber81/pixl.js/releases/tag/de3.65). Verified on an LCD with Z19 and Nordic S112 7.3.0, including Bluetooth readback, scrolling, NFC and wake. |
| **DE3.70 / 642** | [LCD test release](https://github.com/bluecyber81/pixl.js/releases/tag/de3.70). Reduced sorting when browsing figures. First menu selection available in device diagnostics. |
| **DE3.69 / 641** | [LCD test release](https://github.com/bluecyber81/pixl.js/releases/tag/de3.69). Open recent figures from the amiibo database. Android supports opening the package directly in nRF DFU. |
| **DE3.68 / 640** | [LCD test release and signed app](https://github.com/bluecyber81/pixl.js/releases/tag/de3.68). Exiting an app selects its icon again on the main menu. A cold start selects the first visible app. |
| **DE3.67 / 639** | [Earlier LCD test release](https://github.com/bluecyber81/pixl.js/releases/tag/de3.67). All 54 German game notes across 63 associations and an adjusted final scrollbar pixel. German hints and QR scanning were confirmed on an LCD Allmiibo. [Device checks](RELEASE_DE3_67.md) · [Build instructions](BUILD_DE3_67.md). |
| **DE3.66 / 638** | [Test release and signed application](https://github.com/bluecyber81/pixl.js/releases/tag/de3.66). Adds display capture and on-device hashing for backup resume. [Build and test evidence](validation/DE3_66.json). [LCD capture, interrupted backup and owner checks](validation/DE3_66_LCD_READBACK.md). |

1. Open the [Web DFU page](https://bluecyber81.github.io/pixl.js/dfu/web.html) and select the intended application. On Android you can also select the signed `NUR_APP.zip` from that release in nRF Device Firmware Update. Keep the ZIP intact.
2. Put the matching LCD into DFU mode and select its DFU advertisement. After completion, confirm the expected version in the normal menu or reconnect to the file manager and read the version.
3. These packages update the application only. Your existing compatible PFS1 volume, bootloader and S112 remain in place. The outer review, portable and source ZIPs are for use on a computer.

## SPIFFS, DE3.8/DE3.16 or another storage layout

Do not treat this as the preceding path. Read [MIGRATION_PFS1.md](MIGRATION_PFS1.md), establish actual board/storage/component identity, save a complete external backup including all 128 metadata bytes, and use a qualified preparation/restoration sequence. Plain upstream LittleFS and this project's PFS1 are different. The current application alone is not a data migration and a bootloader update does not convert external storage.

## Bootloader / SoftDevice

See [COMPONENTS.md](COMPONENTS.md) and [Z19 source/build guide](../bootloader-z19/README.md). The web DFU page is for its supported application path. For the DE3.72 full package, use the Android procedure above. The second stage installs App645. Do not infer compatibility from the Allmiibo name or reuse a package built for another LCD/OLED revision. A freshly compiled unsigned BIN/HEX is a developer artifact, not a ready-to-flash OTA ZIP.

## File manager only

Open [GitHub Pages](https://bluecyber81.github.io/pixl.js/) or extract the portable ZIP and run its documented start script. This updates browser code without flashing anything. Check the browser version shown on the page against the [file manager release history](VERSIONEN_WEB.md). After a website update, disconnect and reload if an old page is still open; it cannot retroactively replace code already loaded in a tab.

Local `127.0.0.1` addresses refer to the machine opening them. Phones use the HTTPS online page or an appropriately configured local server. The Bluetooth device must be within range of the phone/computer running the page. Permission/device choosers require the user's browser interaction.
