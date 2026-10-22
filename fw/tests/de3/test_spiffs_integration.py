"""Production SPIFFS/config, bounded NOR model, checker, metadata and interoperability."""
from pathlib import Path
import os
import subprocess
import tempfile

FW = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent

def build(fw, exe, sanitize):
    command = ['gcc', '-std=c11', '-O1', '-g', '-include', 'stdint.h',
               '-I', str(fw/'application/src/mod/vfs'), '-I', str(fw/'components/spiffs/src')]
    if sanitize:
        command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer']
    command += [str(HERE/'spiffs_integration.c')]
    command += list(map(str, sorted((fw/'components/spiffs/src').glob('*.c'))))
    subprocess.run(command+['-o', str(exe)], check=True, timeout=60)

def run(*command):
    result = subprocess.run(list(map(str, command)), capture_output=True, text=True, timeout=60)
    print(result.stdout, end='', flush=True)
    if result.stderr:
        print(result.stderr, end='', flush=True)
    assert result.returncode == 0, result.returncode
    assert 'runtime error:' not in result.stderr and 'ERROR: AddressSanitizer' not in result.stderr

with tempfile.TemporaryDirectory(prefix='pixl-spiffs-') as temp:
    path = Path(temp)
    suffix = '.exe' if os.name == 'nt' else ''
    current = path/('current'+suffix)
    build(FW, current, bool(os.environ.get('SPIFFS_SANITIZE')))
    for size in (4, 16):
        run(current, size)
    # Optional explicit compatibility check against the preserved baseline sources.
    # The legacy program only receives valid synthetic images, never damaged metadata.
    if os.environ.get('SPIFFS_LEGACY_FW'):
        legacy = path/('legacy'+suffix)
        build(Path(os.environ['SPIFFS_LEGACY_FW']), legacy, False)
        for size in (4, 16):
            image = path/('synthetic_'+str(size)+'.img')
            run(legacy, size, 'seed', image)
            run(current, size, 'update', image)
            run(legacy, size, 'verify', image)
        print('PASS baseline -> DE3.3 -> baseline file-format interoperability (4/16 MiB)')
