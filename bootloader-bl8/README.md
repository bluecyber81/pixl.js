# BL8: corresponding LCD bootloader source

This is the exact **BL8** source snapshot used for the 28 October 2026 LCD build.
It is separate from the application's inherited `fw/bootloader` directory.
`SOURCE_BINDING.json` binds all 20 local production inputs and the SDK header
override to that historical build. `EVIDENCE.json` distinguishes historical
checks from the current export/build verification.

**Deutsch:** Hier liegt der zum BL8-Binary passende Quellstand. BL8 ist keine
neue SoftDevice-Version und kein allgemeines Update für jedes Allmiibo.
Bootloadercode, Paket-Versionszähler, Gerätemodell und Dateisystem sind getrennt
zu prüfen. Die vorhandene Anwendung und Sammlung werden durch diesen
Quellcode-Export nicht verändert. Das für ein zweites Gerät vorbereitete
BL8/S112/DE3.55-Paket ist kein universell freigegebenes Installationspaket.

## Build without keys or hardware

Python 3.10+ (standard library), Docker and an x86-64 Linux Docker engine are
required. The pinned image must already be present. Review the Nordic SDK terms
before explicitly obtaining it:

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
cd bootloader-bl8
python build.py --check
python build.py
```

`--check` reads the bound inputs only. The build uses `--pull=never` and
`--network none`, installs nothing, signs nothing and accesses no Bluetooth,
USB or other device. It copies source into a disposable container, runs
`make -j8 BOARD=LCD bootloader` with `CFLAGS=-fstack-usage`, and checks the
rebuilt padded bootloader region against:

```text
add1f8f0422dc9da6c4e2ce90899e3fc7b5d0498993030c0bd5110cdc5b66130
```

The exact compiler is Arm GNU Toolchain 12.2.Rel1, GCC 12.2.1 20221205.
Results go into `_build/`; a nonempty output directory is rejected. The helper
does not delete previous results. `_build/` is excluded from Git. The resulting
HEX includes build-time configuration records and is **not an OTA package**;
do not flash it as an application update. Binary equality validates this
source/build correspondence, not radio, power-loss recovery or device
compatibility.

The pinned SDK's original S112 `nrf_nvic.h` hash is checked before applying the
retained DRGN-10613 MWU IRQ-mask workaround inside the disposable container.
The corrected header hash is also checked. Both hashes are recorded in the
manifest; the local SDK installation and actual SoftDevice binary are unchanged.

## What BL8 changes

BL8 adds a terminal error reply when a previously accepted Execute command
cannot be requeued because the scheduler is full while flash remains busy.
The original client session receives `OPERATION_FAILED`; its request no longer
waits silently for a timeout. Stale sessions are not attributed a response.
Flash content/progress is not reset, and a later Execute attempt may succeed.
This builds on the inherited BL7 settings/backup-commit completion handling.

The historical host review reproduced the old behavior and exercised 35
commit/Execute scenarios, native and with ASan/UBSan; ownership checks and five
transport/display/font/activation/partition regression groups were also run.
A 29 October bounded re-audit ran five groups and 35 sanitized scenarios again
without changing BL8. Its initial runner path error and corrected rerun are
explicitly recorded in `EVIDENCE.json`. Those historical harnesses depended on
external SDK and old review trees; they are not advertised as runnable tests
included in this export. Mocked execution does not establish physical delivery,
power-loss behavior or minimum runtime stack headroom.

## Exact image and version boundaries

- Target: the verified nRF52832 LCD wiring; hardware-version field **52** is not
  a universal board identifier.
- Bootloader region: `0x77000` to before `0x7E000`; MBR parameters and settings
  remain separate at `0x7E000` / `0x7F000`.
- Bootloader payload: **28,136 bytes**, 536 bytes region reserve; SHA-256
  `270a71603d305aaffcfe9da1998be99fea27aebe5dc824de90cf3867c3666398`.
- Historical standalone BL8 OTA used **counter 9**. Byte-identical BL8 code in
  the combined S112/BL package used **counter 11**. The counter is signed update
  metadata, not a distinct BL8 code revision. In particular, counter 9 must not
  be treated as an upgrade for an installed counter 11.
- Bootloader update policy requires a higher bootloader counter. The combined
  counter-11 candidate therefore is not replayable onto counter 11 or higher.
- The existing browser updater is application-only. Mixed system/application
  updates need a suitable Nordic Secure DFU client and both phases must finish.
  A successful application menu alone does not prove BL or S112 installation.
- The source tree contains only the public verification key. Compatibility with
  the inherited public upstream key is not exclusive publisher authentication.
  Private signing keys, retail keys, collections and private device reports are
  excluded. No ready-to-flash binary is included in this folder.

## Nordic S112 and licensing

The matching tested system component is the original **Nordic S112 7.3.0**, FWID
`0x0126`; its implementation is a vendor binary, not modified project source.
The SDK compile headers and the installed binary version are different layers.
Obtain and review the vendor distribution from
[Nordic S112 downloads](https://www.nordicsemi.com/Products/Development-software/S112/Download).
The exact previously reviewed vendor ZIP has SHA-256
`af3e558dd752311fb71e3623d12c37711b9664d485b8bc5cd9164620c0ae1ca4`;
the HEX has SHA-256
`92bcdc1aa51142ed212bb0dbcdf57093a1bad391f1cf5adca60effe14bdb7ec6`.
This identifies the tested artifact; it is not a claim that no newer vendor
release exists at the time you read this document. No SoftDevice binary or
complete SDK is redistributed in this folder.

Pixl.js-derived code retains the repository's GPL-2.0 license and upstream
attribution. The selected Nordic SDK override files retain their original
copyright/conditions in full; `sdk-overrides/nRF5_Nordic_license.txt` accompanies
them. The vendor S112 license is retained separately for reference as
`sdk-overrides/S112_7.3.0_license-agreement.txt`. These Nordic terms restrict use
to Nordic integrated circuits and are not replaced by the top-level GPL text.
The vendor binary terms must be reviewed independently before redistribution.
