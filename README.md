# Allmiibo LCD firmware and file manager

[Firmware and bootloader history](docs/VERSIONEN_FIRMWARE.md) · [File manager patch history](docs/VERSIONEN_WEB.md)

[Open the online file manager](https://bluecyber81.github.io/pixl.js/) · [Guide: firmware, LittleFS and bootloader](https://bluecyber81.github.io/pixl.js/guide/en.html) · [Download the DE3.65 LCD application](https://github.com/bluecyber81/pixl.js/releases/download/de3.65/Allmiibo_LCD_DE3_65_637_NUR_APP.zip) · [Deutsch](README.de.md)

**File manager 3.44.0** · 8 November 2026. When you open the file manager, it selects the first supported language in your browser’s preference list. Use the language menu to choose a fixed language or return to automatic selection.

- **3.44.0** · [Web source (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.44.0/Allmiibo_Dateimanager_3_44_0_Quellcode.zip) · [ChatGPT review package (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.44.0/Allmiibo_DE3_67_Z19_Web3_44_0_ChatGPT_Pruefpaket.zip)
- **3.43.1** · [Web source (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.43.1/Allmiibo_Dateimanager_3_43_1_Quellcode.zip) · [ChatGPT review package (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.43.1/Allmiibo_DE3_67_Z19_Web3_43_1_ChatGPT_Pruefpaket.zip)
- **3.43.0** · [Web source (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.43.0/Allmiibo_Dateimanager_3_43_0_Quellcode.zip) · [ChatGPT review package (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.43.0/Allmiibo_DE3_67_Z19_Web3_43_0_ChatGPT_Pruefpaket.zip)
- **3.42.2** · [Web source (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.42.2/Allmiibo_Dateimanager_3_42_2_Quellcode.zip) · [ChatGPT review package (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.42.2/Allmiibo_DE3_66_Z19_Web3_42_2_ChatGPT_Pruefpaket.zip)
- **3.42.1** · [Web source (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.42.1/Allmiibo_Dateimanager_3_42_1_Quellcode.zip) · [ChatGPT review package (ZIP)](https://bluecyber81.github.io/pixl.js/downloads/web3.42.1/Allmiibo_DE3_66_Z19_Web3_42_1_ChatGPT_Pruefpaket.zip)

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
