# Allmiibo Dateimanager 3.27.0

Browser software for file transfer, ZIP backup/import, storage migration and device diagnostics.
This folder is the companion application, not firmware to flash on the Allmiibo.

## Ready-built download / Fertiges Paket

Download `Allmiibo_Dateimanager_3_27_0_PUBLIC.zip` from the
[DE3.37 release](https://github.com/bluecyber81/pixl.js/releases/tag/de3.37).
Extract the complete ZIP. On Windows with Python 3 installed, run
`Start_8768.cmd` and open http://127.0.0.1:8768/ in a browser supporting Web Bluetooth.
On other systems: `python serve_local.py --port 8768 --directory dist`.
Use a single browser/client connection to the device. A VPN does not extend Bluetooth range.
No installation, formatting, migration, flashing or device connection happens merely by serving the page.

## Build from this source

Node.js >=22.12.0 is required. The lockfile pins dependencies.

```sh
npm ci
npm test
npm run build
```

The build also runs seven production-worker/WASM checks. Serve `dist` as above.
The Git source tree does not include a prebuilt `dist`; the downloadable ready-built ZIP does.

## Current changes

- ZIP imports recheck small folder records before committing metadata, preserving concurrent note/read-only changes.
- Closed IndexedDB recovery storage can be reopened on the next action; failed writes are not replayed automatically.
- Deliberate idle disconnections are informational; unexpected or pending-transfer disconnects remain errors.
- Unsupported optional energy queries do not produce a false device-status failure.
- Migration advice distinguishes inaccessible recovery records, a mismatched receipt and missing firmware capabilities.
- The local component target is DE3.37/609, BL6 and S112 7.3.0; this is not an online update check.
- The current capacity profile accepts the explicit DE3.36/608 and DE3.37/609 identities for the unchanged storage engine.

## Storage / Speicherumstellung

Existing Packed LittleFS PFS1 devices do not need to be formatted again for DE3.37.
SPIFFS and upstream standard LittleFS are different formats: see
[migration scope](../docs/MIGRATION_PFS1.md).
Restoration transfers files and performs one final full content/Raw128 comparison;
the additional full comparison before restoration remains optional.
Never install the historical SPIFFS preparation firmware merely because a query failed on an already migrated device.

## Export and verification

Diagnostics can be previewed/copied and saved using browser-supported file/download mechanisms.
An initiated download is not proof of a saved file. If an embedded browser blocks the download,
the user-confirmed workaround is opening the manager in desktop Chrome.

659 host tests and seven production-worker checks passed for this version.
Simulated races and failures are not a complete physical device/migration test.
See [German usage notes](LIESMICH_3_27_0.txt), [component notices](third-party/npm/SOURCES.json)
and the top-level third-party notices. Original component licenses remain applicable.
