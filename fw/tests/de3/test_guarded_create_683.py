"""Exercise the real guarded BLE command, storage adapter and NOR in every full qualification."""
import os
from pathlib import Path
import subprocess
import sys

if __name__ == '__main__':
    here = Path(__file__).resolve().parent
    subprocess.run([sys.executable, '-B', here / 'test_batch_read_de397.py'],
                   env={**os.environ, 'PIXL_GROUP_CREATE_TEST': '1'}, check=True)

