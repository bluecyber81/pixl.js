# Nordic S112 7.3.0 and the DE-series integration

[Deutsch / Entwicklung und Fehlerbehebungen](../docs/BOOTLOADER_SOFTDEVICE_CHANGES.md) · [Component downloads](https://github.com/bluecyber81/pixl.js/releases/tag/bl8-s112-7.3.0)

**This folder documents the SoftDevice used by this project.** The original Nordic distribution is available as a separate release asset, together with its license, release notes, HEX and public API headers. S112 is Nordic Semiconductor's Bluetooth stack; its proprietary implementation has not been modified or rebuilt by this project.

| Item | Recorded identity |
| --- | --- |
| Vendor / stack | Nordic Semiconductor, S112 |
| Version / FWID | 7.3.0 / 0x0126 |
| Target in this project | Qualified LCD nRF52832 design |
| Original archive | `s112_nrf52_7.3.0.zip` |
| ZIP SHA-256 | `af3e558dd752311fb71e3623d12c37711b9664d485b8bc5cd9164620c0ae1ca4` |
| Original HEX SHA-256 | `92bcdc1aa51142ed212bb0dbcdf57093a1bad391f1cf5adca60effe14bdb7ec6` |

## What this project contributed

- Integrated and qualified the original S112 7.3.0 with the DE application and BL8 on the tested device; documented the distinction between SDK headers, installed stack and application code.
- Applied Nordic's **DRGN-10613** MWU interrupt-mask workaround in the SDK `nrf_nvic.h` compilation input. Both the application and BL8 builds bind the original/corrected header hashes. The vendor SoftDevice binary remains byte-identical.
- Added component readback/diagnostics, explicit FWID compatibility declarations, package signature/payload checks and correct update boundaries.
- Improved the project's application-level BLE session, transfer and recovery behavior; these changes are in application C code and the browser, not in Nordic's closed binary.

Read the [complete bootloader/SoftDevice change record](../docs/BOOTLOADER_SOFTDEVICE_CHANGES.md) and [application/web history](../docs/DEVELOPMENT_HISTORY.de.md). Nordic's own fixes and new APIs are described in its release notes inside the original archive; they are credited to Nordic.

## Distribution and use

The archive is copied without changing a byte. [LICENSE_NORDIC.txt](LICENSE_NORDIC.txt) retains the complete vendor terms and disclaimer. The software is for Nordic integrated circuits; no Nordic endorsement is claimed. The vendor binary is not relicensed under the project's GPL license.

**The original vendor ZIP is not a Nordic Secure DFU update ZIP.** It has no project-specific signed init packet/manifest. Do not select it as an application in the browser updater. A system update requires a separately qualified, compatible package and client; the standard DE3.55 application OTA does not replace S112.

The [official download page](https://www.nordicsemi.com/Products/Development-software/S112/Download) was checked on 2026-11-03 and lists 7.3.0. This is a dated observation, not an automatic update service. `REFERENCE.json` records the reviewed archive identity.

## Deutsch

Hier stehen **S112 7.3.0**, die Originaldatei, Lizenz und unsere Integrationsarbeit sichtbar zusammen. Unsere Weiterentwicklung betrifft die Anbindung, die SDK-Headerkorrektur, Diagnose, Paketprüfung und den eigenen Bluetooth-Code. Die Fehlerbehebungen im S112-Binary selbst stammen von Nordic. Die Original-ZIP ist als Referenz/Entwicklerdatei veröffentlicht und kann nicht unmittelbar über den DFU-Dateimanager geflasht werden.
