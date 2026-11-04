# Build the Allmiibo LCD application DE3.59

The DE3.59 application uses DFU counter 631 and the existing Packed LittleFS PFS1 layout. The application package contains one signed image for the nRF52832 LCD board. Its compatible S112 firmware IDs are 0x0103 and 0x0126.

## Reproduce the released binary

Use Python 3.10 or newer and Docker with a Linux x86-64 engine. From the repository root, fetch the pinned SDK image once and launch the offline compilation.

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
python3 tools/build_lcd.py --mode release --jobs 4
```

The helper requires an empty output directory at `build/lcd-de359`. On Windows, use your Python launcher in place of `python3`. The build verifies the Nordic header override before compiling. The release check requires the exact unsigned application BIN SHA-256 shown below. The directory also contains the ELF, HEX, linker map, compiler log, checked source manifest and `BUILD_RESULT.json`.

| Item | DE3.59 |
| --- | --- |
| Unsigned BIN | 363,576 bytes |
| BIN SHA-256 | `02c99fd79c1d21ec24377530103edadc4aac08795dd7e8f9476711ecd33430fd` |
| Source ID | `7b4822b045b48707f1bc1737933a234040989e74bb275d13a454154776618a22` |
| Signed application ZIP SHA-256 | `79387111d02a5bbaf5caee25b5032769c07562d6862f46f89161c66602d5d924` |

## Read the source ID

Open **Settings → Version → Source-ID**. The display shows the first 12 hexadecimal digits. The full SHA-256 is in the BIN and the build report. The ID covers the local application sources, generated code, vendor component sources, catalogue inputs, linker script, application Makefile and identity generator. The input names and SHA-256 values are in `production-inputs.json`. Hash its UTF-8 JSON mapping with sorted keys, no whitespace and ASCII escaping to reproduce the ID. The SDK image and override have separate exact identifiers in the build report.

Make writes the generated ID header under `fw/_build`. A change to an included input triggers the version object's rebuild. Changing a test, a web file or the published binary hash does not change the firmware ID. The displayed prefix identifies the source set. Signature verification uses the bootloader's public key.

## Check the linker budgets

| Static measurement | Release | Minimum in CI |
| --- | ---: | ---: |
| Remaining flash according to `TotalFlashUsed` | 9,152 B | 8,192 B |
| Gap between `__HeapLimit` and `__StackLimit` | 1,936 B | 1,536 B |
| Stack reserved by the linker | 8,192 B | 8,192 B |

The flash calculation includes linker alignment. The 18 KiB application allocator and runtime stack watermark have separate diagnostics. Pull requests that touch the build inputs compile an unsigned candidate with the same layout and reserve checks. Pushes to `main` and manual builds additionally verify the release BIN hash. For development with a separate version, update the source version header and use `--mode development --version YOUR_VERSION --counter 632` or a higher counter. Each mode produces unsigned local binaries.
