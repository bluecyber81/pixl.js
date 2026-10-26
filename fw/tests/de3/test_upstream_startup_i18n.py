"""Upstream 2.22 startup allocator and isolated language-generator regression tests.

Only temporary files are generated. Actual TLSF/MUI/runtime diagnostics run with
critical-section mocks on the host ABI, not on an nRF board.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

FW = Path(__file__).resolve().parents[2]
SRC = FW / 'application/src'
GENERATED = ('string_id.h', 'language_list.h', 'de_DE.c', 'en_US.c')
BOUND = (
    'application/src/main.c', 'application/src/mui/mui_mem.c',
    'application/src/mui/mui_mem.h', 'application/src/mui/mui_conf.h',
    'application/src/mod/runtime_diag.c', 'application/src/mod/runtime_diag.h',
    'components/tlsf/tlsf.c', 'components/tlsf/tlsf.h', 'scripts/i18n_gen.py',
    'data/i18n.csv', 'data/i18n_languages.txt',
) + tuple('application/src/i18n/' + name for name in GENERATED)
DETAILS = []


def hashes():
    return {name: hashlib.sha256((FW / name).read_bytes()).hexdigest() for name in BOUND}


class StartupAndLanguageTests(unittest.TestCase):
    def generator(self, override=None, config=None, remove_config=False, remove_english=False):
        """Run the real script in a disposable firmware tree, never in the candidate."""
        with tempfile.TemporaryDirectory(prefix='pixl-i18n-') as temporary:
            folder = Path(temporary)
            (folder / 'scripts').mkdir()
            (folder / 'data').mkdir()
            output = folder / 'application/src/i18n'
            output.mkdir(parents=True)
            shutil.copyfile(FW / 'scripts/i18n_gen.py', folder / 'scripts/i18n_gen.py')
            shutil.copyfile(FW / 'data/i18n.csv', folder / 'data/i18n.csv')
            if remove_english:
                # Remove the complete column, not a malformed CSV record.
                import csv
                rows = list(csv.reader((folder / 'data/i18n.csv').read_text(encoding='utf-8').splitlines()))
                column = rows[0].index('en_US')
                with (folder / 'data/i18n.csv').open('w', encoding='utf-8', newline='') as handle:
                    csv.writer(handle).writerows(row[:column] + row[column + 1:] for row in rows)
            if not remove_config:
                (folder / 'data/i18n_languages.txt').write_bytes(
                    config.encode('utf-8') if config is not None else (FW / 'data/i18n_languages.txt').read_bytes())
            # Failure must precede any output mutation; stale cleanup must spare language.c.
            for name in ('language.c', 'ja_JP.c', 'string_id.h'):
                (output / name).write_text('SENTINEL', encoding='utf-8')
            env = os.environ.copy()
            env.pop('I18N_LANGS', None)
            if override is not None:
                env['I18N_LANGS'] = override
            run = subprocess.run([sys.executable, str(folder / 'scripts/i18n_gen.py')],
                                 env=env, capture_output=True, text=True, timeout=30)
            files = {p.name: p.read_bytes() for p in output.iterdir()}
            self.assertEqual(files['language.c'], b'SENTINEL')
            return run, files

    def test_default_generated_bytes_and_stale_cleanup_unchanged(self):
        run, files = self.generator()
        self.assertEqual(run.returncode, 0, run.stderr)
        for name in GENERATED:
            self.assertEqual(files[name], (SRC / 'i18n' / name).read_bytes(), name)
        self.assertNotIn('ja_JP.c', files)

    def test_equivalent_override_preserves_saved_de_en_order_and_descriptions(self):
        run, files = self.generator(' en_US , de_DE ')
        self.assertEqual(run.returncode, 0, run.stderr)
        for name in GENERATED:
            self.assertEqual(files[name], (SRC / 'i18n' / name).read_bytes(), name)

    def test_english_fallback_automatically_added(self):
        run, files = self.generator('de_DE')
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertEqual(files['language_list.h'], (SRC / 'i18n/language_list.h').read_bytes())
        self.assertIn('en_US.c', files)

    def test_new_language_keeps_known_ids_and_has_macro(self):
        run, files = self.generator('ja_JP,de_DE,en_US')
        self.assertEqual(run.returncode, 0, run.stderr)
        header = files['language_list.h'].decode()
        self.assertLess(header.index('X(DE_DE,'), header.index('X(EN_US,'))
        self.assertLess(header.index('X(EN_US,'), header.index('X(JA_JP,'))
        self.assertIn('#define LANGUAGE_HAS_JA_JP 1', header)
        self.assertIn('ja_JP.c', files)

    def test_override_without_config_follows_csv_order_and_includes_fallback(self):
        run, files = self.generator('ja_JP', remove_config=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        header = files['language_list.h'].decode()
        self.assertLess(header.index('X(EN_US,'), header.index('X(JA_JP,'))
        self.assertNotIn('de_DE.c', files)

    def test_invalid_overrides_fail_before_writing(self):
        for override, error in (('', 'no languages'), (' , ', 'no languages'),
                                ('de_DE,de_DE', 'duplicate'), ('not_a_locale', 'unknown')):
            with self.subTest(override=override):
                run, files = self.generator(override)
                self.assertNotEqual(run.returncode, 0)
                self.assertIn(error, run.stderr)
                self.assertEqual(files['string_id.h'], b'SENTINEL')
                self.assertEqual(files['ja_JP.c'], b'SENTINEL')

    def test_invalid_configuration_fails_before_writing(self):
        for config, error in (('de_DE,Deutsch\nde_DE,Deutsch\nen_US,English\n', 'duplicate'),
                              ('de_DE,Deutsch\n', 'en_US'), ('', 'no languages'),
                              ('unknown,Name\nen_US,English\n', 'unknown')):
            with self.subTest(config=config):
                run, files = self.generator(config=config)
                self.assertNotEqual(run.returncode, 0)
                self.assertIn(error, run.stderr)
                self.assertEqual(files['string_id.h'], b'SENTINEL')

    def test_missing_english_csv_fails_even_without_configuration(self):
        run, files = self.generator('de_DE', remove_config=True, remove_english=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn('fallback language is missing', run.stderr)
        self.assertEqual(files['string_id.h'], b'SENTINEL')

    def test_main_initializes_pool_before_settings_and_ui(self):
        main = (SRC / 'main.c').read_text(encoding='utf-8')
        main = main[main.index('int main('):]
        self.assertEqual(main.count('mui_mem_init();'), 1)
        self.assertLess(main.index('mui_mem_init();'), main.index('settings_init();'))
        self.assertLess(main.index('settings_init();'), main.index('mui_init(p_mui);'))

    def test_real_tlsf_pool_survives_second_init_and_explicit_lifecycle(self):
        original = (SRC / 'mui/mui_mem.c').read_text(encoding='utf-8')
        start = original.index('void mui_mem_init() {')
        end = original.index('\nvoid mui_mem_deinit()', start)
        legacy = original[:start] + '''void mui_mem_init() {
    runtime_diag_heap_reset();
    m_tlsf = tlsf_create_with_pool(m_mem, sizeof(m_mem));
}''' + original[end:]
        reset_only = original.replace('    if (m_tlsf == NULL) {\n        runtime_diag_heap_reset();',
                                      '    runtime_diag_heap_reset();\n    if (m_tlsf == NULL) {', 1)
        self.assertNotEqual(reset_only, original)
        with tempfile.TemporaryDirectory(prefix='pixl-startup-') as temporary:
            folder = Path(temporary)
            (folder / 'app_util_platform.h').write_text(
                '#define CRITICAL_REGION_ENTER() do {} while (0)\n'
                '#define CRITICAL_REGION_EXIT() do {} while (0)\n')
            for name, source, expected in (('candidate', original, 0), ('DE329_initializer', legacy, 71),
                                           ('counter_reset_regression', reset_only, 71)):
                # Rewrite only the include location in the disposable copy.
                source = source.replace('#include "../mod/runtime_diag.h"',
                                        '#include "' + (SRC / 'mod/runtime_diag.h').as_posix() + '"')
                module = folder / (name + '_module.c')
                module.write_text(source, encoding='utf-8')
                harness = r'''
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr, "CHECK %s:%d %s\n", __FILE__, __LINE__, #x); return 71; } } while (0)
'''
                harness += '#include "' + (SRC / 'mod/runtime_diag.c').as_posix() + '"\n'
                harness += '#include "' + module.as_posix() + '"\n'
                harness += r'''
int main(void) {
    mui_mem_init();
    mui_mem_monitor_t empty, before, after;
    mui_mem_monitor(&empty);
    unsigned char *p = mui_mem_malloc(192);
    CHECK(p != NULL);
    memset(p, 0xA7, 192);
    size_t allocated = state.allocated;
    CHECK(allocated >= 192);
    mui_mem_monitor(&before);
    for (unsigned i = 0; i < 3; ++i) mui_mem_init();
    CHECK(state.allocated == allocated);
    mui_mem_monitor(&after);
    CHECK(after.used_cnt == before.used_cnt && after.free_size == before.free_size);
    unsigned char *q = mui_mem_malloc(96);
    CHECK(q != NULL && (q + 96 <= p || p + 192 <= q));
    memset(q, 0x39, 96);
    for (unsigned i = 0; i < 192; ++i) CHECK(p[i] == 0xA7);
    p = mui_mem_realloc(p, 384);
    CHECK(p != NULL);
    for (unsigned i = 0; i < 192; ++i) CHECK(p[i] == 0xA7);
    mui_mem_free(q);
    mui_mem_free(p);
    CHECK(state.allocated == 0);
    mui_mem_monitor(&after);
    CHECK(after.free_size == empty.free_size && after.used_cnt == 0);
    mui_mem_deinit();
    CHECK(m_tlsf == NULL && state.allocated == 0);
    mui_mem_init();
    p = mui_mem_malloc(192);
    CHECK(p != NULL && state.allocated >= 192);
    mui_mem_free(p);
    mui_mem_deinit();
    puts("PASS real TLSF: early allocations/data/accounting survive reinit; explicit teardown/restart works");
    return 0;
}
'''
                cfile = folder / (name + '.c')
                cfile.write_text(harness, encoding='utf-8')
                binary = folder / (name + '.exe')
                command = [shutil.which('gcc'), '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                           '-Wno-unused-function', '-Wno-unused-parameter', '-DPIXL_RUNTIME_DIAGNOSTICS=1']
                if os.environ.get('PIXL_SANITIZE') == '1':
                    command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                                '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
                for include in (folder, SRC / 'mui', FW / 'components/tlsf'):
                    command += ['-I', str(include)]
                built = subprocess.run(command + [str(cfile), str(FW / 'components/tlsf/tlsf.c'), '-o', str(binary)],
                                       capture_output=True, text=True, timeout=60)
                self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
                run = subprocess.run([str(binary)], capture_output=True, text=True, timeout=20)
                DETAILS.append({'name': name, 'exit_code': run.returncode, 'output': run.stdout + run.stderr})
                self.assertEqual(run.returncode, expected, run.stdout + run.stderr)
                self.assertIn('PASS' if expected == 0 else 'CHECK', run.stdout + run.stderr)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    before = hashes()
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(StartupAndLanguageTests))
    after = hashes()
    report = {'passed': result.wasSuccessful() and before == after, 'tests_run': result.testsRun,
              'failures': [str(x[0]) for x in result.failures], 'errors': [str(x[0]) for x in result.errors],
              'source_sha256': before, 'source_sha256_after': after,
              'test_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'sanitizers': os.environ.get('PIXL_SANITIZE') == '1', 'allocator_controls': DETAILS,
              'device_access': False,
              'limits': ['Actual allocator on host ABI; critical sections mocked, no nRF startup timing proof.',
                         'Generator writes temporary trees only; no NFC/BLE/device or migration actions.',
                         'Release DE/EN order unchanged; removing a locale in a custom build can change saved IDs.']}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    raise SystemExit(0 if report['passed'] else 1)
