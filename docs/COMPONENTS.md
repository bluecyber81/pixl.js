# Component identity and update boundaries

Publication baseline: **2026-11-03**. Components have independent versions.

| Layer | Current project baseline | Identity |
| --- | --- | --- |
| Application | 2.22.0-DE3.55 | DFU counter 627, hardware requirement 52 |
| File manager | 3.33.1 | Browser software, not a device image |
| Bootloader | BL8 | Code region SHA-256 below; stored DFU counters depend on packaging |
| SoftDevice | Nordic S112 7.3.0 | FWID 0x0126; binary from Nordic, not rebuilt here |
| Filesystem | Packed LittleFS PFS1 | Same logical layout as previous PFS1 DE releases; not standard upstream LittleFS |

The normal application OTA accepts declared SoftDevice IDs 0x0103 (S112 7.2.0) and 0x0126 (7.3.0). This declaration is not a readback of the recipient device. Its manifest contains only an application image. It does not update the bootloader, SoftDevice, host Bluetooth driver or figure files.

BL8 code has been packaged with more than one monotonic bootloader counter (including 9 and 11). These counters are not the BL8 source version. The expected padded 28 KiB region SHA-256 is:

`add1f8f0422dc9da6c4e2ce90899e3fc7b5d0498993030c0bd5110cdc5b66130`

Current corresponding source, SDK overrides, public verification key, exact source-input hashes and unsigned build instructions are in [bootloader-bl8](../bootloader-bl8/README.md). `bootloader-bl6/` and the inherited `fw/bootloader/` are historical sources, not the matching BL8 build. Their old whole-system/key-generation instructions are not the current DE3.55 release process.

Nordic supplies [S112 downloads and release notes](https://www.nordicsemi.com/Products/Development-software/S112/Download). S112 is a separate vendor binary with its own license and hardware restrictions. The corrected `nrf_nvic.h` SDK header used by this project is a host compilation input; changing it is not a replacement SoftDevice binary. No new Nordic version or elimination of every Nordic known issue is claimed.

The public standard download bundle contains the application OTA, portable browser and corresponding sources. It does **not** contain an automatically selected BL8/S112 combined OTA. A locally prepared older-device system candidate is not a general compatibility approval: board, flash layout, existing bootloader/key/counter, SoftDevice transition and preservation/migration of external storage must be qualified first. Ordinary application maintenance does not require repeating a system update.

On the owner's matching device, the 2026-11-02 read-only diagnostic matched DE3.55, the BL8 region hash and S112 7.3.0. This is dated evidence for that device only; no second device is inferred compatible from its product name or photograph.
