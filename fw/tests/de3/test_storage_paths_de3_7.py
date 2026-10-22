"""Actual-source storage regressions; host-only, no device operations.

PIXL_STORAGE_SOURCE_ROOT selects fw/ for preserved-source negative controls.
PIXL_STORAGE_SANITIZE=1 enables ASan/UBSan. PIXL_STORAGE_REPORT saves evidence.
PIXL_STORAGE_NEGATIVE_CONTROL=1 skips known overflowing baseline case on native
Windows; the same case is exercised under ASan on the preserved baseline.
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
FW = Path(os.environ.get('PIXL_STORAGE_SOURCE_ROOT', HERE.parents[1])).resolve()
SRC = FW / 'application/src'
SANITIZE = os.environ.get('PIXL_STORAGE_SANITIZE') == '1'


def extract(source, signature):
    start = source.index(signature)
    opening = source.index('{', start)
    depth = 1
    for i in range(opening + 1, len(source)):
        depth += (source[i] == '{') - (source[i] == '}')
        if not depth:
            return source[start:i + 1]
    raise ValueError(signature)


def hashes(paths):
    return {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}


class StoragePathTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='pixl-storage-paths-')
        cls.addClassCleanup(cls.temp.cleanup)
        build = Path(cls.temp.name)
        (build / 'boards.h').write_text('')
        (build / 'nrf_log.h').write_text('#define NRF_LOG_INFO(...) ((void)0)\n')
        spiffs = FW / 'components/spiffs/src'
        driver = SRC / 'mod/vfs/vfs_driver_spiffs.c'
        cls.inputs = sorted(set([driver, SRC / 'mod/cwalk2.c', SRC / 'mod/cwalk2.h',
                                 SRC / 'mod/vfs/vfs.h', SRC / 'mod/vfs/spiffs_config.h',
                                 FW / 'components/cwalk/src/cwalk.c',
                                 FW / 'components/cwalk/include/cwalk.h'] +
                                list(spiffs.glob('*.c')) + list(spiffs.glob('*.h'))))
        cls.test_inputs = [Path(__file__).resolve(), HERE / 'storage_folder_marker.c.in',
                           HERE / 'storage_metadata.c.in', HERE / 'storage_last_lookup.c']
        cls.report = {'device_access': False, 'sanitize': SANITIZE, 'source_root': str(FW),
                      'source_sha256': hashes(cls.inputs), 'test_sha256': hashes(cls.test_inputs),
                      'compiles': [], 'cases': [], 'skipped': [],
                      'limits': ['VFS functions are extracted unchanged; real cwalk/cwalk2 and complete SPIFFS are compiled.',
                                 'VFS directory/metadata operations use valid exact-name host stubs.',
                                 'Lookup test uses synthetic 2 MiB NOR with 4096-byte blocks and 256-byte pages.',
                                 'No physical flash, BLE, NFC, UI, timing or interrupt concurrency is validated.',
                                 'No AmiiboLink tests and no production source writes.']}
        source = driver.read_text()
        structure = source[source.index('typedef struct {'):
                           source.index('} vfs_spiffs_dir_t;') + len('} vfs_spiffs_dir_t;')]
        definitions = {
            'marker': ('storage_folder_marker.c.in', [
                'static s32_t vfs_spiffs_map_error_code(', 'int32_t vfs_spiffs_open_dir(',
                'int32_t vfs_spiffs_read_dir(', 'int32_t vfs_spiffs_close_dir(']),
            'metadata': ('storage_metadata.c.in', [
                'static s32_t vfs_spiffs_map_error_code(', 'static int32_t vfs_check_file_path(',
                'int32_t vfs_spiffs_stat_file(', 'int32_t vfs_spiffs_update_file_meta('])}
        cls.executables = {}
        for name in ['marker', 'metadata', 'lookup']:
            if name == 'lookup':
                cfile = HERE / 'storage_last_lookup.c'
                dependencies = sorted(spiffs.glob('*.c'))
            else:
                fixture, signatures = definitions[name]
                body = '\n'.join(extract(source, signature) for signature in signatures)
                code = (HERE / fixture).read_text().replace('@@STRUCTURE@@', structure)
                code = code.replace('@@FUNCTIONS@@', body)
                cfile = build / (name + '.c')
                cfile.write_text(code)
                dependencies = [FW / 'components/cwalk/src/cwalk.c']
                if name == 'marker':
                    dependencies.append(SRC / 'mod/cwalk2.c')
            compiler = shutil.which('gcc')
            if not compiler:
                raise RuntimeError('GCC required')
            command = [compiler, '-std=c11', '-O1', '-g', '-include', 'stdint.h']
            for folder in [build, SRC / 'mod/vfs', SRC / 'mod', spiffs,
                           FW / 'components/cwalk/include']:
                command += ['-I', str(folder)]
            if SANITIZE:
                command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                            '-fno-omit-frame-pointer', '-no-pie']
            exe = build / (name + ('.exe' if os.name == 'nt' else ''))
            command += [str(cfile)] + list(map(str, dependencies)) + ['-o', str(exe)]
            run = subprocess.run(command, capture_output=True, text=True, timeout=90)
            cls.report['compiles'].append({'name': name, 'command': command, 'exit_code': run.returncode,
                                          'stdout': run.stdout, 'stderr': run.stderr})
            if run.returncode:
                cls.save_report()
                raise RuntimeError(run.stdout + run.stderr)
            cls.executables[name] = exe

    @classmethod
    def save_report(cls):
        cls.report['sources_unchanged'] = hashes(cls.inputs) == cls.report['source_sha256']
        cls.report['tests_unchanged'] = hashes(cls.test_inputs) == cls.report['test_sha256']
        cls.report['passed'] = bool(cls.report['cases']) and all(
            c['passed'] for c in cls.report['cases']) and all(
            c['exit_code'] == 0 for c in cls.report['compiles']) and \
            cls.report['sources_unchanged'] and cls.report['tests_unchanged']
        if os.environ.get('PIXL_STORAGE_REPORT'):
            Path(os.environ['PIXL_STORAGE_REPORT']).write_text(json.dumps(cls.report, indent=2) + '\n')

    @classmethod
    def tearDownClass(cls):
        cls.save_report()

    def check_case(self, name, *args):
        command = [str(self.executables[name])] + list(args)
        run = subprocess.run(command, capture_output=True, text=True, timeout=20)
        passed = run.returncode == 0 and 'PASS' in run.stdout and \
            'runtime error:' not in run.stderr and 'ERROR: AddressSanitizer' not in run.stderr
        self.report['cases'].append({'name': name, 'arguments': args, 'command': command,
                                     'exit_code': run.returncode, 'stdout': run.stdout,
                                     'stderr': run.stderr, 'passed': passed})
        self.assertTrue(passed, run.stdout + run.stderr)

    def test_exact_marker(self):
        cases = [(scenario, name) for scenario in ['direct_prefix', 'nested_prefix']
                 for name in ['.f', '.fo', '.fol', '.fold', '.folde']]
        cases += [('controls', '-'), ('real_marker', '-')]
        for directory in ['/amiibo', '/amiibo/']:
            for scenario, name in cases:
                with self.subTest(directory=directory, scenario=scenario, name=name):
                    self.check_case('marker', scenario, name, directory)

    def test_metadata_path_boundaries(self):
        for scenario in ['short', 'short_trailing', 'max_plain', 'max_trailing',
                         'too_long_plain', 'too_long_trailing', 'file_max_path',
                         'path_limit', 'name_limit', 'name_max']:
            if scenario == 'max_trailing' and not SANITIZE and \
                    os.environ.get('PIXL_STORAGE_NEGATIVE_CONTROL') == '1':
                self.report['skipped'].append('Baseline max_trailing UB is run only under ASan')
                continue
            with self.subTest(scenario=scenario):
                self.check_case('metadata', scenario)

    def test_lookup_end_preserves_read_error(self):
        for scenario in ['normal_end', 'previous_block', 'last_block']:
            with self.subTest(scenario=scenario):
                self.check_case('lookup', scenario)


if __name__ == '__main__':
    unittest.main()
