# LCD DE4.2-b1 / App679 · Transfer Test 5

Historical test instructions for tag [de4.2-b1-lcd-transfer-test](https://github.com/bluecyber81/pixl.js/tree/de4.2-b1-lcd-transfer-test). For the normal DE4.2 release use [the current build guide](BUILD_DE4_2.md).

## Deutsch

Diese Testversion ergänzt den Gruppen-Upload in den Packed-LittleFS-Speicher eines LCD-Allmiibo. Der Dateimanager kann bis zu vier neue Dateien mit je 572 Byte in einem privaten Zielordner gemeinsam schreiben. Beim Abschluss prüft die Firmware die SHA-256-Prüfsumme des gesamten Auftrags und veröffentlicht die Gruppe mit einer gemeinsamen, dauerhaften Änderung am Dateisystem. Bestehende Namen und veraltete Dateisystemstände werden abgelehnt. Fehlt nach einem Abbruch die Bestätigung, muss der Client die Gruppe auf dem Gerät abgleichen.

Für aktive Dateiübertragungen bietet die Firmware dem Computer bei einer langen Verbindungsperiode einmalig 20–30 ms an. Der Computer entscheidet, welches Intervall tatsächlich gilt. Das App-Paket setzt LCD, vorhandenes PFS1, Bootloader Z21 und S112 7.3.0 voraus. Die eigene Handy-ZIP ist `Allmiibo_LCD_DE4_2_b1_App679_NUR_APP_TEST.zip`. Die Freigabe gilt als Vorabversion. Die Funkzeit für eine vollständige Sammlung und der erste Praxistest dieser Firmware stehen aus.

## English

Transfer Test 5 adds a group import for the LCD Allmiibo running Packed LittleFS. Up to four new files of at most 572 bytes each share one commit. The device checks the SHA-256 of the group, refuses existing names and stale storage revisions, then acknowledges durable publication. If the final receipt goes missing, the client must reconcile the stored group before continuing. On a long connection interval, the application may request 20–30 ms for file transfers. The central negotiates the actual interval.

The application-only ZIP targets the LCD board with PFS1, Z21 and S112 7.3.0 (FWID `0x0126`). Its physical acceptance and end-to-end radio timing are pending. The normal release is LCD DE4.1 / App678.

## Reproducible build

Check out the `de4.2-b1-lcd-transfer-test` source tag on Linux using Git with original line endings. The source includes the application and filesystem code, build recipes, exact version header, public-key verification, library sources and applicable license notices. The SDK and compiler are pinned external build inputs. With Docker available, fetch the pinned toolchain image once and run the build from the repository root.

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
python3 -B tools/build_lcd.py --mode preview --output build/app679
python3 -B tools/check_release_ota.py --preview --build-dir build/app679
```

The two production builds used native Linux, Arm GNU 12.2.Rel1 (GCC 12.2.1), GNU Make 4.3 and the pinned Nordic SDK 17.1.0 archive, using the following equivalent build command. Follow the repository's existing SDK export recipe to obtain the same archive and toolchain. The native helper checks their SHA-256 values before compilation. The LCD Makefile applies size optimization and LTO to eleven file-transfer and storage objects. All flags used for those objects are in the source. The project reserves a minimum of 8,192 bytes of free application flash and 8,192 bytes of stack.

```sh
python3 -B tools/build_lcd.py --mode preview --backend native \
  --sdk-archive "$SDK_ARCHIVE" --toolchain "$ARM_TOOLCHAIN" --output build/app679-native
python3 -B tools/check_release_ota.py --preview --build-dir build/app679-native
PIXL_GROUP_CREATE_TEST=1 PIXL_SANITIZE=1 python3 -B fw/tests/de3/test_batch_read_de397.py
PIXL_GROUP_CREATE_TEST=1 PIXL_ARM32=1 python3 -B fw/tests/de3/test_batch_read_de397.py
```

The ARM32 host tests use `arm-linux-gnueabihf-gcc` and QEMU user emulation. The signing key stays with its owner. Both builds reproduced the exact application bytes shipped inside the signed ZIP. The repository's package verifier checks the original ZIP against the compiled application and the Z21 public key.

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| App-only ZIP | 257000 | `1e508061e86d75addb1345d5d8c9b0eac94ebf02081c519517461e952a7f5f17` |
| Application BIN | 364416 | `320863d4a3d140cc6082ec827cee2ddbfd1ec55ec37509305d195ecb9183a93e` |
| Application HEX | 1025125 | `9482d3f1bb97d4a306c5f4cb972b9f385da90096922260316c039a76ba4eed1b` |

The SourceID is `4765a2b88d7a9e4af396ab1d83318f1124423df69d13fd3e3ca2326b93d774c6`. The 722 production input hashes bind the application independently of web assets or the final release commit. The PFS engine SHA-256 is `4b779ad5f10e12d881e0c96c4495c6db3290cbac3c015b50d11dd73dc8189758`. The PFS1 on-disk format is retained. The build and model results are in [validation/DE4_2_B1_APP679.json](validation/DE4_2_B1_APP679.json). The production source hash list is in [validation/DE4_2_B1_APP679_production_inputs.json](validation/DE4_2_B1_APP679_production_inputs.json). The SDK archive recipe is in [BUILD_DE3_67.md](BUILD_DE3_67.md).
