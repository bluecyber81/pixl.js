# Choose the correct installation path

Check the display model, current storage format and SoftDevice before choosing a package. Back up the device's files first.

## Current LCD firmware DE4.1 / App678

For an ST7567 LCD with existing PFS1, Z21 and S112 7.3.0 (FWID 0x0126), select the intact signed application ZIP in nRF Device Firmware Update on your phone. After restarting, **Device & diagnostics** should report DE4.1, application counter 678, Z21 and S112 7.3.0. [Phone ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de4.1/Allmiibo_LCD_DE4_1_678_NUR_APP.zip) · [Web updater](https://bluecyber81.github.io/pixl.js/dfu/web.html?package=de4.1-lcd-app#board=LCD) · [Qualification](validation/DE4_1.json)

Read the illustrated file manager's step-by-step guide for the required apps, backup, device update and storage migration. [English](https://bluecyber81.github.io/pixl.js/guide/en.html) · [Deutsch](https://bluecyber81.github.io/pixl.js/guide/index.html)

## OLED DE3.87 Test 6 / App86

Use the signed application on a compatible three-button nRF52832 OLED with SH1106, Secure DFU and Nordic S112 7.2.0 (FWID `0x0103`). Back up your files. The app uses the existing SPIFFS or native LittleFS volume.

1. On the OLED, select **Settings → Firmware Update**. On your phone, open **nRF Device Firmware Update**, choose **pixl dfu** and select the intact app ZIP. [OLED app for phones](https://github.com/bluecyber81/pixl.js/releases/download/de3.87-oled-t6/Allmiibo_OLED_DE3_87_Test6_APP.zip)
2. For computer DFU, open the current file manager in Chrome or Edge with Bluetooth enabled. Choose **Update → OLED**, select Test 6 and connect to **pixl dfu**. [File manager](https://bluecyber81.github.io/pixl.js/) · [Browser DFU guide](https://bluecyber81.github.io/pixl.js/guide/en.html#oled-webdfu)
3. Wait for completion and restart. In the version details, check for `2.22.0-DE3.87-OLEDt6`. Try an existing file, the remote, the 5%/100% panel contrast test and your usual NFC workflow. On 18 November 2026, a tester confirmed the remote connection and screen capture on one OLED running Test 6. [English test guide](https://github.com/bluecyber81/pixl.js/releases/download/de3.87-oled-t6/GUIDE_OLED_Test6_EN.txt) · [Deutsche Testanleitung](https://github.com/bluecyber81/pixl.js/releases/download/de3.87-oled-t6/ANLEITUNG_OLED_Test6_DE.txt)

## Three downloads for the LCD Allmiibo

| Starting device | Package and procedure |
| --- | --- |
| Compatible nRF52832 LCD with mounted PFS1, Z21 and S112 7.3.0 (FWID 0x0126) | Back up E: and select the [signed DE4.1 / App678 ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de4.1/Allmiibo_LCD_DE4_1_678_NUR_APP.zip) in the web updater or nRF Device Firmware Update. |
| Compatible 512 KiB flash / 64 KiB RAM nRF52832 LCD with bootloader at 0x77000, MBR parameters at 0x7E000, DFU settings at 0x7F000, bootloader counter below 21, S112 FWID 0x0103 or 0x0126 and a working Secure DFU bootloader that trusts the project key | Use nRF Device Firmware Update on Android. Complete both stages in order, S112 7.3.0 plus Z21, then App662. Reconnect to check App662, Z21 and FWID 0x0126, then apply DE4.1 after verifying PFS1. [Full Android package](https://github.com/bluecyber81/pixl.js/releases/download/de3.89/Allmiibo_LCD_S112_7_3_0_Z21_DE3_89_662_KOMPLETT.zip) · [Z21 region hash](../bootloader-z21/SOURCE_BINDING.json) |
| Confirmed SPIFFS, compatible LCD/key, S112 FWID 0x0103 or 0x0126 and an installed application counter below 600 (or PREP600 already running) | [DE3.30-PREP / 600](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_SPIFFS_DE3_30_PREP_600.zip) exposes all 128 metadata bytes. First back up the readable collection outside the device. Follow the [migration procedure](MIGRATION_PFS1.md) before installing either target package. |

Check the starting LCD firmware and bootloader before using a package from this table. An unknown signing key or a newer application counter requires a separate compatibility check. An open PFS1 import resumes with its original ZIP and browser receipt.

## Compatible LCD with Packed LittleFS PFS1 already in use

Keep a current backup. Choose the application for the release you intend to run.

| LCD application | Release and intended use |
| --- | --- |
| **DE3.89 / 662** | Current ST7567 LCD release with PFS1, Z21 and S112 7.3.0. [Application](https://github.com/bluecyber81/pixl.js/releases/download/de3.89/Allmiibo_LCD_DE3_89_662_NUR_APP.zip) · [Device readback](validation/DE3_89_LCD_READBACK.json) |
| **DE3.87 / 660** | [LCD prerelease](https://github.com/bluecyber81/pixl.js/releases/download/de3.87-lcd-test1/Allmiibo_LCD_DE3_87_660_NUR_APP.zip). App-only update for ST7567, PFS1, Z21 and S112 7.3.0. Physical acceptance is pending. |
| **DE3.81 / 654** | [Archived App654](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_DE3_81_654_NUR_APP.zip) · [Observed App654, Z21 and S112 7.3.0](validation/DE3_81_LCD_READBACK.json). |
| **DE3.75 / 648** | [Archived LCD release](https://github.com/bluecyber81/pixl.js/releases/tag/de3.75). One LCD owner checked list return and wake in both apps in German with resume enabled. The Switch recognized one known figure. [Release notes and checksums](RELEASE_DE3_75.md). |
| **DE3.74 / 647** | [Previous stable LCD release](https://github.com/bluecyber81/pixl.js/releases/tag/de3.74). The owner confirmed that the remote display photo worked. [Device check](validation/DE3_74_LCD_ACCEPTANCE.json). |
| **DE3.72 / 645** | [Earlier LCD release and device-test status](https://github.com/bluecyber81/pixl.js/releases/tag/de3.72). Restores the correct figure and slot selection and corrects four Zelda game notes. |
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

For an LCD moving to PFS1, establish the board, storage and component identity, save a complete external backup including all 128 metadata bytes, and follow the preparation and restoration steps. The OLED test app uses SPIFFS or native LittleFS directly. [LCD migration guide](MIGRATION_PFS1.md)

## Bootloader / SoftDevice

The two-stage DE3.89 Android ZIP contains the signed Z21 and Nordic S112 7.3.0 system image and the signed App662 image. Both signed stages were verified on a computer. [Package verification](validation/DE3_89_COMBO.json). The LCD readback documents an application update on a device already running Z21. The earlier App654 and App645 combinations are available in their original releases. [App662 full system](https://github.com/bluecyber81/pixl.js/releases/download/de3.89/Allmiibo_LCD_S112_7_3_0_Z21_DE3_89_662_KOMPLETT.zip) · [Installation requirements](COMPONENTS.md) · [Historical App654](https://github.com/bluecyber81/pixl.js/releases/tag/de3.81) · [Historical App645](https://github.com/bluecyber81/pixl.js/releases/tag/de3.72)

## File manager only

Open [GitHub Pages](https://bluecyber81.github.io/pixl.js/) or extract the portable ZIP and run its documented start script. This updates browser code without flashing anything. Check the browser version shown on the page against the [file manager release history](VERSIONEN_WEB.md). After a website update, disconnect and reload if an old page is still open; it cannot retroactively replace code already loaded in a tab.

Local `127.0.0.1` addresses refer to the machine opening them. Phones use the HTTPS online page or an appropriately configured local server. The Bluetooth device must be within range of the phone/computer running the page. Permission/device choosers require the user's browser interaction.
