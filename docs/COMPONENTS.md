# Component identity and update boundaries

The table lists the independently versioned components as of **19 November 2026**.

**[Installation](INSTALLATION.md) · [Bootloader and SoftDevice history](BOOTLOADER_SOFTDEVICE_CHANGES.md) · [Separate component downloads](COMPONENT_DOWNLOADS.md) · [S112 reference distribution](../softdevice-s112/README.md)**

| Layer | Current project baseline | Identity |
| --- | --- | --- |
| Regular LCD release | [DE3.89 / App662](https://github.com/bluecyber81/pixl.js/releases/tag/de3.89) | ST7567 LCD with PFS1, Z21 and S112 7.3.0. [App-only ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.89/Allmiibo_LCD_DE3_89_662_NUR_APP.zip) · [App662 LCD readback](validation/DE3_89_LCD_READBACK.json) |
| Previous regular LCD release | [DE3.81 / App654](https://github.com/bluecyber81/pixl.js/releases/tag/de3.81) | Keeps figure selection after a declined switch. Its signed Android package includes Z21 and S112 7.3.0. [Evidence](validation/DE3_81.json) |
| Historical LCD previews | [App660](https://github.com/bluecyber81/pixl.js/releases/tag/de3.87-lcd-test1) · [App661](https://github.com/bluecyber81/pixl.js/releases/tag/de3.88-lcd-test1) | Earlier ST7567 application-only builds for PFS1, Z21 and S112 7.3.0. [App661 transfer comparison](validation/APP661_FOLDER_BENCHMARK.json) |
| Archived LCD release | [2.22.0-DE3.75](https://github.com/bluecyber81/pixl.js/releases/tag/de3.75) | Application-only DFU, counter 648. One owner confirmed list return and wake in both apps, and Switch recognition of a known figure. [Release notes](RELEASE_DE3_75.md) |
| OLED test application | [DE3.87 Test 6 / App86](https://github.com/bluecyber81/pixl.js/releases/tag/de3.87-oled-t6) | App-only prerelease for three-button SH1106 devices with S112 7.2.0 (FWID `0x0103`) and existing SPIFFS or native LittleFS. On 18 November 2026, a tester confirmed the remote connection and screen capture on one OLED running Test 6. [App ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.87-oled-t6/Allmiibo_OLED_DE3_87_Test6_APP.zip) · [English guide](https://github.com/bluecyber81/pixl.js/releases/download/de3.87-oled-t6/GUIDE_OLED_Test6_EN.txt) |
| Earlier LCD preview | [DE3.80 / App653](https://github.com/bluecyber81/pixl.js/releases/tag/de3.80) | Temporary eight-page mount cache with a four-page fallback. The Android package also installs Z20 and Nordic S112 7.3.0. [Build and test evidence](validation/DE3_80.json) |
| Earlier LCD preview | [DE3.79 / App652 application ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.79/Allmiibo_LCD_DE3_79_652_NUR_APP.zip) | Cached external flash JEDEC diagnosis. Physical readback on DE3.79 is pending. [Build and host checks](validation/DE3_79.json) |
| Earlier LCD preview | [DE3.77 / App650 application ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.77/Allmiibo_LCD_DE3_77_650_NUR_APP.zip) | Larger voltage digits, an eight-segment battery and a charging indicator. Physical LCD acceptance is pending. [Build and display checks](validation/DE3_77.json) |
| Earlier LCD preview | [DE3.76 / App649 application ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.76/Allmiibo_LCD_DE3_76_649_NUR_APP.zip) | For LCD devices with PFS1, Z19 and S112 7.3.0. Adds Young Link and Young Zelda to the device database and LCD pictures for all seven Kirby Air Riders pairs. The physical LCD and game checks for these editions are pending. [Validation](validation/WEB3_54_0.json) |
| Previous stable LCD application | [2.22.0-DE3.74](https://github.com/bluecyber81/pixl.js/releases/tag/de3.74) | Counter 647. Remote display photo confirmed on a compatible LCD. [Device check](validation/DE3_74_LCD_ACCEPTANCE.json) |
| Earlier stable LCD application | [2.22.0-DE3.65](https://github.com/bluecyber81/pixl.js/releases/tag/de3.65) | Application-only DFU, counter 637, hardware field 52. [LCD device checks](FINAL_DE3_65.md) |
| Previous LCD test application | [2.22.0-DE3.72](https://github.com/bluecyber81/pixl.js/releases/tag/de3.72) | Counter 645, data-slot selection and corrected Zelda game notes. [Three installation options](INSTALLATION.md) |
| Previously tested LCD application | [2.22.0-DE3.71t1](https://github.com/bluecyber81/pixl.js/releases/tag/de3.71t1) | Application-only DFU, counter 644. Figure selection, list return, sleep and resume. |
| Previous public LCD test application | [2.22.0-DE3.70](https://github.com/bluecyber81/pixl.js/releases/tag/de3.70) | Counter 642. First-menu input and selection trace. |
| Earlier LCD test application | [2.22.0-DE3.69](https://github.com/bluecyber81/pixl.js/releases/tag/de3.69) | Application-only DFU, counter 641. Lists recent figures in RAM. |
| Earlier LCD test application | [2.22.0-DE3.68](https://github.com/bluecyber81/pixl.js/releases/tag/de3.68) | Application-only DFU, counter 640. Returning to the main menu reselects the last opened app when visible. |
| Earlier LCD test application | [2.22.0-DE3.67](https://github.com/bluecyber81/pixl.js/releases/tag/de3.67) | Application-only DFU, counter 639. German game hints and QR scanning were verified on an LCD. [Release and readback](RELEASE_DE3_67.md) |
| Earlier LCD test application | [2.22.0-DE3.66](https://github.com/bluecyber81/pixl.js/releases/tag/de3.66) | Application-only DFU, counter 638, hardware field 52. Build and model tests passed. Installation, display capture and backup resume over Windows Bluetooth were verified on one LCD. [Device checks](validation/DE3_66_LCD_READBACK.md). [Evidence](validation/DE3_66.json) |
| File manager | [3.58.2](https://github.com/bluecyber81/pixl.js/releases/tag/web3.58.2) | Select the display under Update for computer DFU and phone downloads. [Open the file manager](https://bluecyber81.github.io/pixl.js/) |
| Current LCD bootloader | [Z21](../bootloader-z21/) | Shows reception when an interrupted DFU session resumes. [Android package for eligible LCD devices](https://github.com/bluecyber81/pixl.js/releases/download/de3.89/Allmiibo_LCD_S112_7_3_0_Z21_DE3_89_662_KOMPLETT.zip) |
| Historical LCD bootloader | [Z19](../bootloader-z19/README.md) | Counter 19. The same 28 KiB boot region was read back with [App636](validation/Z19_APP636_BASELINE.json), [App637](validation/DE3_65_LCD_READBACK.json) and [App638](validation/DE3_66_LCD_READBACK.md). |
| Previous bootloader | Z17 | Counter 17, observed in the device export for App634 |
| Previously installed reference | Z15 | Counter 15; region SHA-256 below |
| Older reference bootloader | BL8 | Historical corresponding source retained; counters depend on packaging |
| LCD SoftDevice | Nordic S112 7.3.0 | FWID `0x0126`. Nordic supplies the binary. |
| OLED SoftDevice | Nordic S112 7.2.0 | FWID `0x0103`. OLED Test 6 uses the installed version. |
| LCD filesystem | Packed LittleFS (PFS1) | Uses the same packed layout as previous LCD PFS1 releases. |
| OLED filesystem | SPIFFS or native LittleFS | OLED Test 6 opens the existing supported filesystem. |

The owner’s 19 November LCD diagnostic records App662, Z21 and S112 7.3.0. [App662 readback](validation/DE3_89_LCD_READBACK.json) · [Two-stage package verification](validation/DE3_89_COMBO.json)

The earlier LCD diagnostic records App654, Z21 and S112 7.3.0 (FWID 0x0126). [Readback](validation/DE3_81_LCD_READBACK.json) · [Historical App654 ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_DE3_81_654_NUR_APP.zip) · [Full system ZIP](https://github.com/bluecyber81/pixl.js/releases/download/de3.81/Allmiibo_LCD_S112_7_3_0_Z21_DE3_81_654_KOMPLETT.zip)

On 7 November 2026 the LCD device reported App637, Z19 and S112 7.3.0. The Z19 boot region matched the rebuilt reference, and the boot settings CRC matched. [Device readback](validation/DE3_65_LCD_READBACK.json)

The earlier DE3.60 readback after the Z15 update reported counter 15. Its full 28 KiB region hashed to `c3200211a846a2912a57c7e4f194d05185e08735df342bd549a201739286bade`. [DE3.61 validation](validation/DE3_61.json) records admission of the signed 633 application by the Z15 ARM code and rejection of an invalid signature or incompatible SoftDevice. Z15 also permits an older correctly signed application.

Use the SoftDevice version specified for the board and release. The OLED Test 6 package declares only `0x0103`. An application-only ZIP contains the device application. The LCD combined ZIP also includes a bootloader and SoftDevice.

BL8 code has been packaged with more than one monotonic bootloader counter (including 9 and 11). These counters are not the BL8 source version. The expected padded 28 KiB region SHA-256 is:

`add1f8f0422dc9da6c4e2ce90899e3fc7b5d0498993030c0bd5110cdc5b66130`

The historical BL8 corresponding source, SDK overrides, public verification key, source-input hashes and unsigned build instructions are in [bootloader-bl8](../bootloader-bl8/README.md). The historical Z17 corresponding source is in [bootloader-z17](../bootloader-z17/README.md). `bootloader-bl6/` and the inherited `fw/bootloader/` are older references; their whole-system/key-generation instructions are not the current release process.

Nordic supplies [S112 downloads and release notes](https://www.nordicsemi.com/Products/Development-software/S112/Download). S112 is a separate vendor binary with its own license and hardware restrictions. The corrected `nrf_nvic.h` SDK header used by this project is a host compilation input; changing it is not a replacement SoftDevice binary. No new Nordic version or elimination of every Nordic known issue is claimed.

The firmware releases distribute signed application ZIPs. The file manager release provides the portable version and web source. The App648 review archive contains the archived DE3.75 LCD firmware, Z19 and date-specific evidence. LCD devices moving to PFS1 have a separate migration procedure. A system update requires a match for the board, installed bootloader key and counter, SoftDevice and flash layout. [File manager release](https://github.com/bluecyber81/pixl.js/releases/tag/web3.58.2) · [App648 review archive](https://github.com/bluecyber81/pixl.js/releases/download/de3.75/Allmiibo_DE3_75_App648_Z19_Web3_52_1_ChatGPT_Pruefpaket.zip) · [LCD migration guide](MIGRATION_PFS1.md)

On the owner's matching device, the 2026-11-02 read-only diagnostic matched DE3.55, the BL8 region hash and S112 7.3.0. This is dated evidence for that device only; no second device is inferred compatible from its product name or photograph.

## Historical Z13, Z15 and Z17 components

The previous Z17 implementation is source-bound in [`bootloader-z17`](../bootloader-z17/).
Its 26612-byte payload leaves 2,060 bytes of boot flash; padded-region SHA-256 is
`5fec8c8495978afcd340e6b42db7fc9ba4fa9f216aad2b2a597cc7282877d584`.
Docker/native payloads match. Host/ARM/sanitizer tests and the separate Android
two-phase package were checked. A device export for App634 subsequently reported counter 17 and the same padded-region hash.
Its application-only DE3.62 counterpart does not install a bootloader or S112.

The Z18 return package uses the existing Z15 code with a higher accepted DFU
counter, not new Z18 functionality. Its code-region hash stays
`c3200211a846a2912a57c7e4f194d05185e08735df342bd549a201739286bade`.
This distinction matters because an older counter16 package cannot undo a
counter17 bootloader update. [Z17 and Z18 package notes](../bootloader-z17/README.md)

The paragraphs below describe earlier reference states.

The application-only DE3.60 update works with the installed Z13 LCD bootloader and S112 7.3.0 on the matching PFS1 configuration. Counter 13 and padded-region SHA-256 97b2751f1b041de8bcba131d875be725fe91294bfc72e4a7f7a3dc5526e88002 identify this Z13 reference. The independent bench candidate retries missed display work and preserves 2,220 bytes of boot flash, up from 328. Its physical qualification is pending. [Builds, measurements and recovery gesture](validation/Bootloader-Pruefstand_DE-EN.md)

## Byte comparison of Nordic S112 7.3.0 on 4 November 2026

The 98,068 explicitly addressed bytes in the vendor HEX from 0x1000 through 0x18F13 matched the entire SoftDevice prefix of the archived BL8/S112 system OTA. Both byte sequences have SHA-256 `176e583106ce74c71c621e0ad14f9cecdcd83dcd6ac097df3c970223e7a0aff2`. The comparison excluded the 28,136-byte bootloader suffix and the MBR. These are archive measurements, with no flash readback from a connected unit. [Inputs, ranges and checksums](validation/S112_7_3_0_ARCHIVE_COMPARISON.json).

Fresh vendor download and direct byte comparison: [S112 official 7.3.0](validation/S112_7_3_0_VENDOR_READBACK.json). BL8 was separately rebuilt and matched its existing region fingerprint.
