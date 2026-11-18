"""Exercise slot classification and the Save As scene on a fresh 2 MiB NOR image."""
from pathlib import Path
import os
import re
import subprocess
import tempfile
import pathlib

arm32 = os.environ.get('PIXL_ARM32') == '1'
asan = os.environ.get('PIXL_SANITIZE') == '1' and not arm32
tests = Path(__file__).resolve().parent
fw = tests.parents[1]
src = fw / 'application/src'
vfs = src / 'mod/vfs'
lfs = fw / 'components/littlefs'
harness = (tests / 'slot_save_guard_host.c.in').read_text()
with tempfile.TemporaryDirectory(prefix="lcd-slot-guard-") as tdir:
    work=pathlib.Path(tdir)
    test_definition=(tests/'test_packed_vfs_persistence_de344.py').read_text()
    flash_stub=test_definition.split("(folder/'hal_spi_flash.h').write_text('''",1)[1].split("''')",1)[0]
    (work/'hal_spi_flash.h').write_text(flash_stub)
    (work/'boards.h').write_text('#pragma once\n#define VFS_PACKED_LFS_ENABLE 1\n')
    (work/'mui_mem.h').write_bytes((tests/'packed_test_mui_mem.h').read_bytes())
    (work/'settings.h').write_text('#pragma once\n#include <stdint.h>\ntypedef struct {uint8_t amiidb_data_slot_num;} settings_data_t;\nsettings_data_t *settings_get_data(void);\n#define LANGUAGE_DE_DE 3\nint getLanguage(void);int isChineseLanguage(void);\n')
    (work/'amiibo_helper.h').write_text('#pragma once\n#include <stdint.h>\nstatic inline uint32_t to_little_endian_int32(const uint8_t *p){return ((uint32_t)p[0]<<24)|((uint32_t)p[1]<<16)|((uint32_t)p[2]<<8)|p[3];}\n')
    def extract_function(path,name):
        text=path.read_text()
        part=re.search(r"(?m)^(?:static )?void "+re.escape(name)+r"\(",text).start()
        opening=text.index("{",part)
        level=1
        for i in range(opening+1,len(text)):
            level+=(text[i]=="{")-(text[i]=="}")
            if not level: return text[part:i+1]
        raise ValueError(name)
    scene=src/'app/amiidb/scene'
    scene_source=(scene/'amiidb_scene_data_select.c').read_text()
    save_handlers=scene_source[scene_source.index('static void save_to_slot'):scene_source.index('static void amiidb_scene_data_select_setup')]
    generated=harness.replace('UI_FUNCTIONS',extract_function(scene/'amiidb_scene_data_list.c','amiidb_scene_data_list_amiibo_slot_info_cb')+'\n'+save_handlers)
    (work/'cases.c').write_text((tests/'packed_vfs_persistence_de344.c').read_text().split('static void drop(void)')[0]+generated)
    cmd=['arm-linux-gnueabihf-gcc' if arm32 else 'gcc','-std=c11','-O1','-g','-ffunction-sections','-fdata-sections','-Wl,--gc-sections','-DLFS_NO_MALLOC','-DLFS_NO_DEBUG','-DLFS_NO_WARN','-DLFS_NO_ERROR','-DVFS_PACKED_LFS_ENABLE',f'-DSTORE_CORE="{vfs/"packed_fs.c"}"',f'-DSTORE_ADAPTER="{vfs/"vfs_driver_packed.c"}"']
    for path in [work,src/'amiidb',src/'ntag',src/'i18n',src/'mod/df',src/'app/amiidb/api',vfs,lfs,tests]:
        cmd.extend(['-I',str(path)])
    cmd.extend(map(str,[work/'cases.c',tests/'packed_vfs_nor_de344.c',src/'app/amiidb/api/amiidb_api_slot.c',vfs/'vfs_meta.c',vfs/'vfs_persist.c',src/'i18n/de_DE.c',src/'amiidb/db_search.c',src/'amiidb/db_amiibo.c',lfs/'lfs.c',lfs/'lfs_util.c']))
    if arm32: cmd+=['-static']
    if asan: cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-no-pie']
    cmd.extend(['-o',str(work/'cases')])
    subprocess.run(cmd,check=True)
    subprocess.run((['qemu-arm'] if arm32 else [])+[str(work/'cases')],check=True)
