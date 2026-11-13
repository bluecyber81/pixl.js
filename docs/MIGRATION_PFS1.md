# Storage layouts and migration / Speicherlayouts und Umstellung

This guide distinguishes an application update from a storage conversion. It does not authorize erasing a device or assume every Allmiibo has the same hardware.

Step-by-step in the file manager: [Deutsch: Speicher umstellen](https://bluecyber81.github.io/pixl.js/guide/index.html#littlefs) · [English: migrate storage](https://bluecyber81.github.io/pixl.js/guide/en.html#littlefs).

## Identify the current layout first

| Current device storage | LCD application update (DE3.65 stable or DE3.72 / 645) |
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

A complete migration is a separate workflow, with a verified backup outside the device. The signed SPIFFS preparation app [DE3.30-PREP / 600](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_SPIFFS_DE3_30_PREP_600.zip) exposes **all 128 metadata bytes**. Save an ordinary backup of the readable collection first. On supported LCD hardware, PREP600 requires the matching DFU signing key, S112 FWID 0x0103 or 0x0126, and a starting application counter below 600. If DE3.30-PREP / 600 already runs on the LCD, proceed to the Raw128 backup. At another counter of 600 or higher, use a separately established Raw128 backup path.

The required stages are:

1. Read the original device using compatible firmware. Save all intended files, directories and Raw128 metadata to a ZIP on the computer. A download request is not enough: select the saved ZIP again and validate that it can be read. Keep the original backup separately.
2. Select the saved ZIP in the same browser and verify the complete Raw128 source against the device. Keep the verification receipt on this origin. Check the target hardware, storage geometry and exact firmware/engine profile. For DE3.72 choose the profile that explicitly includes App645. DE3.71 / 643 is outside the approved profiles. The capacity simulator must support that exact combination and accept the complete archive. Similar version strings or available raw flash bytes alone are not sufficient.
3. Once the source comparison and capacity check pass, install [DE3.72 / 645 application only](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_DE3_72_645_NUR_APP.zip) on a device already using Z19 and S112 7.3.0. If your device needs the system update, use [DE3.72 / 645 full system](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_S112_7_3_0_Z19_DE3_72_645_KOMPLETT.zip) after checking the [board, key and counter requirements](INSTALLATION.md). Explicitly confirm initialization only after the backup and target checks pass. **Initialization erases the old contents of E:.** A firmware transfer and a successful reboot do not perform this stage for you.
4. Restore from the saved archive. The transfer checks protocol acknowledgements and conflicts without fully rereading every file immediately. A disconnected operation can resume using the same archive, device and matching recovery state.
5. Perform the **one final complete comparison** of files and Raw128 metadata, then acknowledge completion. A copied-file counter or a mounted target by itself is not the final verification. Restart and test navigation and a known tag.

The target profile matches an exact application version, application counter and engine fingerprint. Check for **DE3.72 / 645** explicitly. Historical profiles include DE3.55/627 through DE3.70/642 and DE3.71t1/644 with individually qualified identities. [Supported profiles in the source](../web/src/lib/migration-capacity.js) PFS1 remains format-compatible, but a different engine fingerprint requires its matching simulation profile. An unknown identity is not automatically accepted. If the assistant cannot establish the required source capabilities or matching target profile, stop the migration sequence and resolve that specific prerequisite; do not choose format as a workaround.

The published LCD application and review bundles are not a universal one-click migration kit. Do not apply the old public DE3.15/DE3.16 recovery packages to PFS1 storage as a file-restoration method. Returning to SPIFFS would require its own deliberate storage conversion and compatible data restore, as well as DFU version compatibility.

## Data and performance boundaries

Packed LittleFS places logical files and metadata in packed records backed by LittleFS. It preserves the custom application's file semantics while reducing the cost of storing many small records. It is not the same file tree as ordinary upstream LittleFS. Later DE versions reuse verified indexes and reduce redundant reads/writes, but keep integrity and recovery checks.

The firmware cannot add physical RAM or flash capacity. Available space depends on data, metadata, layout and the room needed to commit changes. There is no reliable fixed migration duration for every collection/connection. The file manager reports actual progress. Avoid deleting the only saved backup until the final comparison and a normal device check have succeeded.

No figure dumps, private backups, device addresses or signing keys are included in the public software packages. A catalog entry or QR link is not a substitute for a valid figure file.

## Deutsch

**Bereits PFS1:** Die stabile LCD-App DE3.65/637 oder DE3.72/645 als Anwendung aktualisieren, vorhandene Dateien behalten und nicht erneut formatieren. **Noch SPIFFS/DE3.16 oder normales Upstream-LittleFS:** kein direktes, datenbewahrendes Update. Erst Speicherlayout, passende Hardware, vollständige externe Sicherung einschließlich Raw128-Metadaten und einen unterstützten Umstellungsweg bestätigen.

Eine erstmalige Umstellung umfasst Sicherung, passende Vorbereitung/Zielprüfung, ausdrücklich bestätigtes Löschen und Initialisieren von E:, Wiederherstellung und einen vollständigen Abschlussvergleich. Die [signierte SPIFFS-Vorbereitung DE3.30-PREP / 600](https://github.com/bluecyber81/pixl.js/releases/download/de3.72/Allmiibo_LCD_SPIFFS_DE3_30_PREP_600.zip) stellt bei passenden Altgeräten die 128 Rohattribute für die Sicherung bereit. Für die Erstinstallation muss der Ausgangszähler unter 600 liegen. Läuft PREP600 bereits, kannst du direkt die Raw128-Sicherung erstellen. Für die Zielsoftware DE3.72 muss die lokale Platzprüfung ausdrücklich App645 unterstützen. App643 bleibt von der Platzfreigabe ausgenommen. Fehlende Diagnosewerte rechtfertigen weder ein Downgrade noch Formatieren.

Bei einer unterbrochenen Wiederherstellung dieselbe ZIP und den passenden Beleg verwenden. Eine bereits als PFS1 gemountete Speicherung oder eine Zahl übertragener Dateien bestätigt den vollständigen Import noch nicht. Die äußere Gesamtpaket-ZIP ist nicht flashbar. Bootloader-/SoftDevice-Updates konvertieren ebenfalls keine Figurensammlung.
