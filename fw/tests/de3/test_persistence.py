"""Real journal C on a fault-injectable in-memory VFS. No device access."""
import argparse
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import sys

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--cc', default=os.environ.get('CC', 'gcc'))
    args = parser.parse_args()
    here = Path(__file__).resolve().parent
    src = here.parents[1] / 'application/src/mod/vfs'
    sys.path.insert(0, str(here.parent/'de2'))
    from test_player_v3 import function
    code = (here / 'persistence_host.c').read_text().replace('PERSIST_SOURCE', (src/'vfs_persist.c').as_posix())
    code = code.replace('SETTINGS_SOURCE',(src.parent/'settings.c').as_posix())
    spiffs = (src/'vfs_driver_spiffs.c').read_text()
    names = ('vfs_spiffs_update_file_meta','reset_writer_tracking','vfs_spiffs_umount','vfs_spiffs_format','guarded_open',
             'guarded_close','guarded_write_data','guarded_meta','guarded_remove','guarded_remove_dir',
             'guarded_create_dir','guarded_rename','guarded_rename_dir')
    code = code.replace('/* ACTUAL_GUARD_FUNCTIONS */','\n'.join(function(spiffs,n) for n in names))
    with tempfile.TemporaryDirectory(prefix='pixl-persist-de3-') as td:
        tmp = Path(td)
        (tmp/'i18n').mkdir()
        for name,text in {'boards.h':'','tag_helper.h':'',
            'app_amiibolink.h':'#include "ble_amiibolink.h"\n',
            'i18n/language.h':'typedef enum {LANGUAGE_DE_DE,LANGUAGE_EN_US,LANGUAGE_COUNT} Language;\n',
            'nrf_error.h':'#define NRF_SUCCESS 0\n#define NRF_ERROR_NOT_SUPPORTED 1\n#define NRF_ERROR_INVALID_STATE 2\n',
            'nrf_log.h':'#define NRF_LOG_INFO(...) ((void)0)\n#define NRF_LOG_WARNING(...) ((void)0)\n'}.items():
            (tmp/name).write_text(text)
        (tmp/'test.c').write_text(code)
        exe = tmp/('test.exe' if os.name == 'nt' else 'test')
        cmd = shlex.split(args.cc)+['-std=c11','-O1','-g','-fshort-enums','-Wall','-Wextra','-Werror',
             '-Wno-sign-compare','-I',str(tmp),'-I',str(src),'-I',str(src.parent/'ble'),'-I',str(src.parent/'df')]
        if args.sanitize:
            cmd += ['-fsanitize=address,undefined','-fno-omit-frame-pointer']
        subprocess.run(cmd+[str(tmp/'test.c'),'-o',str(exe)],check=True,timeout=60)
        subprocess.run([str(exe)],check=True,timeout=90)

if __name__ == '__main__':
    main()
