# Choose the correct installation path

Check the display model, current storage format and SoftDevice before choosing a package. Back up the device's files first.

## Current LCD firmware DE3.81 / App654

For a compatible nRF52832 LCD with Packed LittleFS and a working project Secure DFU bootloader, use the application ZIP to update the app. To install Z21 as well, choose the combined ZIP in **nRF Device Firmware Update** on Android. The system upgrade requires the matching flash layout and signing key, an installed bootloader counter below 21 and S112 firmware ID 0x0103 or 0x0126. Let both phases finish. After reconnecting, check for DE3.81, app counter 654 and, after the combined update, bootloader counter 21 and S112 7.3.0. For a device still using SPIFFS, follow the migration guide first. [Application](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_DE3_81_654_NUR_APP.zip) · [Combined ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_S112_7_3_0_Z21_DE3_81_654_KOMPLETT.zip) · [Migration](MIGRATION_PFS1.md)

Read the illustrated file manager's step-by-step guide for the required apps, backup, device update and storage migration. [English](https://bluecyber81.github.io/pixl.js/guide/en.html) · [Deutsch](https://bluecyber81.github.io/pixl.js/guide/index.html)

## OLED DE3.81 Test 1

This signed application targets the nRF52832 Pixl.js OLED with a 128 × 64 SH1106, a compatible Pixl.js DFU bootloader and Nordic S112 7.2.0 (FWID `0x0103`). The reference releases are cylin577 OLED v2.21.0 and v2.27.11. Supported external flash chips have a recognized ID and a capacity of 2, 4, 8 or 16 MiB. Use an intact SPIFFS volume or a native LittleFS volume whose files you have checked.

1. Save the previous OLED application ZIP and download the new ZIP to the phone. [OLED Test 1 app ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.81-oled-t1/Allmiibo_OLED_DE3_81_Test1_APP.zip)
2. On the OLED, select **Settings → Firmware Update**. In **nRF Device Firmware Update**, select the intact ZIP and connect to **pixl dfu**. This package updates only the application and uses the existing storage format.
3. After the restart, check for `2.22.0-DE3.81-OLEDt1` (app counter 81). Try both options under **Settings → Language**, check the file list, and test a known figure and sleep/wake. One user reports that Test 1 works on an OLED. The device’s filesystem and results for the individual checks remain unknown. [Test guide in English and German](https://github.com/bluecyber81/pixl.js/releases/download/de3.81-oled-t1/Allmiibo_OLED_Test1_Deutsch_English.txt) · [OLED release](https://github.com/bluecyber81/pixl.js/releases/tag/de3.81-oled-t1)

## Three downloads for the LCD Allmiibo

| Starting device | Package and procedure |
| --- | --- |
| Compatible nRF52832 LCD with mounted PFS1, Z19, Z20 or Z21 and S112 7.3.0 (FWID 0x0126) | [Current DE3.81 / 654 application only](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_DE3_81_654_NUR_APP.zip). Save a current backup of E: and select the ZIP in the web updater or nRF Device Firmware Update on Android. |
| Compatible 512 KiB flash / 64 KiB RAM nRF52832 LCD with a bootloader at 0x77000 (MBR parameters 0x7E000, DFU settings 0x7F000), bootloader counter below 21, S112 FWID 0x0103 or 0x0126 and a working Nordic Secure DFU bootloader that trusts the project's key | [DE3.81 / 654 full system](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_S112_7_3_0_Z21_DE3_81_654_KOMPLETT.zip). On Android keep the ZIP intact and use nRF Device Firmware Update. Complete the S112 + Z21 stage and the application stage. Reconnect and read back App654, bootloader 21 with the [Z21 region hash](../bootloader-z21/SOURCE_BINDING.json), and S112 FWID 0x0126. |
| Confirmed SPIFFS, compatible LCD/key, S112 FWID 0x0103 or 0x0126 and an installed application counter below 600 (or PREP600 already running) | [DE3.30-PREP / 600](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_SPIFFS_DE3_30_PREP_600.zip) exposes all 128 metadata bytes. First back up the readable collection outside the device. Follow the [migration procedure](MIGRATION_PFS1.md) before installing either target package. |

Check the starting LCD firmware and bootloader before using a package from this table. An unknown signing key or a newer application counter requires a separate compatibility check. An open PFS1 import resumes with its original ZIP and browser receipt.

## Compatible LCD with Packed LittleFS PFS1 already in use

Keep a current backup. Choose the application for the release you intend to run.

| LCD application | Release and intended use |
| --- | --- |
| **DE3.81 / 654** | [Current LCD app](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_DE3_81_654_NUR_APP.zip) · [Observed App654, Z21 and S112 7.3.0](validation/DE3_81_LCD_READBACK.json). |
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

The combined system packages are for compatible LCD boards. For current DE3.81, use the [two-stage App654 package](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_S112_7_3_0_Z21_DE3_81_654_KOMPLETT.zip) in nRF Device Firmware Update on Android. The first stage installs S112 7.3.0 and Z21, the second installs App654. The earlier App645 combination remains available in its original release. [Bootloader identity and prerequisites](COMPONENTS.md) · [Z21 source/build guide](../bootloader-z21/README.md) · [Archived App645 full package](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_S112_7_3_0_Z19_DE3_72_645_KOMPLETT.zip)

## File manager only

Open [GitHub Pages](https://bluecyber81.github.io/pixl.js/) or extract the portable ZIP and run its documented start script. This updates browser code without flashing anything. Check the browser version shown on the page against the [file manager release history](VERSIONEN_WEB.md). After a website update, disconnect and reload if an old page is still open; it cannot retroactively replace code already loaded in a tab.

Local `127.0.0.1` addresses refer to the machine opening them. Phones use the HTTPS online page or an appropriately configured local server. The Bluetooth device must be within range of the phone/computer running the page. Permission/device choosers require the user's browser interaction.
