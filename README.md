# Allmiibo LCD firmware and file manager

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

## Source and development

The repository includes corresponding application, Z19 bootloader and web sources. Nordic supplies the S112 7.3.0 radio stack. In the existing 100-figure model the combined transaction reduced programming calls by 48.0% and erase calls by 42.7%. The four-page mount cache saved 431 reads in the 952-figure model. [Storage measurements](docs/validation/DE3_65_SPEICHER.md) · [Z19 source](bootloader-z19/) · [S112](softdevice-s112/) · [Contributing](CONTRIBUTING.md)

Community continuation by bluecyber81, based on [solosky](https://github.com/solosky/pixl.js) and [cylin577](https://github.com/cylin577/pixl.js). [Components](docs/COMPONENTS.md) · [History](docs/DEVELOPMENT_HISTORY.md) · [License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
