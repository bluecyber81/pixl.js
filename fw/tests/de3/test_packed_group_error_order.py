"""Exercise the LCD PackedFS bulk failure order on the actual two-shard NOR fixture."""
import os
from pathlib import Path
import subprocess
import tempfile


def main():
    tests = Path(__file__).resolve().parent
    fw = tests.parents[1]
    core = fw / 'application/src/mod/vfs'
    littlefs = fw / 'components/littlefs'
    flags = ['-std=c99', '-O1', '-g', '-Wall', '-Wextra', '-Werror', '-Wno-sign-compare']
    flags += ['-DLFS_NO_' + opt for opt in ('MALLOC', 'WARN', 'ASSERT', 'ERROR', 'DEBUG')]
    if os.environ.get('PIXL_SANITIZE') == '1':
        flags += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-pie', '-no-pie']
    with tempfile.TemporaryDirectory() as tmp:
        exe = Path(tmp) / 'group-error-order'
        subprocess.run(['gcc', *flags, '-I'+str(core), '-I'+str(littlefs), '-I'+str(tests),
                        tests/'packed_group_error_order.c', tests/'packed_vfs_nor_de344.c',
                        littlefs/'lfs.c', littlefs/'lfs_util.c', '-o', exe], check=True)
        subprocess.run([exe], check=True)


if __name__ == '__main__':
    main()
