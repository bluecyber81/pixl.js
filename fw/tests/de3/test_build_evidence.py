"""Actual helper regressions, temporary files only; no compiler/container/device."""
from pathlib import Path
import ast
import copy
import hashlib
import importlib.util
import tempfile
import unittest

HELPER = Path(__file__).resolve().parents[2] / 'scripts/build_evidence.py'
RUNNER = Path(__file__).resolve().with_name('run_all.py')
SPEC = importlib.util.spec_from_file_location('build_evidence', HELPER)
evidence = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evidence)


class BuildEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.fw = Path(self.temp.name)
        self.run_id = 'test_run_0001'
        for name, data in {
            'application/src/main.c': b'int main(void){return 0;}\n',
            'application/Makefile': b'all:\n', 'Makefile': b'all:\n',
            'scripts/build_evidence.py': HELPER.read_bytes(),
            'scripts/amiibo_db_gen.py': b'# generator input bound to test evidence\n',
            'scripts/bdfconv_linux': b'font compiler fixture\0',
            'scripts/fw_update.bat': b'@echo off\nexit /b 1\n',
            'scripts/build.cmd': b'@echo off\n',
            'scripts/build.sh': b'#!/bin/sh\n',
            'scripts/check.ps1': b'# fixture\n',
            'tests/de2/test_one.py': b'pass\n', 'tests/de3/test_two.py': b'pass\n',
            'tests/de3/fixture/header.h': b'#define TEST_VALUE 1\n',
            'tests/de3/fixture/pins.json': b'{"pin":"baseline"}\n',
            'tests/de3/fixture/source.patch': b'--- before\n+++ after\n',
            'tests/de3/fixture/model.c.in': b'int main(void){return 0;}\n',
            'tests/de3/fixture/sdk.c.inc': b'/* pinned SDK excerpt */\n',
            'components/spiffs/src/spiffs_hydrogen.c': b'/* actual filesystem source */\n',
            'components/spiffs/src/spiffs.h': b'/* actual filesystem API */\n',
            'components/chameleon-ultra/firmware/application/src/rfid/tag.c': b'/* emulation input */\n',
            'components/chameleon-ultra/firmware/application/src/rfid/tag.h': b'/* emulation API */\n',
            'application/config/sdk_config.h': b'#define NRF_SDH_BLE_GATT_MAX_MTU_SIZE 250\n',
            'data/i18n.csv': b'id,en,de\n', 'ld/application.ld': b'/* linker */\n',
        }.items():
            path = self.fw / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        evidence.start(self.fw, self.run_id)
        evidence.begin(self.fw, self.run_id)
        self.products()
        self.manifest = evidence.finish(self.fw, self.run_id)

    def products(self):
        for name in evidence.ARTIFACTS:
            (self.fw / '_build' / name).write_bytes(('fresh fixture ' + name).encode())

    def host(self):
        return {'passed': True, 'sources_unchanged_during_tests': True,
                'source_snapshot': evidence.host_source_snapshot(self.fw),
                'scripts': [{'script': 'de2/test_one.py', 'exit_code': 0},
                            {'script': 'de3/test_two.py', 'exit_code': 0}]}

    def verify(self):
        evidence.verify_manifest(self.fw, self.manifest, self.run_id)

    def test_current_build_and_tests_pass(self):
        self.verify()
        evidence.verify_host_tests(self.fw, self.host(), self.manifest)

    def test_changed_source_rejected(self):
        (self.fw / 'application/src/main.c').write_text('different')
        with self.assertRaisesRegex(ValueError, 'Current sources'): self.verify()

    def test_added_source_rejected(self):
        (self.fw / 'application/src/new.c').write_text('new')
        with self.assertRaisesRegex(ValueError, 'Current sources'): self.verify()

    def test_deleted_source_rejected(self):
        (self.fw / 'ld/application.ld').unlink()
        with self.assertRaisesRegex(ValueError, 'Current sources'): self.verify()

    def test_same_length_artifact_mutation_rejected(self):
        path = self.fw / '_build/pixljs.bin'
        data = path.read_bytes()
        path.write_bytes(bytes([data[0] ^ 1]) + data[1:])
        with self.assertRaisesRegex(ValueError, 'Artifact'): self.verify()

    def test_missing_artifact_rejected(self):
        (self.fw / '_build/pixljs.map').unlink()
        with self.assertRaisesRegex(ValueError, 'Artifact'): self.verify()

    def test_wrong_run_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Stale/failed'):
            evidence.verify_manifest(self.fw, self.manifest, 'another_0002')

    def test_new_run_retires_success_and_products(self):
        evidence.start(self.fw, 'another_0002')
        self.assertFalse((self.fw / '_build/de3_build_manifest.json').exists())
        self.assertTrue((self.fw / '_build/de3_previous/another_0002/pixljs.bin').exists())
        evidence.begin(self.fw, 'another_0002')
        with self.assertRaisesRegex(ValueError, 'Missing fresh artifact'):
            evidence.finish(self.fw, 'another_0002')

    def test_previous_application_objects_archived_not_reused(self):
        old = self.fw / '_build/pixljs/main.c.o'
        old.parent.mkdir()
        old.write_bytes(b'old compiler object')
        evidence.start(self.fw, 'another_0002')
        archived = self.fw / '_build/de3_previous/another_0002/pixljs/main.c.o'
        self.assertEqual(archived.read_bytes(), b'old compiler object')
        self.assertFalse(old.parent.exists())
        evidence.begin(self.fw, 'another_0002')
        self.products()
        manifest = evidence.finish(self.fw, 'another_0002')
        self.assertTrue(manifest['application_objects_retired'])
        evidence.verify_manifest(self.fw, manifest, 'another_0002')

    def test_reintroduced_old_objects_before_compile_rejected(self):
        evidence.start(self.fw, 'another_0002')
        (self.fw / '_build/pixljs').mkdir()
        with self.assertRaisesRegex(ValueError, 'objects were not retired'):
            evidence.begin(self.fw, 'another_0002')

    def test_change_during_build_never_publishes_success(self):
        evidence.start(self.fw, 'another_0002')
        evidence.begin(self.fw, 'another_0002')
        self.products()
        (self.fw / 'application/src/main.c').write_text('changed mid build')
        with self.assertRaisesRegex(ValueError, 'Sources changed'):
            evidence.finish(self.fw, 'another_0002')
        self.assertFalse((self.fw / '_build/de3_build_manifest.json').exists())

    def test_missing_duplicate_failed_test_rejected(self):
        for mode in ('missing', 'duplicate', 'failed'):
            host = self.host()
            if mode == 'missing': host['scripts'].pop()
            if mode == 'duplicate': host['scripts'][1] = copy.deepcopy(host['scripts'][0])
            if mode == 'failed': host['scripts'][0]['exit_code'] = 1
            with self.subTest(mode=mode), self.assertRaisesRegex(ValueError, 'test script'):
                evidence.verify_host_tests(self.fw, host, self.manifest)

    def test_new_test_not_run_rejected(self):
        host = self.host()
        (self.fw / 'tests/de3/test_new.py').write_text('pass')
        with self.assertRaisesRegex(ValueError, 'test script'):
            evidence.verify_host_tests(self.fw, host, self.manifest)

    def test_tested_helper_change_rejected(self):
        host = self.host()
        (self.fw / 'scripts/build_evidence.py').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'tested set'):
            evidence.verify_host_tests(self.fw, host, self.manifest)

    def test_tested_generator_change_rejected(self):
        host = self.host()
        (self.fw / 'scripts/amiibo_db_gen.py').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'tested set'):
            evidence.verify_host_tests(self.fw, host, self.manifest)

    def test_sdk_and_filesystem_sources_bound_to_host_evidence(self):
        host = self.host()
        for key in ('application/config/sdk_config.h',
                    'components/spiffs/src/spiffs_hydrogen.c',
                    'components/spiffs/src/spiffs.h',
                    'components/chameleon-ultra/firmware/application/src/rfid/tag.c',
                    'components/chameleon-ultra/firmware/application/src/rfid/tag.h'):
            self.assertIn(key, host['source_snapshot'])
            path = self.fw / key
            before = path.read_bytes()
            try:
                path.write_bytes(before + b'changed')
                with self.subTest(path=key), self.assertRaisesRegex(ValueError, 'tested set'):
                    evidence.verify_host_tests(self.fw, host, self.manifest)
                with self.subTest(path=key), self.assertRaisesRegex(ValueError, 'differ from ARM build'):
                    evidence.verify_host_tests(self.fw, self.host(), self.manifest)
            finally:
                path.write_bytes(before)

    def test_maintenance_scripts_bound_to_build_and_host_evidence(self):
        host = self.host()
        for key in ('scripts/fw_update.bat', 'scripts/build.cmd',
                    'scripts/build.sh', 'scripts/check.ps1'):
            self.assertIn(key, host['source_snapshot'])
            self.assertEqual(host['source_snapshot'][key], self.manifest['source_snapshot'][key])
            path = self.fw / key
            before = path.read_bytes()
            try:
                path.write_bytes(before + b'changed')
                with self.subTest(path=key), self.assertRaisesRegex(ValueError, 'tested set'):
                    evidence.verify_host_tests(self.fw, host, self.manifest)
                with self.subTest(path=key), self.assertRaisesRegex(ValueError, 'Current sources'):
                    self.verify()
            finally:
                path.write_bytes(before)

    def test_headers_json_and_patch_bound_before_and_after_tests(self):
        host = self.host()
        for name in ('header.h', 'pins.json', 'source.patch', 'model.c.in', 'sdk.c.inc'):
            key = 'tests/de3/fixture/' + name
            self.assertIn(key, host['source_snapshot'])
            self.assertEqual(host['source_snapshot'][key], self.manifest['source_snapshot'][key])
            path = self.fw / key
            original = path.read_bytes()
            try:
                path.write_bytes(original + b'changed')
                with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'tested set'):
                    evidence.verify_host_tests(self.fw, host, self.manifest)
                with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Current sources'):
                    self.verify()
                with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'differ from ARM build'):
                    evidence.verify_host_tests(self.fw, self.host(), self.manifest)
            finally:
                path.write_bytes(original)

    def test_runner_and_validator_snapshots_match(self):
        # Execute only the actual runner snapshot function, never its CLI/test loop.
        tree = ast.parse(RUNNER.read_text(encoding='utf-8'))
        functions = [node for node in tree.body
                     if isinstance(node, ast.FunctionDef) and node.name == 'snapshot']
        self.assertEqual(len(functions), 1)
        isolated = ast.fix_missing_locations(ast.Module(body=functions, type_ignores=[]))
        namespace = {'FW': self.fw, 'hashlib': hashlib}
        exec(compile(isolated, str(RUNNER), 'exec'), namespace)
        self.assertEqual(namespace['snapshot'](), evidence.host_source_snapshot(self.fw))

    def test_new_tested_source_different_from_build_rejected(self):
        (self.fw / 'application/src/main.c').write_text('new source tested')
        with self.assertRaisesRegex(ValueError, 'differ from ARM build'):
            evidence.verify_host_tests(self.fw, self.host(), self.manifest)

    def test_wrong_version_or_counter_rejected(self):
        self.assertEqual(evidence.VERSION, '2.22.0-DE3.61')
        self.assertEqual(evidence.COUNTER, 633)
        for field, value in [('version', '2.22.0-DE3.60'), ('counter', 632), ('version', '2.22.0-DE3.59'), ('counter', 631), ('version', '2.22.0-DE3.57'), ('counter', 629), ('version', '2.22.0-DE3.48'), ('counter', 620), ('version', '2.22.0-DE3.39'), ('counter', 611), ('version', '2.22.0-DE3.38'), ('counter', 610),
                             ('version', '2.21.0-DE3'), ('version', '2.21.0-DE3.2'),
                             ('version', '2.21.0-DE3.3'), ('version', '2.21.0-DE3.4'), ('version', '2.21.0-DE3.5'), ('version', '2.21.0-DE3.6'), ('version', '2.21.0-DE3.17'), ('version', '2.21.0-DE3.190'), ('version', '2.21.0-DE3.20'), ('version', '2.21.0-DE3.21'), ('version', '2.21.0-DE3.23'), ('counter', 577), ('counter', 579), ('counter', 580), ('counter', 581), ('counter', 582), ('counter', 583), ('counter', 585), ('counter', 586), ('counter', 587), ('counter', 589), ('version', '2.21.0-DE3.25'), ('counter', 590), ('counter', 591), ('version', '2.21.0-DE3.26'), ('version', '2.21.0-DE3.27'), ('version', '2.21.0-DE3.28'), ('version', '2.21.0-DE3.30'), ('counter', 596), ('counter', 599), ('counter', 592), ('counter', 593), ('counter', 594), ('counter', 595), ('counter', 597), ('counter', 604), ('version', '2.22.0-DE3.32')]:
            manifest = dict(self.manifest, **{field: value})
            with self.subTest(field=field, value=value), self.assertRaisesRegex(ValueError, 'configuration'):
                evidence.verify_manifest(self.fw, manifest, self.run_id)

    def test_executed_font_compiler_is_bound(self):
        self.assertIn('scripts/bdfconv_linux', self.manifest['source_snapshot'])
        (self.fw/'scripts/bdfconv_linux').write_bytes(b'changed font compiler\0')
        with self.assertRaisesRegex(ValueError, 'Current sources'):
            self.verify()

    def test_exact_terminated_version_not_prefix(self):
        expected = '2.22.0-DE3.61'
        current = expected.encode('ascii')
        header = f'#define VERSION "{expected}"\n'
        evidence.verify_version_marker(b'prefix ' + current + b'\0 trailer', header)
        malformed = [b'2.21.0-DE3\0', current, current + b'0\0']
        other_versions = [b'2.21.0-DE3'] + [f'2.21.0-DE3.{number}'.encode('ascii')
                                          for number in range(1, 30)]
        other_versions += [b'2.22.0-DE3.60', b'2.22.0-DE3.59', b'2.22.0-DE3.57', b'2.22.0-DE3.58-CF1', b'2.22.0-DE3.29', b'2.22.0-DE3.33', b'2.22.0-DE3.34', b'2.22.0-DE3.35', b'2.22.0-DE3.36', b'2.22.0-DE3.39', b'2.22.0-DE3.38-PREP', b'2.21.0-DE3.30', b'2.21.0-DE3.290', b'2.21.0-DE3.291']
        malformed += [current + b'\0 ' + other + b'\0' for other in other_versions]
        malformed += [current + b'\0 2.22.0-DE3.48\0', current + b'\0 2.22.0-DE3.43\0', current + b'\0 2.22.0-DE3.57-PREP\0']
        for payload in malformed:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                evidence.verify_version_marker(payload, header)
        for bad_header in ('#define VERSION "2.21.0-DE3"\n',
                           f'#define VERSION "{expected}0"\n', header + header):
            with self.subTest(header=bad_header), self.assertRaises(ValueError):
                evidence.verify_version_marker(current + b'\0', bad_header)

    def test_wrong_board_or_rebuild_flag_rejected(self):
        for field, value in [('board', 'OLED'), ('force_application_rebuild', False)]:
            manifest = dict(self.manifest, **{field: value})
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'configuration'):
                evidence.verify_manifest(self.fw, manifest, self.run_id)


if __name__ == '__main__':
    unittest.main(verbosity=2)
