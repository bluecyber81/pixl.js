# Allmiibo LCD firmware and file manager

[Open file manager](https://bluecyber81.github.io/pixl.js/) · [DE3.62 downloads](https://github.com/bluecyber81/pixl.js/releases/tag/de3.62) · [Deutsch](README.de.md)

**DE3.62 / 634** and **file manager 3.39.0** support the nRF52832 Allmiibo LCD with an existing Packed LittleFS PFS1 volume. Web 3.39.0 is a host- and Chrome-tested update: catalogue usage notes, SHA-256 groups within duplicate IDs, optional local MF0 slot repair copies and safer ZIP restores. Physical device testing remains a separate step. The application, **Z17 / 17 bootloader candidate** and Nordic S112 7.3.0 remain unchanged.

- Figure details and the selected-file preview show bundled catalogue associations for 952 figures and 1,344 links. Eight editorial German translations cover 13 associations; other available notes retain their English source. These are catalogue notes, not game testing.
- A full collection check compares already-read bytes without extra Bluetooth reads. Matching figure IDs alone do not prove matching file contents; quick mode makes no byte-equality claim.
- **Device & diagnostics → Inspect card slot locally** accepts a matching v8 configuration and MF0 slot file from the same backup. A repair copy is offered only for the recognized legacy UID-copy pattern with valid BCC bytes. It never writes to the device.
- ZIP restore visibly excludes inactive root OLD/NEW journals while keeping them in the archive. Active or unknown root transaction entries block the entire import, including when paths are remapped.

- Card import/export rejects missing, unknown and truncated buffers. C interfaces for tag types, menu values, retained-cache CRC, NFC and AmiLoop are corrected and checked during every build.
- Startup diagnostics separate mount setup and scan times and expose physical reads, bytes, cache hits and failures. Older diagnostic formats remain supported. Equal-size cache alternatives were slower on the fixed test image and were not adopted; no additional startup speedup is claimed.
- Backup keeps a drive-opening failure visible after returning to drive selection; retry and connection resets clear the scoped error. RAM diagnostics explain small sample counts. A new diagnostic request no longer displays an old completion timestamp.
- Docker and native Linux builds produce identical BIN/HEX payloads. Source manifests, ELF, linker maps, strict own-C diagnostics and reproducible host tests support further development.

## Install or contribute

Keep a backup. For an existing LCD/PFS1 device, use **Allmiibo_LCD_DE3_62_634_TESTSTAND.zip** on the [application DFU page](https://bluecyber81.github.io/pixl.js/dfu/web.html). This package updates the application only; it does not replace the bootloader or S112 and requires no new filesystem migration. Bootloader candidates have separate instructions. Older SPIFFS devices and upstream LittleFS need their respective migration paths.

[File manager 3.39.0 notes](docs/RELEASE_WEB3_39_0.de.md) · [Release details and limitations](docs/RELEASE_DE3_62.md) · [Build guide](docs/BUILD_DE3_62.md) · [Contributing](CONTRIBUTING.md) · [Storage diagnostics](docs/diagnostics/DE3_62_STORAGE.md) · [Z17 source](bootloader-z17/) · [Web instructions](web/README.md) · [Migration](docs/MIGRATION_PFS1.md)

Community continuation by bluecyber81, based on [solosky](https://github.com/solosky/pixl.js) and [cylin577](https://github.com/cylin577/pixl.js). [Components](docs/COMPONENTS.md) · [History](docs/DEVELOPMENT_HISTORY.md) · [License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
