"""Full actual DF/VFS translation unit: storage identity and opaque metadata commands.

No storage, BLE or device access. Native filesystem functions and outbound frame
submission are deterministic mocks; transport fragmentation is covered elsewhere.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]
SRC = FW / 'application/src'
PRODUCTION = ('mod/df/df_proto_vfs.c', 'mod/df/df_proto_vfs.h', 'mod/df/df_defines.h',
              'mod/df/df_buffer.h', 'mod/df/df_core.h', 'mod/vfs/vfs.h', 'mod/runtime_diag.h')


def source_hashes():
    return {name: hashlib.sha256((SRC / name).read_bytes()).hexdigest() for name in PRODUCTION}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--negative-controls', action='store_true')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    report = {'device_access': False, 'sanitizers': args.sanitize, 'cases': [], 'negative_controls': [],
              'source_sha256': source_hashes(), 'test_sha256': {
                  name: hashlib.sha256((HERE / name).read_bytes()).hexdigest()
                  for name in ('test_storage_metadata_protocol.py', 'storage_metadata_protocol.c.in')},
              'limits': ['Actual complete DF/VFS handler translation unit on host ABI.',
                         'VFS operations and reply sink mocked; no filesystem migration, power loss, or real BLE.',
                         'Logical frames tested; end-to-end MTU fragmentation uses the existing independent suites.']}
    with tempfile.TemporaryDirectory(prefix='pixl-meta-proto-') as temporary:
        folder = Path(temporary)
        (folder / 'boards.h').write_text('')
        (folder / 'nrf_log.h').write_text('#define NRF_LOG_INFO(...) ((void)0)\n')
        template = (HERE / 'storage_metadata_protocol.c.in').read_text(encoding='utf-8')
        original = (SRC / 'mod/df/df_proto_vfs.c').read_text(encoding='utf-8')

        def build(name, backend, mutation=None):
            source = original
            if mutation:
                old, new = mutation
                assert source.count(old) == 1, (name, source.count(old))
                source = source.replace(old, new, 1)
            source = source.replace('#include "../runtime_diag.h"',
                                    '#include "' + (SRC / 'mod/runtime_diag.h').as_posix() + '"')
            module = folder / (name + '_module.c')
            module.write_text(source, encoding='utf-8')
            harness = template.replace('@PROTOCOL@', '#include "' + module.as_posix() + '"')
            cfile = folder / (name + '.c')
            cfile.write_text(harness, encoding='utf-8')
            binary = folder / (name + '.exe')
            command = ['gcc', '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                       '-Wno-unused-parameter', '-Wno-unused-function', '-Wno-sign-compare',
                       '-DPIXL_RUNTIME_DIAGNOSTICS=1']
            if backend:
                command += ['-D' + backend + '=1']
            for include in (folder, SRC / 'mod/df', SRC / 'mod/vfs'):
                command += ['-I', str(include)]
            if args.sanitize:
                command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                            '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
            built = subprocess.run(command + [str(cfile), '-o', str(binary)], capture_output=True, text=True, timeout=60)
            assert built.returncode == 0, built.stdout + built.stderr
            return binary

        for backend in ('VFS_SPIFFS_ENABLE', 'VFS_LFS_ENABLE', None):
            binary = build(backend or 'no_backend', backend)
            for scenario in range(18 if backend else 3):
                run = subprocess.run([str(binary), str(scenario)], capture_output=True, text=True, timeout=20)
                row = {'backend': backend, 'scenario': scenario, 'exit_code': run.returncode,
                       'output': run.stdout + run.stderr}
                report['cases'].append(row)
                assert run.returncode == 0, row
        if args.negative_controls:
            controls = (
                ('accept_trailing_bytes', ('buff_get_remain_size(&buff) != (write ? VFS_MAX_META_LEN : 0)', 'false'), 7),
                ('accept_traversal', ('!raw_meta_path_valid(path, write)', 'false'), 8),
                ('ignore_owned_transfer', ('evt->df->chunk != 0 || !df_proto_vfs_is_idle()', 'evt->df->chunk != 0'), 10),
                ('truncate_opaque_metadata', ('if (!write) memcpy(out.data, object.meta, VFS_MAX_META_LEN);',
                                            'if (!write) memcpy(out.data, object.meta, (uint8_t)object.meta[0]);'), 3),
                ('mount_during_info', ('out.data[3] = driver->mounted() ? 1 : 0;',
                                      'driver->mount(); out.data[3] = driver->mounted() ? 1 : 0;'), 1),
            )
            for name, mutation, scenario in controls:
                binary = build(name, 'VFS_LFS_ENABLE', mutation)
                run = subprocess.run([str(binary), str(scenario)], capture_output=True, text=True, timeout=20)
                row = {'name': name, 'scenario': scenario, 'exit_code': run.returncode, 'output': run.stdout + run.stderr}
                report['negative_controls'].append(row)
                assert run.returncode == 71 and 'CHECK' in run.stderr, row
        report['source_sha256_after'] = source_hashes()
        assert report['source_sha256'] == report['source_sha256_after'], 'Production sources changed during test'
    report['passed'] = True
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('PASS', len(report['cases']), 'actual-C storage protocol cases;', len(report['negative_controls']),
          'runtime-rejected negative controls; no device access')


if __name__ == '__main__':
    main()
