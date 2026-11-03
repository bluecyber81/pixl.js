"""Extract the real shared CRC declarations; portable focused C test runner."""
from pathlib import Path
import os
import re
import shutil
import subprocess
import tempfile
from root_host import FW, function


def crc_declarations(source, *names):
    tables = re.findall(r'^[ \t]*static const uint32_t table\[256\] = \{.*?^[ \t]*\};',
                        source, re.M | re.S)
    assert len(tables) == 1, 'Expected exactly one production CRC table'
    table = tables[0]
    assert len(re.findall(r'0x[0-9a-fA-F]+u', table)) == 256
    # Older source keeps the same table inside crc(); do not duplicate it.
    bodies = [function(source, name) for name in names]
    return '\n'.join(([] if any(table in body for body in bodies) else [table]) + bodies)


def packed_type_prefix(source):
    """Only includes, constants and types, before file-scope static storage/code."""
    match = re.search(r'^[ \t]*static\s', source, re.M)
    assert match is not None and '} change_t;' in source[:match.start()]
    return source[:match.start()]


def run_harness(source):
    arm = os.environ.get('PIXL_ARM32') == '1'
    sanitize = os.environ.get('PIXL_SANITIZE') == '1' and not arm
    compiler = shutil.which('arm-linux-gnueabihf-gcc' if arm else 'gcc')
    assert compiler, 'Required C compiler is unavailable'
    with tempfile.TemporaryDirectory(prefix='packed-crc-de355-') as temp:
        folder = Path(temp)
        path = folder / 'test.c'
        path.write_text(source, encoding='utf8')
        binary = folder / 'test.exe'
        command = [compiler, '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror',
                   '-Wno-unused-parameter', '-Wno-unused-function',
                   '-I', str(FW / 'components/littlefs'), str(path), '-o', str(binary)]
        if arm:
            command += ['-static']
        elif sanitize:
            command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                        '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
        build = subprocess.run(command, capture_output=True, text=True, timeout=60)
        assert build.returncode == 0, build.stdout + build.stderr
        return subprocess.run((['qemu-arm'] if arm else []) + [str(binary)],
                              capture_output=True, text=True, timeout=120)
