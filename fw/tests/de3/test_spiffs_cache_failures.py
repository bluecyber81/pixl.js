"""Real SPIFFS cache rejects stale data after synthetic HAL failures."""
from pathlib import Path
import os
import subprocess
import tempfile

FW = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix='pixl-cache-fault-') as temp:
    exe = Path(temp) / ('cache_failures.exe' if os.name == 'nt' else 'cache_failures')
    command = ['gcc', '-std=c11', '-O1', '-g', '-include', 'stdint.h',
               '-I', str(FW / 'application/src/mod/vfs'),
               '-I', str(FW / 'components/spiffs/src')]
    if os.environ.get('SPIFFS_SANITIZE'):
        command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                    '-fno-omit-frame-pointer']
    command += [str(HERE / 'spiffs_cache_failures.c')]
    command += list(map(str, sorted((FW / 'components/spiffs/src').glob('*.c'))))
    subprocess.run(command + ['-o', str(exe)], check=True, timeout=60)
    subprocess.run([str(exe)], check=True, timeout=60)
