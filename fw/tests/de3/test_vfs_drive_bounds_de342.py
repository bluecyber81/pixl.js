"""Public VFS accessors reject invalid indices before touching the drive table."""
from pathlib import Path
import os
import subprocess
import tempfile
import unittest

FW = Path(__file__).resolve().parents[2]
VFS = FW / 'application/src/mod/vfs'

HARNESS = r'''
#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include "vfs.h"
const vfs_driver_t vfs_driver_fs = {0};
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"line %u: %s\n",__LINE__,#x); return 77; } } while(0)
int main(void) {
    CHECK(!vfs_drive_enabled(VFS_DRIVE_INT));
    CHECK(vfs_get_driver(VFS_DRIVE_INT)==NULL);
    CHECK(vfs_drive_enabled(VFS_DRIVE_EXT));
    CHECK(vfs_get_driver(VFS_DRIVE_EXT)==&vfs_driver_fs);
    CHECK(vfs_get_default_drive()==VFS_DRIVE_EXT);
    CHECK(vfs_get_default_driver()==&vfs_driver_fs);
    /* Exhaust every byte representable by the firmware's short enum ABI.
     * API clients may restore older retained state or pass unknown IDs. */
    for (unsigned i=VFS_DRIVE_MAX;i<=UINT8_MAX;++i) {
        CHECK(!vfs_drive_enabled((vfs_drive_t)i));
        CHECK(vfs_get_driver((vfs_drive_t)i)==NULL);
    }
    CHECK(!vfs_drive_enabled((vfs_drive_t)-1));
    CHECK(vfs_get_driver((vfs_drive_t)-1)==NULL);
    puts("PASS VFS configured/default drives and 255 invalid byte/sentinel cases");
    return 0;
}
'''

class DriveBoundsTests(unittest.TestCase):
    def test_actual_vfs_table_short_enum_and_native_enum(self):
        for short_enums in (False, True):
            with self.subTest(short_enums=short_enums), tempfile.TemporaryDirectory(prefix='pixl-vfs-bounds-') as folder:
                folder=Path(folder)
                (folder/'boards.h').write_text('')
                probe=folder/'probe.c';probe.write_text(HARNESS, encoding='utf-8')
                binary=folder/'probe.exe'
                cmd=['gcc','-std=c11','-O1','-g','-Wall','-Wextra','-Werror']
                if short_enums:cmd.append('-fshort-enums')
                if os.environ.get('PIXL_SANITIZE')=='1':
                    cmd += ['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer']
                cmd += ['-I',str(folder),'-I',str(VFS),str(VFS/'vfs.c'),str(probe),'-o',str(binary)]
                compiled=subprocess.run(cmd,capture_output=True,text=True,timeout=60)
                self.assertEqual(compiled.returncode,0,compiled.stdout+compiled.stderr)
                result=subprocess.run([str(binary)],capture_output=True,text=True,timeout=60)
                self.assertEqual(result.returncode,0,result.stdout+result.stderr)
                self.assertIn('PASS VFS',result.stdout)
if __name__=='__main__':unittest.main()

