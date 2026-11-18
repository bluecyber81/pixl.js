"""Exercise slot classification and the Save As scene on a fresh 2 MiB NOR image."""
from pathlib import Path
import os
from slot_scene_fixture import render_slot_scene
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
with tempfile.TemporaryDirectory(prefix="lcd-slot-guard-") as tdir:
    work=pathlib.Path(tdir)
    test_definition=(tests/'test_packed_vfs_persistence_de344.py').read_text()
    flash_stub=test_definition.split("(folder/'hal_spi_flash.h').write_text('''",1)[1].split("''')",1)[0]
    (work/'hal_spi_flash.h').write_text(flash_stub)
    (work/'boards.h').write_text('#pragma once\n#define VFS_PACKED_LFS_ENABLE 1\n')
    (work/'mui_mem.h').write_bytes((tests/'packed_test_mui_mem.h').read_bytes())
    scene=src/'app/amiidb/scene'
    generated = render_slot_scene(work, tests, src)
    (work/'cases.c').write_text((tests/'packed_vfs_persistence_de344.c').read_text().split('static void drop(void)')[0]+generated+'''
vfs_driver_t *vfs_get_driver(vfs_drive_t drive) {
    REQUIRE(drive == VFS_DRIVE_EXT); return driver();
}
int main(void) {
    nor_init(&media); REQUIRE(driver()->format() == VFS_OK);
    uint8_t identity[32] = {1}; REQUIRE(vfs_packed_bind_import(identity) == VFS_OK);
    REQUIRE(vfs_packed_finish_import() == VFS_OK);
    check_slot_save_guard(driver());
    REQUIRE(vfs_packed_handles_idle()); REQUIRE(driver()->umount() == VFS_OK);
    check_slots_unmounted();
    REQUIRE(pfs_destroy(store) == VFS_OK && live == 0);
    return 0;
}
''', encoding='utf-8')
    cmd=['arm-linux-gnueabihf-gcc' if arm32 else 'gcc','-std=c11','-O1','-g','-ffunction-sections','-fdata-sections','-Wl,--gc-sections','-DLFS_NO_MALLOC','-DLFS_NO_DEBUG','-DLFS_NO_WARN','-DLFS_NO_ERROR','-DVFS_PACKED_LFS_ENABLE',f'-DSTORE_CORE="{vfs/"packed_fs.c"}"',f'-DSTORE_ADAPTER="{vfs/"vfs_driver_packed.c"}"']
    for path in [work,scene,src/'amiidb',src/'ntag',src/'i18n',src/'mod/df',src/'app/amiidb/api',vfs,lfs,tests]:
        cmd.extend(['-I',str(path)])
    cmd.extend(map(str,[work/'cases.c',tests/'packed_vfs_nor_de344.c',src/'app/amiidb/api/amiidb_api_slot.c',vfs/'vfs_meta.c',vfs/'vfs_persist.c',src/'i18n/de_DE.c',src/'amiidb/db_search.c',src/'amiidb/db_amiibo.c',lfs/'lfs.c',lfs/'lfs_util.c']))
    if arm32: cmd+=['-static']
    if asan: cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-no-pie']
    cmd.extend(['-o',str(work/'cases')])
    subprocess.run(cmd,check=True)
    subprocess.run((['qemu-arm'] if arm32 else [])+[str(work/'cases')],check=True)
