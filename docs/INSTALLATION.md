# Choose the correct installation path

## Already running compatible DE firmware with Packed LittleFS PFS1

Keep a current backup. Download the **application-only** DE3.58/630 ZIP from the [release](https://github.com/bluecyber81/pixl.js/releases/tag/de3.58), compare its SHA-256 with `SHA256SUMS.txt`, and select the unchanged ZIP in the [application DFU page](https://bluecyber81.github.io/pixl.js/dfu/web.html). On the device choose Firmware flash/DFU, then select its DFU advertisement in the browser. Confirm return to the normal DE3.58 menu after completion. Do not extract/re-zip the OTA.

An existing compatible PFS1 collection requires no format or repeat migration for DE3.58. The application ZIP does not install BL8/S112 and contains no figure collection. A successful transfer message alone does not prove the application restarted.

## SPIFFS, DE3.8/DE3.16 or another storage layout

Do not treat this as the preceding path. Read [MIGRATION_PFS1.md](MIGRATION_PFS1.md), establish actual board/storage/component identity, save a complete external backup including all 128 metadata bytes, and use a qualified preparation/restoration sequence. Plain upstream LittleFS and this project's PFS1 are different. The current application alone is not a data migration and a bootloader update does not convert external storage.

## Bootloader / SoftDevice

See [COMPONENTS.md](COMPONENTS.md) and [BL8 source/build guide](../bootloader-bl8/README.md). The web DFU page is for its supported application path. Combined Nordic system updates use a separately qualified package/client and may need an application reinstall. Do not infer compatibility from the Allmiibo name or reuse a package built for another LCD/OLED revision. A freshly compiled unsigned BIN/HEX is a developer artifact, not a ready-to-flash OTA ZIP.

## File manager only

Open [GitHub Pages](https://bluecyber81.github.io/pixl.js/) or extract the portable ZIP and run its documented start script. This updates browser code without flashing anything. Check version **3.36.0** in the page. After a website update, disconnect and reload if an old page is still open; it cannot retroactively replace code already loaded in a tab.

Local `127.0.0.1` addresses refer to the machine opening them. Phones use the HTTPS online page or an appropriately configured local server. The Bluetooth device must be within range of the phone/computer running the page. Permission/device choosers require the user's browser interaction.
