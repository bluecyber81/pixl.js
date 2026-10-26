# Upstream 2.22 startup and language integration

Reviewed against the public `cylin577/pixl.js` v2.22.0 sources on 2026-10-25:

- [Allocator](https://github.com/cylin577/pixl.js/blob/v2.22.0/fw/application/src/mui/mui_mem.c), Git blob `2d6489e0c66c335bf92eb48fc13a4a88b4489ae4`.
- [Startup](https://github.com/cylin577/pixl.js/blob/v2.22.0/fw/application/src/main.c), Git blob `428c41089c78fb24a632904a69049c106b8247b4`.
- [Generator](https://github.com/cylin577/pixl.js/blob/v2.22.0/fw/scripts/i18n_gen.py), Git blob `83c8e0bbc927df5996abddab8e815c8a14660236`.

The application pool is initialized before settings/storage startup. The later
`mui_init()` call reuses that pool, preserving both outstanding allocations and
the local allocation counters. Explicit `mui_mem_deinit()` followed by a new
initialization still creates a fresh pool. The pool remains 18 KiB. This is
startup preparation, not an automatic filesystem migration.

The generator accepts `I18N_LANGS=de_DE,en_US` or another comma-separated subset
of CSV languages. English is added if omitted because `getLangString()` uses it
as its fallback. Unknown, duplicate or empty selections fail before any output
is written. Configured languages keep their configuration order, irrespective
of override order; additional languages follow after them. Descriptions and
`LANGUAGE_HAS_*` guards are retained. Without an override, the release's German
and English generated files are byte-identical to DE3.29. Removing languages in
a custom build can still change saved enum IDs; this option is for builders,
not an on-device language migration. Regenerate fonts as well when adding
translations, and perform the normal target build/size checks.

The upstream settings changes add only a Lite version suffix. This full build
does not adopt those changes or remove Player/Game. The existing bounded string
formatting, settings return behavior and version presentation are retained.

Run `python tests/de3/test_upstream_startup_i18n.py --report <new-report.json>`.
On Linux, `PIXL_SANITIZE=1` also enables ASan/UBSan for the C harness. Ten tests
cover generator outputs/invalid inputs and the startup order. The allocator
case compiles actual MUI, TLSF and runtime diagnostics with only critical-section
macros mocked. It checks data, live block accounting, repeated initialization,
reallocation, freeing, and explicit teardown/restart. The former DE3.29 init and
an incorrectly retained counter reset are separately compiled negative controls;
both must fail a runtime assertion, not compilation. All generated files and
native binaries are disposable test outputs. There is no device or flash access.

Host tests do not establish nRF startup timing, power-loss behavior, filesystem
migration safety or real-world radio operation. Those are separate checks.
