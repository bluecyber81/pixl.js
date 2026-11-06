# Allmiibo LCD firmware and file manager

[Open file manager](https://bluecyber81.github.io/pixl.js/) · [DE3.63 downloads](https://github.com/bluecyber81/pixl.js/releases/tag/de3.63) · [Deutsch](README.de.md)

**DE3.63 / 635** and **file manager 3.39.2** add clearer access to figure notes on the nRF52832 Allmiibo LCD with an existing Packed LittleFS PFS1 volume. The application update leaves the installed bootloader, Nordic S112 and filesystem unchanged. Physical qualification of this new application remains separate from computer tests.

- **On the device:** Open a figure in the Amiibo database, press the centre button briefly and select **Note / hints**. The two pages show your personal note and the selected game's catalogue hint independently. Short left/right changes pages, holding left/right scrolls whole text lines, and centre returns to the menu. This menu also exists in the database slot view. It does not change a figure, save, note or protection flag.
- **German hints:** Eight existing editorial translations cover 13 catalogue associations. They are selected by exact English source text; other available text stays English. A missing hint does not establish game incompatibility. The normal figure/slot navigation and QR view are retained.
- **LCD text fix:** The font now includes the previously missing uppercase umlauts **Ä, Ö and Ü**, so personal notes containing them can be displayed. Other existing glyphs are retained; this is not full Unicode coverage.
- **File manager:** Figure details and the selected-file preview show the bundled catalogue version next to **Catalogue notes**, with wrapping on small screens. The catalogue still contains 952 public figure IDs and 1,344 associations. Notes and associations are not game tests.

The prior backup and collection tools remain available: best-effort screen wake lock during active operations, SHA-256 content groups for already-read files, local MF0 legacy-slot inspection and optional repair copies, and transaction-aware ZIP restore. A matching figure ID alone does not prove matching bytes. The screen helper cannot guarantee background Bluetooth or prevent manual screen locking. [Web instructions](web/README.md)

## Install or contribute

For an existing compatible LCD/PFS1 device, use **Allmiibo_LCD_DE3_63_635_TESTSTAND.zip** on the [application DFU page](https://bluecyber81.github.io/pixl.js/dfu/web.html). Keep your backup. This application-only package requires neither formatting nor a new filesystem migration. It does not install Z17 or S112. Older SPIFFS devices, upstream LittleFS and other boards require their own checked migration or installation path.

Bootloader **Z17 / 17** is separately documented. A diagnostic export and user confirmation on 6 November 2026 identify Z17 with DE3.62 and S112 7.3.0 on the user's device; this is not qualification of every bootloader path or of the new DE3.63 application. The new application does not require replacing an already compatible bootloader. Nordic **S112 7.3.0** remains the unchanged vendor component.

The release includes source binding and reproducible build/test instructions. Actual hashes and memory measurements belong to the matching release manifest and build results; historical measurements are not new-device evidence. The display changes make no startup-speed claim. [Build guide](docs/BUILD_DE3_63.md) · [Contributing](CONTRIBUTING.md)

[DE3.63 changes and limits](docs/RELEASE_DE3_63.md) · [Web 3.39.2](docs/RELEASE_WEB3_39_2.de.md) · [Handoff](docs/UEBERGABE_DE3_63.de.md) · [Existing storage diagnostics](docs/diagnostics/DE3_62_STORAGE.md) · [Z17 source](bootloader-z17/) · [Migration](docs/MIGRATION_PFS1.md)

Community continuation by bluecyber81, based on [solosky](https://github.com/solosky/pixl.js) and [cylin577](https://github.com/cylin577/pixl.js). [Components](docs/COMPONENTS.md) · [History](docs/DEVELOPMENT_HISTORY.md) · [License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
