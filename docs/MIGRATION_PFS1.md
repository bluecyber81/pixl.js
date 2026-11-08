# Storage layouts and migration / Speicherlayouts und Umstellung

This guide distinguishes an application update from a storage conversion. It does not authorize erasing a device or assume every Allmiibo has the same hardware.

Step-by-step in the file manager: [Deutsch: Speicher umstellen](https://bluecyber81.github.io/pixl.js/guide/index.html#littlefs) · [English: migrate storage](https://bluecyber81.github.io/pixl.js/guide/en.html#littlefs).

## Identify the current layout first

| Current device storage | LCD application update (DE3.65 stable or DE3.67 test) |
| --- | --- |
| This fork's Packed LittleFS, identifier **PFS1**, migration completed | Application-only update on matching LCD hardware. Preserve existing files; do not format again. |
| **SPIFFS**, including the old public DE3.16 | Separate migration required. Flashing either application alone is not a conversion and does not preserve accessibility of SPIFFS files. |
| Ordinary upstream **LittleFS** | A different on-disk layout. Do not assume compatibility because both names contain LittleFS. No automatic cross-layout conversion is promised by this release. |
| Unknown, failed query or failed mount | Resolve the identity/read error first. A query failure is not proof of an empty device and is not permission to format. |

Read storage information in the file manager's **Backup & restoration → LittleFS** area. Firmware version, bootloader version, physical chip size and free space do not individually establish the filesystem layout. The component comparison is a local expected-version check, not a scan for all Internet releases.

## Existing PFS1 device

Save a current backup, disconnect file transfer, then install the matching application OTA. Both application packages keep the PFS1 layout and existing storage partitions. There is no reason to repeat initialization or restoration for this application update. If an earlier restoration is still incomplete, resume it with its original saved ZIP and matching device/receipt; merely mounting PFS1 does not prove completion.

Do not downgrade a PFS1 device to an old SPIFFS preparation build to make an optional query work. Use the connected device’s storage information and the [installation guide](INSTALLATION.md) to select the appropriate path.

## First migration from SPIFFS

A complete migration is a separate workflow, with a verified backup outside the device. The earlier local migration used a dedicated SPIFFS preparation application, DE3.30-PREP / counter600, to expose **all 128 metadata bytes**. That historical preparation image is not a general recovery firmware and is not automatically appropriate for a device with a newer DFU counter or another layout.

The required stages are:

1. Read the original device using compatible firmware. Save all intended files, directories and Raw128 metadata to a ZIP on the computer. A download request is not enough: select the saved ZIP again and validate that it can be read. Keep the original backup separately.
2. Check the target hardware, storage geometry and exact firmware/engine profile. The capacity simulator must support that exact combination and accept the complete archive. Similar version strings or available raw flash bytes alone are not sufficient.
3. Enter the supported target/recovery firmware. Explicitly confirm initialization only after the backup and target checks pass. **Initialization erases the old contents of E:.** A firmware transfer and a successful reboot do not perform this stage for you.
4. Restore from the saved archive. The transfer checks protocol acknowledgements and conflicts without fully rereading every file immediately. A disconnected operation can resume using the same archive, device and matching recovery state.
5. Perform the **one final complete comparison** of files and Raw128 metadata, then acknowledge completion. A copied-file counter or a mounted target by itself is not the final verification. Restart and test navigation and a known tag.

Web 3.43.1 lists DE3.67/639 as the default capacity reference. It accepts thirteen exact application/counter pairs from **DE3.55/627 through DE3.67/639** for the current engine. It also retains separately qualified older profiles. [Supported profiles in the source](../web/src/lib/migration-capacity.js) PFS1 remains format-compatible, but a different engine fingerprint requires its matching simulation profile. An unknown identity is not automatically accepted. If the assistant cannot establish the required source capabilities or matching target profile, stop the migration sequence and resolve that specific prerequisite; do not choose format as a workaround.

The published LCD application and review bundles are not a universal one-click migration kit. Do not apply the old public DE3.15/DE3.16 recovery packages to PFS1 storage as a file-restoration method. Returning to SPIFFS would require its own deliberate storage conversion and compatible data restore, as well as DFU version compatibility.

## Data and performance boundaries

Packed LittleFS places logical files and metadata in packed records backed by LittleFS. It preserves the custom application's file semantics while reducing the cost of storing many small records. It is not the same file tree as ordinary upstream LittleFS. Later DE versions reuse verified indexes and reduce redundant reads/writes, but keep integrity and recovery checks.

The firmware cannot add physical RAM or flash capacity. Available space depends on data, metadata, layout and the room needed to commit changes. There is no reliable fixed migration duration for every collection/connection. The file manager reports actual progress. Avoid deleting the only saved backup until the final comparison and a normal device check have succeeded.

No figure dumps, private backups, device addresses or signing keys are included in the public software packages. A catalog entry or QR link is not a substitute for a valid figure file.

## Deutsch

**Bereits PFS1:** Die stabile LCD-App DE3.65/637 oder die Testversion DE3.67/639 als Anwendung aktualisieren, vorhandene Dateien behalten und nicht erneut formatieren. **Noch SPIFFS/DE3.16 oder normales Upstream-LittleFS:** kein direktes, datenbewahrendes Update. Erst Speicherlayout, passende Hardware, vollständige externe Sicherung einschließlich Raw128-Metadaten und einen unterstützten Umstellungsweg bestätigen.

Eine erstmalige Umstellung umfasst Sicherung, passende Vorbereitung/Zielprüfung, ausdrücklich bestätigtes Löschen und Initialisieren von E:, Wiederherstellung und einen vollständigen Abschlussvergleich. Die alte DE3.30-PREP600 ist nur Teil des historischen SPIFFS-Vorbereitungswegs; sie ist keine allgemeine Rückkehr- oder Reparaturfirmware und kann wegen Versionszähler/Dateisystem unpassend sein. Fehlende Diagnosewerte rechtfertigen weder ein Downgrade noch Formatieren.

Bei einer unterbrochenen Wiederherstellung dieselbe ZIP und den passenden Beleg verwenden. Eine bereits als PFS1 gemountete Speicherung oder eine Zahl übertragener Dateien bestätigt den vollständigen Import noch nicht. Die äußere Gesamtpaket-ZIP ist nicht flashbar. Bootloader-/SoftDevice-Updates konvertieren ebenfalls keine Figurensammlung.
