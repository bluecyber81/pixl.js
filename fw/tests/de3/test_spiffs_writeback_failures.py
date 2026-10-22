"""Compile real SPIFFS/config and synthetic NOR fault checks; no device access."""
from pathlib import Path
import argparse
import os
import shlex
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--fw',type=Path,default=HERE.parents[1])
parser.add_argument('--cc',default=os.environ.get('CC','gcc'))
parser.add_argument('--sanitize',action='store_true')
args = parser.parse_args()
fw = args.fw.resolve()
with tempfile.TemporaryDirectory(prefix='pixl-writeback-') as tmp:
    exe = Path(tmp)/('test.exe' if os.name=='nt' else 'test')
    command = shlex.split(args.cc)+['-std=c11','-O1','-g','-include','stdint.h',
        '-I',str(fw/'application/src/mod/vfs'),'-I',str(fw/'components/spiffs/src')]
    if args.sanitize:
        command += ['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer']
    if 'SPIFFS_abort(' in (fw/'components/spiffs/src/spiffs.h').read_text(encoding='utf-8'):
        command += ['-DHAS_SPIFFS_ABORT=1']
    command += [str(HERE/'spiffs_writeback_failures.c')]
    command += list(map(str,sorted((fw/'components/spiffs/src').glob('*.c'))))
    subprocess.run(command+['-o',str(exe)],check=True,timeout=60)
    subprocess.run([str(exe)],check=True,timeout=60)
