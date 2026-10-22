"""Real SPIFFS sentinel recovery, commit failures, and preserved error cases."""
from pathlib import Path
import os
import subprocess
import tempfile

FW = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='pixl-sentinel-') as temp:
    exe = Path(temp)/('sentinel.exe' if os.name == 'nt' else 'sentinel')
    command = ['gcc', '-std=c11', '-O1', '-g', '-include', 'stdint.h',
               '-I', str(FW/'application/src/mod/vfs'), '-I', str(FW/'components/spiffs/src')]
    if os.environ.get('SPIFFS_SANITIZE'):
        command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer']
    command += [str(HERE/'spiffs_sentinel.c')]
    command += list(map(str, sorted((FW/'components/spiffs/src').glob('*.c'))))
    subprocess.run(command+['-o', str(exe)], check=True, timeout=60)
    subprocess.run([str(exe)], check=True, timeout=120)
    if os.environ.get('SPIFFS_SENTINEL_IMAGE'):
        subprocess.run([str(exe), os.environ['SPIFFS_SENTINEL_IMAGE']], check=True, timeout=60)
