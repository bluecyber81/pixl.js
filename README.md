# Allmiibo LCD firmware and file manager

[Open file manager](https://bluecyber81.github.io/pixl.js/) · [DE3.62 downloads](https://github.com/bluecyber81/pixl.js/releases/tag/de3.62) · [Deutsch](README.de.md)

**DE3.62 / 634** and **file manager 3.38.0** support the nRF52832 Allmiibo LCD with an existing Packed LittleFS PFS1 volume. The separate **Z17 / 17 bootloader candidate** adds real final-validation and settings-commit display states. These new versions have passed computer-based checks; physical integration tests remain pending.

- Card import/export rejects missing, unknown and truncated buffers. C interfaces for tag types, menu values, retained-cache CRC, NFC and AmiLoop are corrected and checked during every build.
- Startup diagnostics separate mount setup and scan times and expose physical reads, bytes, cache hits and failures. Older diagnostic formats remain supported. Equal-size cache alternatives were slower on the fixed test image and were not adopted; no additional startup speedup is claimed.
- Backup now shows drive-opening failures and progress where the user is working. RAM diagnostics explain small sample counts. A new diagnostic request no longer displays an old completion timestamp.
- Docker and native Linux builds produce identical BIN/HEX payloads. Source manifests, ELF, linker maps, strict own-C diagnostics and reproducible host tests support further development.

## Install or contribute

Keep a backup. For an existing LCD/PFS1 device, use **Allmiibo_LCD_DE3_62_634_TESTSTAND.zip** on the [application DFU page](https://bluecyber81.github.io/pixl.js/dfu/web.html). This package updates the application only; it does not replace the bootloader or S112 and requires no new filesystem migration. Bootloader candidates have separate instructions. Older SPIFFS devices and upstream LittleFS need their respective migration paths.

[Release details and limitations](docs/RELEASE_DE3_62.md) · [Build guide](docs/BUILD_DE3_62.md) · [Contributing](CONTRIBUTING.md) · [Storage diagnostics](docs/diagnostics/DE3_62_STORAGE.md) · [Z17 source](bootloader-z17/) · [Web instructions](web/README.md) · [Migration](docs/MIGRATION_PFS1.md)

Community continuation by bluecyber81, based on [solosky](https://github.com/solosky/pixl.js) and [cylin577](https://github.com/cylin577/pixl.js). [Components](docs/COMPONENTS.md) · [History](docs/DEVELOPMENT_HISTORY.md) · [License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
