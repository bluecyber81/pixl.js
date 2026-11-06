# Reproduce DE3.62 / 634

Application-only LCD/PFS1 build. No signing key or device access is needed. The default Docker path uses Python 3.10+; the native Linux path needs Python 3.12+, GNU make and the checked ARM GNU 12.2.Rel1 compiler.

```sh
docker pull solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16
python3 tools/build_lcd.py --mode release
```

Output `build/lcd-de362` must be empty. Previous results are never overwritten. The helper creates an isolated source copy, applies only the checked NVIC override, checks the source manifest and memory budgets, and verifies the exact BIN hash. It exports BIN, HEX, ELF, linker map and logs. Its direct `pixljs` target preserves archived version metadata.

Native Linux/WSL alternative, using the source SDK archive from the review package:

```sh
python3 tools/build_lcd.py --mode release --backend native --sdk-archive /path/Nordic_SDK_Buildquellen_17_1_0.tar.gz --toolchain /path/arm-gnu-toolchain-12.2.rel1-x86_64-arm-none-eabi --output build/native-de362
```

The archive must have SHA-256 `f726a4e717a0d8e00fe3de9f1e76b19a0c9646291de00097a75cda44c4bcd6d6`; the compiler executable must match `a3c5b9d3b1d05160462b6c86e46f3a3471db314f6406f0e6a98973524ab00da3`. The supplied SDK and toolchain are not modified. Only PATH/HOME/TMPDIR and fixed build variables reach make; inherited CFLAGS, MAKEFILES and compiler overrides cannot silently change the source-bound build. No tool installation occurs automatically.

| Item | Value |
| --- | --- |
| BIN bytes | 362332 |
| BIN SHA-256 | `597d61e301d663f30abfd63512c5d44faba7cfe5345a2b216d715003704aa9ca` |
| Source ID | `5a0eec38856ea04743c235ae269c910dbecab5cf7aff1b5342f78526c5eba81d` |
| Application ZIP SHA-256 | `f733ff1b30e17b9f62113c0a10a2abf9bfcc6dfd8f3aad7b03ca0f6da356503f` |
| Linker flash reserve / minimum | 10396 / 8192 B |
| Heap/stack gap / minimum | 1840 / 1536 B |
| Stack reserved | 8192 B |

The application allocator remains 18432 B. Mount diagnostics use 40 B of fields; overall linked RAM reserve decreased by 64 B including layout effects. Native and Docker BIN/HEX match. ELF/map debug paths differ between temporary build directories; byte-identical ELF/map is not claimed.

Own C files under `fw/application/src` fail compilation for implicit functions, incompatible pointers and implicit integer/pointer conversions. Vendor warning policy is kept separate. The build log demonstrates the complete ARM build; it is not an NFC/RF or physical power-loss test.

## Full portable suite

Use Linux Python 3.12, GCC, ARM Linux GCC/QEMU and Unicorn. The helper copies sources and the pinned SDK to temporary directories and removes inherited PIXL source overrides.

```sh
python3 tools/run_firmware_tests.py --sdk-archive /path/Nordic_SDK_Buildquellen_17_1_0.tar.gz --report /path/new-report.json
python3 fw/tests/de3/check_stack_watermark_elf.py build/lcd-de362/pixljs.out
python3 tools/check_release_ota.py
```

The release evidence contains 145 passed host suites and actual linked Cortex-M4 stack-serializer checks. Deliberately contaminated native-build and test environments were also exercised. The application catalog was decoded from the final BIN: all 952 figures, 82 games and 1344 links remain identical to the verified reference.

For a development version, change `version.inc.h` and use `--mode development --version YOUR_VERSION --counter 635` or a later unused counter. Release mode is reserved for the exact archived image.
