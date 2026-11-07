# Component identity and update boundaries

Publication baseline: **2026-11-07**. Components have independent versions.

**[Detailed bootloader/SoftDevice changes](BOOTLOADER_SOFTDEVICE_CHANGES.md) · [Separate component downloads](COMPONENT_DOWNLOADS.md) · [S112 reference distribution](../softdevice-s112/README.md)**

| Layer | Current project baseline | Identity |
| --- | --- | --- |
| Application | 2.22.0-DE3.65 (stable) | DFU counter 637, hardware requirement 52 |
| File manager | 3.39.5 | Browser software, not a device image |
| Current LCD bootloader | [Z19](../bootloader-z19/) | Counter 19; same boot image as used with App636; current application package contains only App637 |
| Previous bootloader | Z17 | Counter 17, observed in the device export for App634 |
| Previously installed reference | Z15 | Counter 15; region SHA-256 below |
| Older reference bootloader | BL8 | Historical corresponding source retained; counters depend on packaging |
| SoftDevice | Nordic S112 7.3.0 | FWID 0x0126; binary from Nordic, not rebuilt here |
| Filesystem | Packed LittleFS PFS1 | Same logical layout as previous PFS1 DE releases; not standard upstream LittleFS |

On 7 November 2026 the LCD device reported App637, Z19 and S112 7.3.0. The Z19 boot region matched the rebuilt reference, and the boot settings CRC matched. [Device readback](validation/DE3_65_LCD_READBACK.json)

The device used for the DE3.60 readback runs Z15, counter 15. Its full 28 KiB region hashes to `c3200211a846a2912a57c7e4f194d05185e08735df342bd549a201739286bade`. [DE3.61 validation](validation/DE3_61.json) records admission of the signed 633 application by the Z15 ARM code and rejection of an invalid signature or incompatible SoftDevice. Z15 also permits an older correctly signed application.

The normal application OTA accepts declared SoftDevice IDs 0x0103 (S112 7.2.0) and 0x0126 (7.3.0). This declaration is not a readback of the recipient device. Its manifest contains only an application image. It does not update the bootloader, SoftDevice, host Bluetooth driver or figure files.

BL8 code has been packaged with more than one monotonic bootloader counter (including 9 and 11). These counters are not the BL8 source version. The expected padded 28 KiB region SHA-256 is:

`add1f8f0422dc9da6c4e2ce90899e3fc7b5d0498993030c0bd5110cdc5b66130`

The historical BL8 corresponding source, SDK overrides, public verification key, source-input hashes and unsigned build instructions are in [bootloader-bl8](../bootloader-bl8/README.md). The historical Z17 corresponding source is in [bootloader-z17](../bootloader-z17/README.md). `bootloader-bl6/` and the inherited `fw/bootloader/` are older references; their whole-system/key-generation instructions are not the current release process.

Nordic supplies [S112 downloads and release notes](https://www.nordicsemi.com/Products/Development-software/S112/Download). S112 is a separate vendor binary with its own license and hardware restrictions. The corrected `nrf_nvic.h` SDK header used by this project is a host compilation input; changing it is not a replacement SoftDevice binary. No new Nordic version or elimination of every Nordic known issue is claimed.

The public standard download bundle contains the application OTA, portable browser and corresponding sources. It does **not** contain an automatically selected BL8/S112 combined OTA. A locally prepared older-device system candidate is not a general compatibility approval: board, flash layout, existing bootloader/key/counter, SoftDevice transition and preservation/migration of external storage must be qualified first. Ordinary application maintenance does not require repeating a system update.

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
counter17 bootloader update. See the separate package instructions.

The paragraphs below describe earlier reference states.

The application-only DE3.60 update works with the installed Z13 LCD bootloader and S112 7.3.0 on the matching PFS1 configuration. Counter 13 and padded-region SHA-256 97b2751f1b041de8bcba131d875be725fe91294bfc72e4a7f7a3dc5526e88002 identify this Z13 reference. The independent bench candidate retries missed display work and preserves 2,220 bytes of boot flash, up from 328. Its physical qualification is pending. [Builds, measurements and recovery gesture](validation/Bootloader-Pruefstand_DE-EN.md)

## Byte comparison of Nordic S112 7.3.0 on 4 November 2026

The 98,068 explicitly addressed bytes in the vendor HEX from 0x1000 through 0x18F13 matched the entire SoftDevice prefix of the archived BL8/S112 system OTA. Both byte sequences have SHA-256 `176e583106ce74c71c621e0ad14f9cecdcd83dcd6ac097df3c970223e7a0aff2`. The comparison excluded the 28,136-byte bootloader suffix and the MBR. These are archive measurements, with no flash readback from a connected unit. [Inputs, ranges and checksums](validation/S112_7_3_0_ARCHIVE_COMPARISON.json).

Fresh vendor download and direct byte comparison: [S112 official 7.3.0](validation/S112_7_3_0_VENDOR_READBACK.json). BL8 was separately rebuilt and matched its existing region fingerprint.
