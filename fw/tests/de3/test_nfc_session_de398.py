"""Actual LCD NTAG parser/session engine, explicit RF event and HAL boundaries.

One new status byte must fit the prior ABI's padding. No added static tag copy,
physical radio operation, reader/game acceptance or device navigation claim.
"""
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
SRC = HERE.parents[1] / 'application/src'


def verify(arm=False):
    engine_path = SRC / 'ntag/ntag_emu_v2.c'
    header_path = SRC / 'ntag/ntag_emu.h'
    fixture = HERE / 'nfc_session_de398.c.in'
    prefix_path = HERE / 'nfc_lifecycle_host.c'
    engine = engine_path.read_text()
    state_start = engine.index('typedef struct {\n    ntag_t ntag;')
    state_end = engine.index('} ntag_emu_t;', state_start) + len('} ntag_emu_t;')
    previous = engine[state_start:state_end]
    previous = re.sub(r'#if defined\(BOARD_LCD\)\n    /\* Fits.*?\n#endif\n', '', previous, flags=re.S)
    assert 'rf_session' not in previous
    previous = previous.replace('ntag_emu_t;', 'previous_ntag_emu_t;')
    engine = re.sub(r'(?m)^\s*#include[^\n]*\n', '', engine)
    prefix = prefix_path.read_text().split('/* ACTUAL_SOURCE */')[0]
    prefix = '#include <stddef.h>\n' + prefix
    needle = 'static ret_code_t hal_nfc_send(const uint8_t *data, size_t size) {\n'
    assert prefix.count(needle) == 1
    prefix = prefix.replace(needle, 'static ret_code_t injected_send_result;\n' + needle +
                            '    if (injected_send_result) return injected_send_result;\n')
    code = prefix + engine + '\n' + previous + '\n' + fixture.read_text()
    with tempfile.TemporaryDirectory(prefix='nfc-session-de398-') as tmp:
        folder = Path(tmp)
        source, binary = folder / 'contract.c', folder / 'contract'
        source.write_text(code)
        compiler = shutil.which('arm-linux-gnueabihf-gcc' if arm else 'gcc')
        assert compiler
        command = [compiler, '-std=c11', '-O1', '-g', '-fshort-enums', '-DBOARD_LCD=1',
                   '-Wall', '-Wextra', '-Werror', '-Wno-unused-parameter',
                   '-I', str(SRC / 'ntag'), str(source), '-o', str(binary)]
        if arm:
            command += ['-static']
        else:
            command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                        '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
        built = subprocess.run(command, capture_output=True, text=True, timeout=60)
        assert built.returncode == 0, built.stdout + built.stderr
        ran = subprocess.run((['qemu-arm'] if arm else []) + [str(binary)],
                             capture_output=True, text=True, timeout=45,
                             env=dict(os.environ, ASAN_OPTIONS='detect_leaks=0'))
        assert ran.returncode == 0, ran.stdout + ran.stderr
        observations = [json.loads(line) for line in ran.stdout.splitlines() if line.startswith('{')]
        assert len(observations) == 1
        result = observations[0]
        assert result['passed'] and result['cases'] >= 40
        assert result['stateBytes'] == result['previousStateBytes']
        assert result['pointerBytes'] == (4 if arm else __import__('struct').calcsize('P'))
        result.update(sourceSha256={str(p.relative_to(SRC.parents[1])): sha256(p.read_bytes()).hexdigest()
                                    for p in (engine_path, header_path, SRC / 'ntag/ntag_def.h')},
                      fixtureSha256=sha256(fixture.read_bytes()).hexdigest(),
                      checkerSha256=sha256(Path(__file__).read_bytes()).hexdigest(),
                      generatedSourceSha256=sha256(code.encode()).hexdigest(),
                      arm32=arm, sanitizers=[] if arm else ['address', 'undefined'],
                      deviceAccess=False,
                      boundaries=['HAL send return/bytes, RF event delivery, UID/start/stop and UI return sink are modeled.',
                                  'Actual production command parser, session flags/getter, save ownership and action queue run.',
                                  'No reader/game acknowledgement, physical timing, persistence medium or firmware stack bound.'])
        print(ran.stdout.strip())
        return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--arm32', action='store_true', default=os.environ.get('PIXL_ARM32') == '1')
    parser.add_argument('--json', type=Path)
    args = parser.parse_args()
    result = verify(args.arm32)
    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(result, indent=2) + '\n')
