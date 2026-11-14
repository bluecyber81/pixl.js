# Third-party notices

The DE3.55 source snapshot, application-only firmware, optional BL8 source and Dateimanager 3.33.1 contain components with different licenses. The original top-level GPL version 2 text remains in [LICENSE](LICENSE). This index does not relicense individual components or assert one shared license.

Original source notices remain in place. Additional copies, file hashes, provenance and exact web-package versions are collected in [LICENSES/INVENTORY.json](LICENSES/INVENTORY.json). Keep applicable notices with redistributed source and binary packages.

## Firmware and build tools

| Component | Observed terms | Notice |
| --- | --- | --- |
| project | GPL-2.0 text | [original notice copy](LICENSES/firmware/LICENSE) |
| Chameleon RFID | GPL-3.0 text | [original notice copy](LICENSES/firmware/fw/components/chameleon-ultra/LICENSE) |
| amiitool | MIT | [original notice copy](LICENSES/firmware/fw/components/amiitool/LICENSE) |
| cwalk | MIT | [original notice copy](LICENSES/firmware/fw/components/cwalk/LICENSE.md) |
| littlefs | BSD-3-Clause | [original notice copy](LICENSES/firmware/fw/components/littlefs/LICENSE.md) |
| mlib | BSD-2-Clause | [original notice copy](LICENSES/firmware/fw/components/mlib/LICENSE) |
| SPIFFS | MIT | [original notice copy](LICENSES/firmware/fw/components/spiffs/LICENSE) |
| TLSF | BSD-3-Clause in header | [original notice copy](LICENSES/firmware/header-notices/tlsf-header-notice.txt) |
| QR Code generator | MIT in header | [original notice copy](LICENSES/firmware/header-notices/qrcodegen-header-notice.txt) |
| u8g2 code | BSD-2-Clause in header | [original notice copy](LICENSES/firmware/header-notices/u8g2-header-notice.txt) |
| WenQuanYi bitmap font | GPL v2 with font embedding exception, declared in BDF | [original notice copy](LICENSES/firmware/header-notices/wenquanyi-font-notice.txt) |
| bdfconv build tools | BSD-2-Clause | [original notice copy](LICENSES/firmware/fw/scripts/LICENSE) |
| Nordic/Telit NFC prebuilt libs | Nordic/Telit redistribution license with Nordic-use and binary restrictions | [original notice copy](LICENSES/firmware/fw/components/chameleon-ultra/firmware/nrf52_sdk/components/nfc/t2t_lib/license.txt) |

The application links selected Chameleon RFID sources, whose component GPL version 3 license and file-level notices remain applicable. The root GPL version 2 text is not substituted for that license. Copyright, source-distribution and other obligations remain those of the original notices.

The application uses the external pinned Nordic SDK through NRF52_SDK_ROOT. The NFC/Telit library notice limits use to Nordic Semiconductor integrated circuits and includes binary-use restrictions. Preserve the vendor notices; these libraries are not described as unrestricted MIT/GPL software.

The unused vendored Chameleon SDK and PC-tool trees are excluded from this public application snapshot. Selected license texts from the original source archive remain in LICENSES/firmware for provenance and SDK reference; presence of a license copy does not imply that its associated static library, SoftDevice, CMSIS tool or pthread DLL is shipped.

The retained bdfconv executables are historical font-generation build tools covered by fw/scripts/LICENSE. Fonts have separate notices: the supplied WenQuanYi BDF declares GPL v2 with a font embedding exception. The u8g2 code license must not be assumed to cover every font.

## Current web and SDK additions

Dateimanager 3.49.0 has its dependency lock in
[web/package-lock.json](web/package-lock.json). The public Web 3.48.1 archive
remains available with its own notices. The firmware component notices are
included in `fw/`, `bootloader-z19/` and `softdevice-s112/`.

The web dependency inventory and original packaged notices are under
[web/third-party/npm/SOURCES.json](web/third-party/npm/SOURCES.json) and
`web/third-party/npm/licenses/`. The inventory includes available license
declarations for packages that omit separate license files. The AmiiboAPI,
QR generator, DFU, JSZip, CRC32 and packed-simulator notices are in
`web/third-party/` and `web/public/dfu/`.

`tools/sdk-overrides/nrf_nvic.h` retains the Nordic copyright/license header. It is the
checked S112 compatibility correction used by the pinned SDK build; see the public build guide.
The external complete Nordic SDK is not redistributed here. Optional BL6 has its own
source/provenance and Nordic notices under `bootloader-bl6`; the normal application ZIP does not contain it.

## Separate BL8 and S112 reference-component release

The [component release](https://github.com/bluecyber81/pixl.js/releases/tag/bl8-s112-7.3.0) separately republishes the byte-identical original Nordic S112 7.3.0 ZIP with its full license, API and release notes. [softdevice-s112/LICENSE_NORDIC.txt](softdevice-s112/LICENSE_NORDIC.txt) also preserves the terms and disclaimer. The vendor software is restricted to Nordic integrated circuits, is not relicensed under GPL and is not endorsed by Nordic. Project integration/header corrections are distinguished from vendor binary fixes. The signed BL8-only OTA is accompanied by corresponding source and original project/Nordic notices.

## Historical DE3.16 web inventory

The following table describes the historical DE3.16 browser distribution. Dependency notices are supplied separately because its minified bundle does not preserve a complete set of notices. This conservative inventory covers every non-dev entry of the pinned lockfile, including transitive, type and build-support entries; it does not assert that all entries survive into the browser bundle.

| Package | Version | Declared license | Included notice |
| --- | --- | --- | --- |
| @babel/helper-string-parser | 7.29.7 | MIT | [original notice](LICENSES/web/@babel__helper-string-parser@7.29.7/LICENSE) |
| @babel/helper-validator-identifier | 7.29.7 | MIT | [original notice](LICENSES/web/@babel__helper-validator-identifier@7.29.7/LICENSE) |
| @babel/parser | 7.29.9 | MIT | [original notice](LICENSES/web/@babel__parser@7.29.9/LICENSE) |
| @babel/types | 7.29.8 | MIT | [original notice](LICENSES/web/@babel__types@7.29.8/LICENSE) |
| @ctrl/tinycolor | 4.2.1 | MIT | [original notice](LICENSES/web/@ctrl__tinycolor@4.2.1/LICENSE) |
| @element-plus/icons-vue | 2.3.2 | MIT | [original notice](LICENSES/web/@element-plus__icons-vue@2.3.2/LICENSE) |
| @floating-ui/core | 1.8.0 | MIT | [original notice](LICENSES/web/@floating-ui__core@1.8.0/LICENSE) |
| @floating-ui/dom | 1.8.0 | MIT | [original notice](LICENSES/web/@floating-ui__dom@1.8.0/LICENSE) |
| @floating-ui/utils | 0.2.12 | MIT | [original notice](LICENSES/web/@floating-ui__utils@0.2.12/LICENSE) |
| @intlify/core-base | 11.4.16 | MIT | [original notice](LICENSES/web/@intlify__core-base@11.4.16/LICENSE) |
| @intlify/devtools-types | 11.4.16 | MIT | [original notice](LICENSES/web/@intlify__devtools-types@11.4.16/LICENSE) |
| @intlify/message-compiler | 11.4.16 | MIT | [original notice](LICENSES/web/@intlify__message-compiler@11.4.16/LICENSE) |
| @intlify/shared | 11.4.16 | MIT | [original notice](LICENSES/web/@intlify__shared@11.4.16/LICENSE) |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT | [original notice](LICENSES/web/@jridgewell__sourcemap-codec@1.6.0/LICENSE) |
| @sxzz/popperjs-es | 2.11.8 | MIT | [original notice](LICENSES/web/@popperjs__core@2.11.8/LICENSE.md) |
| @types/lodash | 4.17.27 | MIT | [original notice](LICENSES/web/@types__lodash@4.17.27/LICENSE) |
| @types/lodash-es | 4.17.12 | MIT | [original notice](LICENSES/web/@types__lodash-es@4.17.12/LICENSE) |
| @types/web-bluetooth | 0.0.21 | MIT | [original notice](LICENSES/web/@types__web-bluetooth@0.0.21/LICENSE) |
| @vue/compiler-core | 3.5.44 | MIT | [original notice](LICENSES/web/@vue__compiler-core@3.5.44/LICENSE) |
| entities | 7.0.1 | BSD-2-Clause | [original notice](LICENSES/web/@vue__compiler-core__dependency__entities@7.0.1/LICENSE) |
| @vue/compiler-dom | 3.5.44 | MIT | [original notice](LICENSES/web/@vue__compiler-dom@3.5.44/LICENSE) |
| @vue/compiler-sfc | 3.5.44 | MIT | [original notice](LICENSES/web/@vue__compiler-sfc@3.5.44/LICENSE) |
| @vue/compiler-ssr | 3.5.44 | MIT | [original notice](LICENSES/web/@vue__compiler-ssr@3.5.44/LICENSE) |
| @vue/devtools-api | 6.6.4 | MIT | [original notice](LICENSES/web/@vue__devtools-api@6.6.4/LICENSE) |
| @vue/reactivity | 3.5.44 | MIT | [original notice](LICENSES/web/@vue__reactivity@3.5.44/LICENSE) |
| @vue/runtime-core | 3.5.44 | MIT | [original notice](LICENSES/web/@vue__runtime-core@3.5.44/LICENSE) |
| @vue/runtime-dom | 3.5.44 | MIT | [original notice](LICENSES/web/@vue__runtime-dom@3.5.44/LICENSE) |
| @vue/server-renderer | 3.5.44 | MIT | [original notice](LICENSES/web/@vue__server-renderer@3.5.44/LICENSE) |
| @vue/shared | 3.5.44 | MIT | [original notice](LICENSES/web/@vue__shared@3.5.44/LICENSE) |
| @vueuse/core | 15.0.0 | MIT | [original notice](LICENSES/web/@vueuse__core@15.0.0/LICENSE) |
| @vueuse/metadata | 15.0.0 | MIT | [original notice](LICENSES/web/@vueuse__metadata@15.0.0/LICENSE) |
| @vueuse/shared | 15.0.0 | MIT | [original notice](LICENSES/web/@vueuse__shared@15.0.0/LICENSE) |
| bytebuffer | 5.0.1 | Apache-2.0 | [original notice](LICENSES/web/bytebuffer@5.0.1/LICENSE) |
| csstype | 3.2.3 | MIT | [original notice](LICENSES/web/csstype@3.2.3/LICENSE) |
| dayjs | 1.11.23 | MIT | [original notice](LICENSES/web/dayjs@1.11.23/LICENSE) |
| element-plus | 2.14.7 | MIT | [original notice](LICENSES/web/element-plus@2.14.7/LICENSE) |
| async-validator | 4.2.5 | MIT | [original notice](LICENSES/web/element-plus__dependency__async-validator@4.2.5/LICENSE.md) |
| estree-walker | 2.0.2 | MIT | [original notice](LICENSES/web/estree-walker@2.0.2/LICENSE) |
| lodash | 4.18.1 | MIT | [original notice](LICENSES/web/lodash@4.18.1/LICENSE) |
| lodash-es | 4.18.1 | MIT | [original notice](LICENSES/web/lodash-es@4.18.1/LICENSE) |
| lodash-unified | 1.0.3 | MIT | [package declaration; original text missing](LICENSES/web/lodash-unified@1.0.3/PACKAGE_LICENSE_DECLARATION.txt) |
| long | 3.2.0 | Apache-2.0 | [original notice](LICENSES/web/long@3.2.0/LICENSE) |
| magic-string | 0.30.21 | MIT | [original notice](LICENSES/web/magic-string@0.30.21/LICENSE) |
| memoize-one | 6.0.0 | MIT | [original notice](LICENSES/web/memoize-one@6.0.0/LICENSE) |
| nanoid | 3.3.20 | MIT | [original notice](LICENSES/web/nanoid@3.3.20/LICENSE) |
| normalize-wheel-es | 1.2.0 | BSD-3-Clause | [original notice](LICENSES/web/normalize-wheel-es@1.2.0/LICENSE) |
| picocolors | 1.1.1 | ISC | [original notice](LICENSES/web/picocolors@1.1.1/LICENSE) |
| postcss | 8.5.31 | MIT | [original notice](LICENSES/web/postcss@8.5.31/LICENSE) |
| source-map-js | 1.2.2 | BSD-3-Clause | [original notice](LICENSES/web/source-map-js@1.2.2/LICENSE) |
| vue | 3.5.44 | MIT | [original notice](LICENSES/web/vue@3.5.44/LICENSE) |
| vue-component-type-helpers | 3.3.13 | MIT | [original notice](LICENSES/web/vue-component-type-helpers@3.3.13/LICENSE) |
| vue-i18n | 11.4.16 | MIT | [original notice](LICENSES/web/vue-i18n@11.4.16/LICENSE) |

The @vue/devtools-api notice comes from the exact source commit recorded by npm for 6.6.4. bytebuffer and long supply Apache-2.0 license texts even though their lockfile entries lack a license field.

**Unresolved notice gap:** lodash-unified 1.0.3 declares MIT and author Jack Works, but its published four-file package supplies no separate LICENSE, repository or homepage. The included declaration records that fact and the integrity-checked tarball hash. No original copyright statement or license text has been invented.

## Distribution boundaries

The normal DE application OTA files are application-only images and do not replace the bootloader or SoftDevice. The separate BL8/S112 reference-component release includes a clearly identified bootloader-only OTA and the unchanged original Nordic vendor distribution with their corresponding source/notices and installation boundaries. The historical public upstream default signing key is not a private or unique trust credential. No private signing key is included in this working-tree snapshot.

User figure collections, private device reports and account credentials gain no distribution rights from the firmware license. This package is not a collection of amiibo dumps.

This index records provenance and included terms. It is not a blanket legal compatibility determination, upstream endorsement, or claim that every hardware/software issue has been resolved.
