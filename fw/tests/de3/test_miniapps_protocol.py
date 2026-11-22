"""Native execution of the production incoming-frame and Switch-2 parsers."""
from pathlib import Path
import os, subprocess, tempfile

FW = Path(__file__).resolve().parents[2]
APP = FW / 'application/src/app'
with tempfile.TemporaryDirectory(prefix='pixl-miniapp-protocol-') as directory:
    p = Path(directory)
    c = p / 'probe.c'
    c.write_bytes(Path(__file__).with_name('miniapps_protocol_host.c.in').read_bytes())
    exe = p / ('probe.exe' if os.name == 'nt' else 'probe')
    command = ['gcc', '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
               '-I' + str(APP/'ble_stream'), '-I' + str(APP/'switch2_wake'),
               str(APP/'ble_stream/stream_codec.c'), str(APP/'switch2_wake/switch2_protocol.c'),
               str(c), '-o', str(exe)]
    if os.environ.get('UI_SANITIZE') == '1':
        command += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
    subprocess.run(command, check=True)
    subprocess.run([str(exe)], check=True, timeout=20)
