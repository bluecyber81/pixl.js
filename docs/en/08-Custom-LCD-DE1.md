# Local LCD build 2.21.0-DE1

This local customization is based on cylin577/pixl.js tag `v2.21.0`, commit
`57a364329436745f780e70ac07a1642989a00d6f`. It targets **LCD** hardware only.
It retains that fork's four mini-games, animation player, settings and NFC fixes.
It is not an upstream release and has not been validated on hardware by building it.

The compiled UI languages are German and English. All 199 German strings are
populated, including the game's menu and new settings. German is the default and
the fallback for unsupported saved language values; English keeps enum value 1.
Enum value 0 now selects German. Other settings and the settings binary layout
are unchanged. The font is regenerated after the language and database changes.
The language generator emits availability macros, and Chinese database-name
selection is guarded through a shared helper so a build without Chinese compiles.
Figure names and game notes use the existing English metadata in both UI locales.

Metadata for 18 new Amiibo IDs is imported from solosky/pixl.js PR440 at immutable
head `3a7d244ffe0f39db4f069dbf32df626636119386`, for a total of 950 entries.
All prior records and category IDs are preserved. The imported PRAGMATA and
Resident Evil Requiem groups use previously unused IDs 77 and 78, preserving
Shovel Knight categories 41 and 42; Super Mario Bros. Wonder uses ID 76.
PR440's new Ratha/Ratha V/Rudy links are moved from Stories 2 to a new
Monster Hunter Stories 3 group (79), and the new Raiders trio is moved from
Splatoon 3 to Splatoon Raiders (80). Mario and Luma / Rosalina and Lumas move
from Wonder to Super Mario Galaxy + Super Mario Galaxy 2 (81). No original link
is moved or removed. These group corrections follow Nintendo's product/support
pages, rather than implying unverified compatibility with the older games:

- https://www.nintendo.com/jp/hardware/amiibo/game/mh-stories3/index.html
- https://en-americas-support.nintendo.com/app/answers/detail/a_id/71703/
- https://www.nintendo.com/de-de/Hardware/amiibo-/Details/Mario-Luma-3090965.html
- https://www.nintendo.com/us/amiibo/detail/rosalina-and-lumas-super-mario-galaxy-plus-super-mario-galaxy-2-series/

These are names, IDs and group links only. No keys or figure dumps are supplied.
Database recognition does not establish game compatibility or enable V3 data
generation; V3 figures still depend on a supported, valid user-supplied dump.

Database generation now uses local CSV metadata by default and never changes it
in offline mode. An intentional online refresh requires the explicit `--refresh`
argument to `amiibo_db_gen.py`. The build uses `--offline`.

## Build

Use the x86-64 container image pinned by digest:

`solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16`

Mount this repository at `/work` and run `bash /work/fw/scripts/build_de1.sh` with
container networking disabled. It runs the metadata, language and font generators,
builds LCD firmware, and produces the signed application-only OTA ZIP and size
report in `fw/_build`. Existing generated icon resources are kept; no imageio
installation is needed. It never runs a flash target.

The human-readable version is `2.21.0-DE1`; the numeric DFU application version is
**549**, explicitly above the original 548. Hardware version is 52, the required
SoftDevice identifier is `0x0103`, and the application is signed with the existing
repository DFU key without changing the key or bootloader public key.
The source bootloader has downgrade prevention disabled and accepts equal
versions, but the actual installed bootloader must be identified independently.
The full HEX and bootloader HEX are build products, not an instruction to replace
the device's bootloader or SoftDevice. Use only the matching application OTA after
device identification and backup. A compiler success does not verify radio,
display, controls, saved figures or gameplay on a physical device.
