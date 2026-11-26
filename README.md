# Allmiibo LCD and Pixl.js OLED

## LCD DE4.2 / App680 and file manager 3.67.0

On supported LCDs, the file manager groups checksums for small files during folder comparison. The figure catalogue loads on demand and includes eight new bilingual game notes. The upload dialog suggests shorter file names. The migration assistant can check available space directly for App680.

**DE4.2 is the owner-confirmed final release** for the nRF52832 Allmiibo with an ST7567 LCD, existing Packed LittleFS (PFS1), Z21 bootloader and Nordic S112 7.3.0 (FWID 0x0126). **Device & diagnostics** shows **2.22.0-DE4.2-b2 / App680**. If you already see that version and counter, you have the final release. The signed application ZIP is byte-for-byte identical to the tested package.

[LCD phone ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de4.2/Allmiibo_LCD_DE4_2_App680_NUR_APP.zip) · [Update an LCD in the browser](https://bluecyber81.github.io/pixl.js/dfu/web.html?package=de4.2-lcd-app#board=LCD) · [Verification kit with BIN and HEX](https://github.com/bluecyber81/pixl.js/releases/download/de4.2/Allmiibo_LCD_DE4_2_App680_Pruefpaket.zip) · [GitHub release](https://github.com/bluecyber81/pixl.js/releases/tag/de4.2)

- **Collection checks and backup.** The file manager reads small files in groups on supported LCDs. On the same App680 LCD, checking the contents of 26 figures of 540 bytes each took 10.29 seconds with file manager 3.66.2, down from 20.85 seconds with 3.66.1. Both runs took about 44 seconds for 25 files of 2 KiB each. A complete backup ZIP has yet to be timed on hardware with 3.67.0.
- **Folder uploads.** App680 can create several small files together in PFS1. The file manager uses this when adding new subfolders. After reconnecting, a folder upload can resume in the same browser tab.
- **Switch 2, images and video.** “Forget pairing” removes the local wake profile after confirmation. The animation player supports looping. You can preview scrolling text on your phone and send it to the LCD.

[Highlights since DE3.10](docs/PROJECT_OVERVIEW.md)

[Open the file manager](https://bluecyber81.github.io/pixl.js/) · [Windows portable ZIP](https://github.com/bluecyber81/pixl.js/releases/download/web3.67.0/Allmiibo_Dateimanager_3_67_0_Portable.zip) · [Web source ZIP](https://github.com/bluecyber81/pixl.js/archive/refs/tags/web3.67.0.zip) · [Guide](https://bluecyber81.github.io/pixl.js/guide/en.html) · [Deutsch](README.de.md)

## OLED and older LCD devices

**DE3.87 Test 6 / App86** is the separate release for the three-button SH1106 OLED. The historical two-stage Android package includes App662 for compatible older LCDs with a bootloader counter below 21. After completing both stages and confirming Z21 and S112 7.3.0, install the separate App680 LCD application. [OLED test release](https://github.com/bluecyber81/pixl.js/releases/tag/de3.87-oled-t6) · [Installation requirements and storage migration](docs/INSTALLATION.md)

## Archive: LCD DE3.89 / App662

| Your LCD device | Download |
| --- | --- |
| Packed LittleFS (PFS1), Z21 and S112 7.3.0 are installed | [Application only for phones (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/de3.89/Allmiibo_LCD_DE3_89_662_NUR_APP.zip) |
| A compatible LCD needs Z21 and S112 7.3.0 | [Two-stage Android package including App662 (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/de3.89/Allmiibo_LCD_S112_7_3_0_Z21_DE3_89_662_KOMPLETT.zip). Requires a bootloader counter below 21, the matching signing key and the correct flash layout. |
| You want to inspect the firmware | [Review kit with BIN, HEX and verification results](https://github.com/bluecyber81/pixl.js/releases/download/de3.89/Allmiibo_LCD_DE3_89_App662_Pruefpaket.zip) |

Back up your files and select the intact ZIP in **nRF Device Firmware Update**. For SPIFFS or an unidentified filesystem, start with the [migration guide](docs/MIGRATION_PFS1.md). [Flashing instructions](https://bluecyber81.github.io/pixl.js/guide/en.html#flash)

On 19 November 2026 the owner confirmed successful practical testing on one LCD. File manager 3.58.2 reported App662, the matching LCD source ID, Z21 and S112 7.3.0. Timing against Mochi on App662 and resuming an interrupted Android firmware update still need separate device tests. [Device readback](docs/validation/DE3_89_LCD_READBACK.json)

## Archive: file manager 3.58.2

Preview, verification and backup can read a small file with a single request. A repeated search checks whether storage has changed before reusing the directory listings. Reconnect in the same browser tab to resume an interrupted folder upload. [Open the file manager](https://bluecyber81.github.io/pixl.js/) · [Windows package and source](https://github.com/bluecyber81/pixl.js/releases/tag/web3.58.2)

## OLED DE3.87 Test 6 / App86 · prerelease

For the three-button Pixl.js OLED with nRF52832, 128 × 64 SH1106, compatible DFU bootloader and S112 7.2.0 (`0x0103`). The signed ZIP contains only the OLED application. It supports English and German and uses the existing SPIFFS or native LittleFS volume. On 18 November 2026, a tester confirmed the remote connection and screen capture on one OLED running Test 6. [OLED app for phones](https://github.com/bluecyber81/pixl.js/releases/download/de3.87-oled-t6/Allmiibo_OLED_DE3_87_Test6_APP.zip) · [English test guide](https://github.com/bluecyber81/pixl.js/releases/download/de3.87-oled-t6/GUIDE_OLED_Test6_EN.txt) · [Sources and test kit](https://github.com/bluecyber81/pixl.js/releases/download/de3.87-oled-t6/Allmiibo_OLED_DE3_87_Test6_Pruefpaket.zip)

Test 6 advertises the remote service in the first Bluetooth advertising packet. The device test lets you compare the 5% and 100% contrast settings on the panel. The database identifies occupied and read-only slots before saving and lets you page through large favorites folders. [Browser flashing and remote setup](https://bluecyber81.github.io/pixl.js/guide/en.html#oled)

<details>
<summary>Previous releases and their original downloads</summary>

## File manager 3.58.1

Open **Update → OLED** to flash Test 6 from Chrome or Edge on a computer or download the signed ZIP for your phone. **Remote control** guides you through selecting the Bluetooth device. [Open the file manager](https://bluecyber81.github.io/pixl.js/) · [Windows package and web source](https://github.com/bluecyber81/pixl.js/releases/tag/web3.58.1)

## LCD DE3.87 / App660 · prerelease

For Allmiibo LCD with ST7567, PFS1, Z21 and S112 7.3.0. The ZIP updates the LCD application. On-device acceptance is pending. [LCD app for phones](https://github.com/bluecyber81/pixl.js/releases/download/de3.87-lcd-test1/Allmiibo_LCD_DE3_87_660_NUR_APP.zip) · [LCD sources and test kit](https://github.com/bluecyber81/pixl.js/releases/download/de3.87-lcd-test1/Allmiibo_LCD_DE3_87_App660_Pruefpaket.zip) · [Setup and operation](https://bluecyber81.github.io/pixl.js/guide/en.html#flash) · [Test report](docs/validation/DE3_87_LCD_TEST1.json)

## LCD DE3.85 / App658 · earlier test release

For **LCD/ST7567 with Packed LittleFS (PFS1), Z21 and S112 7.3.0**. [App-only ZIP for phones](https://github.com/bluecyber81/pixl.js/releases/download/de3.85-lcd-test1/Allmiibo_LCD_DE3_85_658_NUR_APP.zip) · [Sources and proof package](https://github.com/bluecyber81/pixl.js/releases/download/de3.85-lcd-test1/Allmiibo_LCD_DE3_85_App658_Pruefpaket.zip). This update keeps the bootloader, SoftDevice and collection. On 18 November 2026 the owner reported successful LCD testing. Their diagnostic identifies App658, Z21 and S112 7.3.0. A physical Android DFU interruption and resumption remains an open test. DE3.81 / App654 was the regular LCD release at that time.

**Settings → Device test** now cycles through pixel/button information, remote status and the backlight test. Short Center advances; on the light page, Left sets 5% PWM and Right 100%. Short Center returns to the information page; long Center exits. Leaving or sleep restores the previous backlight setting. PWM target/readback values are not measured physical brightness. The larger temporary mount-cache configuration is an experiment, with no claimed real-device speedup yet.

## File manager 3.56.0 · optional automatic screen photo

In **Remote control → Allmiibo DE**, enable **Refresh screen automatically after button presses** if wanted. It starts off, reads one image after acknowledged Left/Center/Right/Back, combines quick sequences and never polls continuously. It stops pending captures on disconnect or file handoff. Unsupported firmware is not probed. Manual capture remains available.

DE3.85 gives Remote its own advertising address. Exit file transfer/AmiiboLink, enable **Settings → Remote → until off**, and select **Pixl.Remote** afresh in the browser. [Open the file manager](https://bluecyber81.github.io/pixl.js/) · [DE/EN guide](https://bluecyber81.github.io/pixl.js/guide/en.html#lcd-de385) · [Web downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.56.0)

## LCD DE3.84 / App657 · earlier owner-tested preview

All four games follow the 180° display setting and include German and English controls. Open **Settings** for automatic dimming and the display and key test. On 17 November 2026, one LCD owner reported successful practical testing with Z21 installed. The report does not list individual cases. Resuming a physically interrupted Android update remains open.

For an Allmiibo LCD with ST7567, Packed LittleFS (PFS1), Z21 and S112 7.3.0, select the intact ZIP in **nRF Device Firmware Update**. [Mobile app ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.84-lcd-test1/Allmiibo_LCD_DE3_84_657_NUR_APP.zip) · [Sources, ELF files, maps and tests](https://github.com/bluecyber81/pixl.js/releases/download/de3.84-lcd-test1/Allmiibo_LCD_DE3_84_App657_Pruefpaket.zip) · [GitHub build and tests](https://github.com/bluecyber81/pixl.js/actions/runs/44047724527)

## File manager 3.55.8 · archive

Version 3.55.8 recognizes the App84 OLED profile, displays its firmware identity and links to the matching phone ZIP. On App657, **Device & diagnostics** shows the running application's source ID, an available fault note from the previous boot, and cache pages used at the last mount. The German and English guided checks include 40 additional LCD cases. [Open the file manager](https://bluecyber81.github.io/pixl.js/) · [Windows package and source](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.8)

## LCD firmware released on 16 November · DE3.81 / App654

| What do you want to update? | Download and requirements |
| --- | --- |
| Application only | [Download DE3.81 / App654 (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_DE3_81_654_NUR_APP.zip). For LCD devices with Packed LittleFS (PFS1), Z19, Z20 or Z21, and S112 7.3.0. The installed bootloader and SoftDevice stay in place. |
| Application, bootloader and SoftDevice | [Download the full Android package (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_S112_7_3_0_Z21_DE3_81_654_KOMPLETT.zip). Includes DE3.81 / App654, bootloader Z21 and Nordic S112 7.3.0. Requires a compatible LCD, bootloader counter below 21, a matching key and layout, and S112 FWID 0x0103 or 0x0126. |

Back up your files and keep the ZIP intact. Install a full update with **nRF Device Firmware Update** and wait for both stages. An LCD diagnostic records App654, Z21 and S112 7.3.0. Resuming a physically interrupted Android DFU on Z21 still needs a device test. [Flashing guide](https://bluecyber81.github.io/pixl.js/guide/en.html#flash) · [Migrating from SPIFFS](docs/MIGRATION_PFS1.md) · [Source and test evidence](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_DE3_81_Z21_Pruefnachweise.zip)

## File manager 3.55.5 · archive

The home page links to both LCD downloads and the separate OLED route. [Open the file manager](https://bluecyber81.github.io/pixl.js/) · [Windows package and source](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.5)


## File manager 3.55.4

Choose the firmware for your display and open its Android download and guide from the homepage. The OLED package contains only the device application. [Open the homepage](https://bluecyber81.github.io/pixl.js/) · [Windows and source downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.4)

## File manager 3.55.3

On a supported LCD, **Device & diagnostics → Battery history** shows the duration, voltage range and gaps between readings. The first fresh reading after a pause marks the resumption. CSV exports include the reason in a fifth column, `pause_reason`. [Windows and source downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.3)

## LCD preview for Android

DE3.81 / App654 keeps the active figure selected when a switch is declined and lets AmiiboLink retry if tag creation fails. Z21 restores the receiving indicator when DFU resumes. An LCD owner confirmed flashing and initial operation. Recovery after an actual radio disconnect still needs a device test. [App654](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_DE3_81_654_NUR_APP.zip) · [Android package with S112 7.3.0 and Z21](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_S112_7_3_0_Z21_DE3_81_654_KOMPLETT.zip) · [Sources and test evidence](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_DE3_81_Z21_Pruefnachweise.zip) Use the intact combined ZIP in nRF Device Firmware Update on a compatible LCD with Packed LittleFS. [Stable DE3.75](https://github.com/bluecyber81/pixl.js/releases/tag/de3.75)

## Hardware diagnostics and battery history · File manager 3.55.0

Open **Device & diagnostics** to record the last reported voltage and charge indication every ten seconds. The most recent 120 entries stay in the current connection. Recording pauses during file transfers and while the tab is hidden. If your battery is marked “551520 · 180 mAh · 3.8 V · 0.684 Wh”, you can confirm this under **Hardware profile → Associate a battery label with this device**. The diagnostic export identifies it as information from the label.

On the LCD, the contrast control now spans the effective 60–100% range. Long lists draw only the visible rows, including both partially visible edges. The file manager can show a captured LCD image at 1×, 2× or 3× with a native 128 × 64 PNG download.

The **DE3.79 / App652** LCD preview reports the three identification bytes that the external flash returned during storage setup. These give the manufacturer ID, memory type and capacity code. Other diagnostics remain available on older firmware. [Mobile app ZIP for PFS1, Z19 and S112 7.3.0](https://github.com/bluecyber81/pixl.js/releases/download/de3.79/Allmiibo_LCD_DE3_79_652_NUR_APP.zip) · [Open the file manager](https://bluecyber81.github.io/pixl.js/) · [Windows package and source](https://github.com/bluecyber81/pixl.js/releases/tag/web3.55.0)

## Battery display · LCD firmware DE3.77 and file manager 3.54.1

The LCD shows larger voltage digits and an eight-segment battery. A bolt indicates charging, **Low** identifies a low battery, and a dash marks a missing reading. Both web diagnostic views show the voltage in volts, for example **3.870 V** in English.

The signed App650 is a preview for Allmiibo LCD devices with PFS1, Z19 and S112 7.3.0. [Mobile app ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.77/Allmiibo_LCD_DE3_77_650_NUR_APP.zip) · [Open file manager](https://bluecyber81.github.io/pixl.js/) · [Stable DE3.75 firmware](https://github.com/bluecyber81/pixl.js/releases/tag/de3.75)

## Young Link and Young Zelda · File manager 3.54.0

Find the two figures announced for 2027 by their English or German names, or under *The Legend of Zelda: Ocarina of Time* for Nintendo Switch 2. Each entry has its own picture and game notes. Nintendo describes wearable masks for Link. [Nintendo game information](https://www.nintendo.com/de-de/Spiele/Nintendo-Switch-2-Spiele/The-Legend-of-Zelda-Ocarina-of-Time-3115664.html)

The seven *Kirby Air Riders* figures now have individual pictures on the LCD and German game notes, including Sword Kirby & Dragoon and Noir Dedede & Hydra. [Kirby Air Riders update notes](https://www.nintendo.com/de-de/Support/Kaufe-und-Mitgliedschaften/Spiele/Das-Aktualisieren-von-Kirby-Air-Riders--2967700.html)

The built-in **Allmiibo LCD** database gains both entries in the signed **DE3.76 / App649** preview for PFS1 with Z19 and S112 7.3.0. The file manager offers the app ZIP under **Update**. [Mobile app ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.76/Allmiibo_LCD_DE3_76_649_NUR_APP.zip) · [Stable DE3.75 firmware](https://github.com/bluecyber81/pixl.js/releases/tag/de3.75)

## File manager 3.53.0

**DE3.75 / App648 is the stable LCD firmware** for devices with PFS1, Z19 and S112 7.3.0. On one LCD, the owner verified list return and wake in both apps. The Switch also recognized a known figure. If you already installed the signed App648, you can keep using it. [Download the app ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_LCD_DE3_75_648_NUR_APP.zip) · [Android package for compatible older bootloaders](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_LCD_S112_7_3_0_Z19_DE3_75_648_KOMPLETT.zip) · [Release notes and tests](docs/RELEASE_DE3_75.md) · [ChatGPT review kit](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_DE3_75_App648_Z19_Web3_52_1_ChatGPT_Pruefpaket.zip)

Backups can reuse small files from a previous ZIP after checking their current digest on the device. Optional ZIP compression, backup phase timings and offline figure checks are available. Rename and ZIP import show the remaining path length. Device & diagnostics can inspect MIFARE Mini slots. [Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.53.0)

## File manager 3.52.0

Under **Device & diagnostics**, record whether the file emulator or database returns to the expected figure after leaving or waking. The figure lists stay alphabetical after checking online. Backup, update and remote tools now load when first opened. [Open file manager](https://bluecyber81.github.io/pixl.js/) · [Downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.52.0)

## File Manager 3.51.1 · Keep the selected figure in view

Select a figure under **Files**. On a laptop, the **Selection** panel keeps its picture and details in view as you scroll through a long folder. Select another figure to show its preview in the same place. [Open the file manager](https://bluecyber81.github.io/pixl.js/) · [Windows and source downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.51.1)

Folders appear first. Tap a figure file for its picture and details. On phones the type and size appear under the filename, with row actions on the right. If a local name cannot be used on the device, you can correct the destination name or skip that item before uploading.

## Tested LCD release DE3.74 (App647) · File Manager 3.50.1

A user tested the remote display photo on their LCD Allmiibo with File Manager 3.50.0. Version 3.50.1 lists DE3.74 as the stable application for LCD devices with Packed LittleFS, bootloader Z19 and S112 7.3.0. If DE3.74 is already installed, you can keep using it. [Device test](docs/validation/DE3_74_LCD_ACCEPTANCE.json)

[Signed LCD application](https://github.com/bluecyber81/pixl.js/releases/tag/de3.74) · [Online file manager](https://bluecyber81.github.io/pixl.js/) · [Windows ZIP](https://github.com/bluecyber81/pixl.js/releases/download/web3.50.1/Allmiibo_Dateimanager_3_50_1_Portable.zip) · [Source ZIP](https://github.com/bluecyber81/pixl.js/releases/download/web3.50.1/Allmiibo_Dateimanager_3_50_1_Quellcode.zip)

## DE3.74 / App647 and file manager 3.50.0

Under **Remote control**, refresh the display image to see the current device menu on your phone. Rotate the image, save it as a PNG, or take another photo after navigating. Enable the BLE remote in settings on the awake LCD and connect to **Pixl.Remote**. DE3.74 adds the photo capture command. On DE3.73 you can also check the connection and see when the device answered. Cancelling an earlier connection attempt preserves a later file session.

[Signed Android DFU ZIP for LCD with PFS1, Z19 and S112 7.3.0](https://github.com/bluecyber81/pixl.js/releases/download/de3.74/Allmiibo_LCD_DE3_74_647_NUR_APP.zip) · [File manager 3.50.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.50.0)

## DE3.73 / App646 and file manager 3.49.0

On iPhone the file manager explains catalogue access and Bluetooth options. Comparing a folder again can identify files changed on both sides. Devices running cylin577 firmware have a dedicated PixLink connection option.

The online catalogue check reports missing game notes and write support in the source. Reviewed notes remain available. The remote supports the keyboard and shows which command the device acknowledged. Dragoon and Hydra share a board code, so file inspection lists both possible machines.

The offline catalogue contains 954 figure IDs. In **Figure catalogue → Game → Kirby Air Riders**, all seven riders appear, including Sword Kirby & Dragoon and Noir Dedede & Hydra. German names also find the matching cards. The firmware name filter covers the 952 IDs in the published App646.

DE3.73 is an optional LCD test release. A long press on Back in the slot list now leaves the slots alone. Returning from figure details keeps the last selection, including across favourites pages. File manager 3.49.0 checks capacity for App646 and protects reserved paths before writing.

| Starting point on the LCD device | Download |
| --- | --- |
| Packed LittleFS is set up and Z19 and Nordic S112 7.3.0 are installed | [DE3.73 application only](https://github.com/bluecyber81/pixl.js/releases/download/de3.73-test646/Allmiibo_LCD_DE3_73_App646_TEST_DFU.zip) |
| Compatible nRF52832 LCD, matching flash layout and working Secure DFU with the matching key. Bootloader counter below 19 and S112 FWID 0x0103 or 0x0126 | [Full S112 7.3.0, Z19 and DE3.73 package](https://github.com/bluecyber81/pixl.js/releases/download/de3.73-test646/Allmiibo_LCD_S112_7_3_0_Z19_DE3_73_646_KOMPLETT_TEST.zip). Complete both stages with **nRF Device Firmware Update** on Android. |
| Older SPIFFS device to be migrated | [DE3.30-PREP / 600 preparation application](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_SPIFFS_DE3_30_PREP_600.zip). Back up existing files. Before switching the system, verify the complete Raw128 backup against the source device and run the local capacity check. [LittleFS migration guide](https://bluecyber81.github.io/pixl.js/guide/en.html#littlefs) |

Initializing LittleFS erases the old E: drive. After restoring the verified backup, run the final comparison against the device.

[Stable LCD firmware DE3.65 / 637](https://github.com/bluecyber81/pixl.js/releases/download/de3.65/Allmiibo_LCD_DE3_65_637_NUR_APP.zip) · [Installation guide](https://bluecyber81.github.io/pixl.js/guide/en.html) · [Windows ZIP](https://github.com/bluecyber81/pixl.js/releases/download/web3.49.0/Allmiibo_Dateimanager_3_49_0_Portable.zip) · [Source ZIP](https://github.com/bluecyber81/pixl.js/releases/download/web3.49.0/Allmiibo_Dateimanager_3_49_0_Quellcode.zip) · [ChatGPT review kit](https://github.com/bluecyber81/pixl.js/releases/download/de3.73-test646/Allmiibo_DE3_73_App646_Z19_Web3_48_2_ChatGPT_Pruefpaket.zip)

## DE3.72 / App645 and file manager 3.48.1

The LCD test application restores the selected data slot and the figure last viewed in the detail screen. Four English and German game notes for Mipha and Urbosa have been corrected. File manager 3.48.1 adds App645 to the local capacity check. [Changes and validation](https://github.com/bluecyber81/pixl.js/releases/tag/de3.72) · [Open the file manager](https://bluecyber81.github.io/pixl.js/)

## File manager 3.48.0 and LCD test firmware DE3.71t1

The file manager helps preserve completed backup ZIPs, exports filtered ZIP comparisons as CSV or JSON, and lets you move favourites and search filters between browsers. The Windows launcher now detects when its background server has stopped after an acknowledged shutdown.

On an LCD Allmiibo running App644, the tester reached the selected figure after Back to List and after sleep/wake on the paths exercised in the file emulator and the amiibo database. This signed application update is for compatible LCD units using Packed LittleFS. [Open the file manager](https://bluecyber81.github.io/pixl.js/) · [File manager downloads](https://github.com/bluecyber81/pixl.js/releases/tag/web3.48.0) · [LCD test firmware](https://github.com/bluecyber81/pixl.js/releases/tag/de3.71t1)

## File manager 3.47.0

The amiibo emulator sorts the displayed folder page once. With DE3.70, **Device & diagnostics → Read all diagnostic values** reports center-button events through the first main-menu selection and the duration of the app launch call. The record is held in RAM until restart. [LCD DE3.70 (ZIP)](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_70_642_NUR_APP.zip) · [Web 3.47.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.47.0)

## File manager 3.46.0

Under **Backup**, choose two saved backup ZIPs to see added, removed and changed entries, even while disconnected. Under **Update**, open a published LCD package in the Nordic DFU app on Android. The DE3.69 LCD test release lists the last five figures opened in the amiibo database. [DE3.69 LCD (ZIP)](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_69_641_NUR_APP.zip) · [Web 3.46.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.46.0)

## File manager 3.45.0 · LCD DE3.68 / 640 · 2026-11-09

Choose a game in the catalogue to see matching figures from your collection. In Backup, the folder comparison also lists files present only on the device. On the LCD, test firmware DE3.68 remembers the last opened app when returning to the main menu. You can give each connected device a name in this browser. Switching devices shows the name associated with the current connection. [DE3.68 LCD (ZIP)](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_68_640_NUR_APP.zip) · [Web 3.45.0](https://github.com/bluecyber81/pixl.js/releases/tag/web3.45.0)

[Firmware and bootloader history](docs/VERSIONEN_FIRMWARE.md) · [File manager patch history](docs/VERSIONEN_WEB.md)

[Open the online file manager](https://bluecyber81.github.io/pixl.js/) · [Guide: firmware, LittleFS and bootloader](https://bluecyber81.github.io/pixl.js/guide/en.html) · [Download the DE3.65 LCD application](https://github.com/bluecyber81/pixl.js/releases/download/de3.65/Allmiibo_LCD_DE3_65_637_NUR_APP.zip) · [Deutsch](README.de.md)

**File manager 3.44.0** · 8 November 2026. When you open the file manager, it selects the first supported language in your browser’s preference list. Use the language menu to choose a fixed language or return to automatic selection.

- **3.48.0** · [Source code (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.48.0/Allmiibo_Dateimanager_3_48_0_Quellcode.zip) · [Review package (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.48.0/Allmiibo_DE3_71t1_Z19_Web3_48_0_ChatGPT_Pruefpaket.zip)
- **3.47.0** · [Web source (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.47.0/Allmiibo_Dateimanager_3_47_0_Quellcode.zip) · [ChatGPT review package (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.47.0/Allmiibo_DE3_70_Z19_Web3_47_0_ChatGPT_Pruefpaket.zip)
- **3.46.0** · [Web source (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.46.0/Allmiibo_Dateimanager_3_46_0_Quellcode.zip) · [ChatGPT review package (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.46.0/Allmiibo_DE3_69_Z19_Web3_46_0_ChatGPT_Pruefpaket.zip)
- **3.45.0** · [Web source (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.45.0/Allmiibo_Dateimanager_3_45_0_Quellcode.zip) · [ChatGPT review package (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.45.0/Allmiibo_DE3_68_Z19_Web3_45_0_ChatGPT_Pruefpaket.zip)
- **3.44.0** · [Web source (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.44.0/Allmiibo_Dateimanager_3_44_0_Quellcode.zip) · [ChatGPT review package (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.44.0/Allmiibo_DE3_67_Z19_Web3_44_0_ChatGPT_Pruefpaket.zip)
- **3.43.1** · [Web source (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.43.1/Allmiibo_Dateimanager_3_43_1_Quellcode.zip) · [ChatGPT review package (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.43.1/Allmiibo_DE3_67_Z19_Web3_43_1_ChatGPT_Pruefpaket.zip)
- **3.43.0** · [Web source (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.43.0/Allmiibo_Dateimanager_3_43_0_Quellcode.zip) · [ChatGPT review package (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.43.0/Allmiibo_DE3_67_Z19_Web3_43_0_ChatGPT_Pruefpaket.zip)
- **3.42.2** · [Web source (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.42.2/Allmiibo_Dateimanager_3_42_2_Quellcode.zip) · [ChatGPT review package (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.42.2/Allmiibo_DE3_66_Z19_Web3_42_2_ChatGPT_Pruefpaket.zip)
- **3.42.1** · [Web source (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.42.1/Allmiibo_Dateimanager_3_42_1_Quellcode.zip) · [ChatGPT review package (ZIP)](https://github.com/bluecyber81/pixl.js/releases/download/web3.42.1/Allmiibo_DE3_66_Z19_Web3_42_1_ChatGPT_Pruefpaket.zip)

**LCD test release DE3.67 / 639.** All 54 distinct usage notes across 63 game associations can be read in German on the device. Long notes scroll to the last pixel. German usage notes and QR scanning were confirmed on an LCD Allmiibo running DE3.67, Z19 and S112 7.3.0. [What to test](docs/RELEASE_DE3_67.md) · [Rebuild](docs/BUILD_DE3_67.md) · [Download for Android](https://bluecyber81.github.io/pixl.js/firmware/Allmiibo_LCD_DE3_67_639_NUR_APP.zip)

**File manager 3.42.1.** The six workspaces have distinct accent colours. On a phone, two illustrated buttons lead directly to figure import and firmware updates. When the Allmiibo is connected, Your device shows the open folder, its entry count and storage usage. A wide teal-to-indigo bar at the bottom shows the occupied share. Figure import now opens on the first click even while the browser is still loading the view. The guide also covers Nordic’s desktop Bluetooth DFU option with a compatible adapter.

These screenshots from **3.42.1** use a simulated connection and simulated storage values. [Phone preview](docs/images/web-3.42.1/mobile.png) · [Desktop preview](docs/images/web-3.42.1/desktop.png)

The file manager shows the affected names when files collide or need a portable spelling. All 54 distinct English usage notes now have German translations. The standalone DFU page can keep a supported phone screen awake during a transfer and reports whether the request succeeded. [Web guide](web/README.md) · [Web 3.44.0 downloads, source and test package](https://github.com/bluecyber81/pixl.js/releases/tag/web3.44.0)

The stable LCD application **DE3.65 / 637** was checked on an LCD unit running Packed LittleFS PFS1, Z19 and S112 7.3.0. Bluetooth readback, the note scrollbar, NFC recognition of a known figure on Switch, and short-button wake after auto-sleep were confirmed. Web DFU offers this signed application as the stable choice. [Device checks](docs/validation/DE3_65_LCD_READBACK.json)

Open a figure in the Amiibo database, press the centre button and choose **Note / hints**. The scrollbar now reaches the end of three-line notes. The compact catalogue preserves all 952 figure IDs and 1,344 associations while freeing 2,672 bytes of program flash compared with DE3.64.

On the tested Z19/S112 layout, select the application ZIP above in nRF Device Firmware Update for Android or select the bundled application in Web DFU. Existing DE3.65 installations can open the new file manager directly. Older SPIFFS devices have a separate migration procedure. [Application release and evidence](https://github.com/bluecyber81/pixl.js/releases/tag/de3.65) · [Migration](docs/MIGRATION_PFS1.md)

</details>

## Source and development

The repository includes corresponding application, Z21 bootloader and web sources. Nordic supplies the S112 7.3.0 radio stack. In the existing 100-figure model the combined transaction reduced programming calls by 48.0% and erase calls by 42.7%. The four-page mount cache saved 431 reads in the 952-figure model. [Storage measurements](docs/validation/DE3_65_SPEICHER.md) · [Z21 source](bootloader-z21/) · [S112](softdevice-s112/) · [Contributing](CONTRIBUTING.md)

Community continuation by bluecyber81, based on [solosky](https://github.com/solosky/pixl.js) and [cylin577](https://github.com/cylin577/pixl.js). [Components](docs/COMPONENTS.md) · [History](docs/DEVELOPMENT_HISTORY.md) · [License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
