# Build the Allmiibo LCD application DE3.61

The DE3.61 application uses DFU counter 633 and the existing Packed LittleFS PFS1 layout. The application package contains one signed image for the nRF52832 LCD board. Its compatible S112 firmware IDs are 0x0103 and 0x0126.

## Reproduce the released binary

Use Python 3.10 or newer and Docker with a Linux x86-64 engine. From the repository root, fetch the pinned SDK image once and launch the offline compilation.

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
python3 tools/build_lcd.py --mode release --jobs 4
```

The helper requires an empty output directory at `build/lcd-de361`. On Windows, use your Python launcher in place of `python3`. The build verifies the Nordic header override before compiling. The release check requires the exact unsigned application BIN SHA-256 shown below. The directory also contains the ELF, HEX, linker map, compiler log, checked source manifest and `BUILD_RESULT.json`.

| Item | DE3.61 |
| --- | --- |
| Unsigned BIN | 361,740 bytes |
| BIN SHA-256 | `b1a6eb4828ebc97f20cf72d22c44c50909ef4f8870232866880cc26eea95bbb7` |
| Source ID | `fcf19a7c25eb881945da7b896611fa580949f8c299fbc04874956d1f5a6d2508` |
| Signed application ZIP SHA-256 | `60413358ab8fae550c4ba520b027662572fe14ae16a4109a9b6f561fbd82200a` |

## Read the source ID

Open **Settings → App → Source-ID**. The display shows the first 12 hexadecimal digits. The full SHA-256 is in the BIN and the build report. The ID covers the local application sources, generated code, vendor component sources, catalogue inputs, linker script, application Makefile and identity generator. The input names and SHA-256 values are in `production-inputs.json`. Hash its UTF-8 JSON mapping with sorted keys, no whitespace and ASCII escaping to reproduce the ID. The SDK image and override have separate exact identifiers in the build report.

Make writes the generated ID header under `fw/_build`. A change to an included input triggers the version object's rebuild. Changing a test, a web file or the published binary hash does not change the firmware ID. The displayed prefix identifies the source set. Signature verification uses the bootloader's public key.

## Check the linker budgets

| Static measurement | Release | Minimum in CI |
| --- | ---: | ---: |
| Remaining flash according to `TotalFlashUsed` | 10,988 B | 8,192 B |
| Gap between `__HeapLimit` and `__StackLimit` | 1,904 B | 1,536 B |
| Stack reserved by the linker | 8,192 B | 8,192 B |

The flash calculation includes linker alignment. The 18 KiB application allocator and runtime stack watermark have separate diagnostics. Pull requests that touch the build inputs compile an unsigned candidate with the same layout and reserve checks. Pushes to `main` and manual builds additionally verify the release BIN hash. For development with a separate version, update the source version header and use `--mode development --version YOUR_VERSION --counter 634` or a higher counter. Each mode produces unsigned local binaries.

## Firmware release checks on GitHub

The **Unsigned LCD application and BL8 builds** workflow builds the ARM application and runs every DE2 and DE3 host regression discovered by `fw/tests/de3/run_all.py`. Discovery must reach the published suite count. The SDK test inputs come from the same digest-pinned image as the ARM build. The workflow also executes `check_stack_watermark_elf.py` with Unicorn 2.1.4 on the ELF it just built. Release runs check the OTA payload and ECDSA signature against that build and the BL8 public key, including three negative controls. Pull requests may build candidate bytes.

Download **lcd-firmware-evidence** from the run for the build log, BIN, HEX, ELF, linker map, source manifest, budgets, host report and ARM stack result. A failed job retains available diagnostics. These tests use a simulated CPU and host-side hardware substitutes.

Before publishing a firmware release, require a successful full run at the exact release commit with the signed OTA check. Run it manually for a documentation-only commit if the build path filters did not trigger. A release workflow can also call `.github/workflows/unsigned-firmware.yml` using `workflow_call` and make its publication job depend on that call with `needs`. The workflow is read-only and produces the evidence artifact after the tests. Firmware and web releases use the existing publication procedure.
