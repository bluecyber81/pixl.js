# DE3.62 / 634, Web 3.38.0 and Z17

This follow-up closes the source-review tasks supplied on 2026-11-06. New device tests remain pending; previous DE3.61/Z15 device reports are historical observations.

| Task | Result |
| --- | --- |
| A: boot Makefile cleanup | Wrong heap target corrected in the new Z17 source. Frozen Z15 reference preserved. |
| B: complete web checks | Full tests, root/Pages bundles and isolated desktop/mobile browser scenarios; final evidence in WEB3_38_0.json. |
| C: RAM sample explanation | Neutral hints for zero, one, few, many and unavailable samples in both diagnostic views. |
| D: own-C warnings/native build | Three critical warnings fail all own-C compilation; 19 suppressed diagnostics corrected. Docker/native BIN and HEX agree. |
| E: startup/cache | Schema3 mount profiling implemented. Same1131-file image and raw128 metadata preserved. Same-size cache alternatives were worse; baseline cache policy retained. |
| F: boot LCD phases | Pruefen/Speichern bound to actual final validation and settings commit, with the five missing font glyphs restored. |
| G: boot ID/sample age | Documented backward-compatible proposal; not added to the wire protocol yet. Current reports clearly distinguish cached startup from a live clock. |
| H: real device exercise | Pending: phone-only availability during development. No claim of fresh RF, LCD or wake measurements. |

## Concrete corrections

The card helper formerly returned an unchecked memory pointer for short buffers and could dereference missing/unknown card state before the file dialog checked it. The helper now returns NULL/size0, which the existing file dialogs already reject. This is reproduced against an otherwise type-corrected App633 baseline; 4700 checks pass on native, ARM32 and ASan/UBSan with real card layouts. Valid data formats and bytes are unchanged.

Compiler cleanup uses the declared NFC interrupt-control prototype, uint8 CRC input, the actual AES key pointer, the declared HF/LF slot structure and explicit uintptr menu values. These are interface corrections, not a new cryptographic algorithm or a claimed radio speedup.

Web backup drive errors now appear in the backup panel; an active opening operation has visible feedback. During a new aggregate diagnostic read, the old completion timestamp is hidden. Detailed mount counters are expandable to keep the ordinary view short. Older firmware continues through the existing fallback.

The new bootloader reports phase progress only. An invalid image may also require saving an invalidated bank state, so Speichern is not an update-success message. No LCD transfer occurs in IRQ context and no artificial delay is added. The normal application update does not contain Z17 or S112.

## Evidence boundaries

145 portable firmware suites pass on the final source. Linked ARM image, catalog, vectors, budgets and signatures are checked. Z17 has separate source-bound ARM/host/sanitizer evidence and a simulated LCD preview. Cache comparison uses a synthetic 1131-file/77-directory image: 4531 physical reads and 1159936 bytes in both633 and634, no writes/erase/sync, complete raw128 preservation.

There is no measured additional startup speedup in this release. New measurements cost 40 bytes of diagnostic fields; the overall static RAM gap remains1840 bytes, above the1536-byte gate. Runtime allocator size stays18KiB. Physical tests do not follow from a source test or a saved diagnostic export.

For the phone test, flash the application ZIP on the matching existing LCD/PFS1 device, reconnect with the new file manager and export the full diagnosis. Then check a known figure, a large folder, the center button and sleep/wake. Z17 is a separate optional candidate with its own two-phase Android instructions; keep the phone connected until both phases finish.
