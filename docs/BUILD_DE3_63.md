# Reproduce DE3.63 / 635

Application-only build for the matching nRF52832 LCD board with an existing Packed LittleFS PFS1 volume. No signing key or device access is needed for the unsigned build. The build does not install a bootloader, SoftDevice or filesystem.

## Pinned tools and Docker build

The helper pins the SDK image and exports the actual binary, HEX, ELF, linker map, production-input manifest and build log. It creates an isolated source/SDK copy and verifies the released BIN hash in release mode.

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
python3 tools/build_lcd.py --mode release
```

The output directory `build/lcd-de363` must be empty. Use `--output` with a new directory to preserve earlier results. No implicit tool installation or image download occurs inside the helper. The Docker path needs Python 3.10+ on the host.

## Native Linux or WSL build

Use Python 3.12+, GNU make, the pinned Nordic 17.1.0 SDK source archive and ARM GNU 12.2.Rel1. On the Windows development laptop, select the working `Ubuntu-24.04-Codex-New` distribution explicitly; Linux paths must point to the actual available files.

```sh
python3 tools/build_lcd.py --mode release --backend native \
  --sdk-archive /path/Nordic_SDK_Buildquellen_17_1_0.tar.gz \
  --toolchain /path/arm-gnu-toolchain-12.2.rel1-x86_64-arm-none-eabi \
  --output build/native-de363
```

The exact SDK archive and compiler hashes are enforced in `tools/build_lcd.py`. The supplied SDK/toolchain are not modified. The checked NVIC override is applied to a disposable SDK copy. Only process essentials and fixed build variables reach make; inherited CFLAGS, MAKEFILES or compiler overrides cannot silently alter the build.

## Source binding and memory limits

[`RELEASE_INFO.json`](../RELEASE_INFO.json) identifies the released version, application counter, application and OTA hashes, source identity and test manifests. Each build's `BUILD_RESULT.json` records the actual sizes, linker budgets and artifact hashes; `production-inputs.json` binds the compiled inputs. Compare these records from the final source revision. Do not substitute DE3.62 measurements or an older ELF/map.

The gates are unchanged:

| Gate | Required minimum |
| --- | ---: |
| Linked application flash reserve | 8,192 B |
| Heap/stack boundary gap | 1,536 B |
| Reserved application stack | 8,192 B |

The app allocator remains 18,432 B. The note pages reuse existing view and scrolling state. Final linked measurements, rather than that design observation, determine acceptance. The supported application memory regions remain FLASH `0x19000` with length `0x5B000` and RAM `0x20003600` with length `0xCA00`.

The small German hint table is generated from `fw/data/usage-translations.de.json` and checked against the Web source. The checked-in header is used by normal builds; no network lookup or Web runtime is needed.

```sh
python3 fw/scripts/generate_usage_de.py --check
python3 fw/scripts/amiibo_db_validate.py
python3 fw/scripts/amiibo_usage_export.py --check
```

## Tests and signed package verification

The full portable suite needs Linux Python 3.12, GCC, ARM Linux GCC and Unicorn in the selected test environment. The helper creates temporary source/SDK copies and rejects existing report files. Use a new output path.

```sh
python3 tools/run_firmware_tests.py \
  --sdk-archive /path/Nordic_SDK_Buildquellen_17_1_0.tar.gz \
  --report /path/new-de363-tests.json
python3 fw/tests/de3/check_stack_watermark_elf.py build/lcd-de363/pixljs.out
python3 tools/check_release_ota.py
```

The last command verifies the distributed application ZIP against the fresh release build and the repository's public verification key. It checks the signature, application-only component type, counter, hardware field, accepted SoftDevice FWIDs and payload, including negative controls. It does not sign or flash anything. Private signing material is not included in the source release.

The targeted note tests compile actual view/menu callbacks and render the production font. They cover page switching, line scrolling, menu return, translation fallback and unchanged tag contents. They do not emulate the physical display, radio, sleep/wake or actual button contacts. Computer tests and build equality do not constitute a new hardware qualification.

For development, update `version.inc.h` and use `--mode development --version YOUR_VERSION --counter 636` or a later unused counter. `--mode release` is reserved for the exact published DE3.63 image; do not label changed bytes as that release.
