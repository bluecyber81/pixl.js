"""Compile the real settings.c with mocked storage; never accesses hardware."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

FW = Path(__file__).resolve().parents[2]
source = FW / 'application/src/mod/settings.c'
with tempfile.TemporaryDirectory(prefix='pixl-settings-') as temporary:
    root = Path(temporary)
    (root / 'i18n').mkdir()
    stubs = {
        'boards.h': '', 'tag_helper.h': '',
        'app_amiibolink.h': '#include "ble_amiibolink.h"\n',
        'i18n/language.h': 'typedef enum { LANGUAGE_DE_DE, LANGUAGE_EN_US, LANGUAGE_COUNT } Language;\n',
        'nrf_log.h': '#define NRF_LOG_INFO(...) ((void)0)\n#define NRF_LOG_WARNING(...) ((void)0)\n',
        'nrf_error.h': '#define NRF_SUCCESS 0\n#define NRF_ERROR_NOT_SUPPORTED 1\n#define NRF_ERROR_INVALID_STATE 2\n',
    }
    for filename, text in stubs.items():
        (root / filename).write_text(text)
    program = r'''
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "SOURCE_FILE"
/* DE3 module boundary is mocked here; fault/restart tests compile its real C separately. */
int32_t vfs_persist_recover(vfs_driver_t *d) {(void)d;return VFS_OK;}
int32_t vfs_persist_write(vfs_driver_t *d,const char *p,const void *b,size_t n) {return d->write_file_data(p,(void*)b,n);}
int32_t vfs_persist_write_meta(vfs_driver_t*d,const char*p,const void*b,size_t n,const uint8_t*m) {
 int32_t r=vfs_persist_write(d,p,b,n);if(r==(int32_t)n&&m){int32_t c=d->update_file_meta(p,(void*)m,128);if(c<0)return c;}return r;
}
static unsigned char stored[64];
static int stored_size, read_error, writes, write_result, metadata_result, remove_result;
static bool available, no_driver;
static vfs_driver_t driver;
vfs_driver_t *vfs_get_default_driver(void) { return no_driver ? NULL : &driver; }
static bool mounted(void) { return available; }
static int32_t mount_mock(void) { return available ? 0 : -1; }
static int32_t read_mock(const char *name, void *data, size_t capacity) {
    (void)name;
    if (read_error) return read_error;
    size_t n = (size_t)stored_size < capacity ? (size_t)stored_size : capacity;
    memcpy(data, stored, n); return (int32_t)n;
}
static int32_t write_mock(const char *name, void *data, size_t length) {
    (void)name; (void)data; (void)length; writes++; return write_result;
}
static int32_t meta_mock(const char *n, void *d, size_t z) {
    (void)n; (void)d; (void)z; return metadata_result;
}
static int32_t remove_mock(const char *n) { (void)n; return remove_result; }
void vfs_meta_encode(uint8_t *a, uint8_t n, vfs_meta_t *m) { (void)a;(void)n;(void)m; }
static void reset(void) {
    available=true; no_driver=false; stored_size=26; read_error=0; writes=0;
    write_result=26; metadata_result=0; remove_result=0;
    memcpy(stored, &def_settings_data, 26);
    driver=(vfs_driver_t){.mounted=mounted,.mount=mount_mock,.read_file_data=read_mock,
        .write_file_data=write_mock,.update_file_meta=meta_mock,.remove_file=remove_mock};
}
int main(void) {
    reset(); stored_size=24; stored[12]=3; stored[14]=5; stored[23]=0xff; stored[10]=30;
    assert(settings_init()==0); assert(m_settings_data.anim_enabled);
    assert(!m_settings_data.no_sleep_mode && !m_settings_data.flip_display && !m_settings_data.swap_buttons);
    assert(m_settings_data.lcd_backlight==30 && m_settings_data.language==LANGUAGE_DE_DE);
    m_settings_data.anim_enabled=!m_settings_data.anim_enabled; assert(!m_settings_data.anim_enabled);
    assert(settings_save()==0 && writes==1);
    puts("PASS legacy24 migration preserves brightness, normalizes animation, ignores padding");

    reset(); stored[14]=1; stored[23]=1; stored[24]=1; stored[25]=1;
    assert(settings_init()==0 && m_settings_data.language==LANGUAGE_EN_US);
    assert(m_settings_data.no_sleep_mode && m_settings_data.flip_display && m_settings_data.swap_buttons);
    assert(settings_save()==0 && writes==0);
    puts("PASS current26 preferences preserved and unchanged file not rewritten");

    for (int n=0;n<256;n++) {
        reset(); stored[12]=(unsigned char)n; stored[25]=(unsigned char)n;
        assert(settings_init()==0);
        assert(((unsigned char *)&m_settings_data)[12] <= 1);
        assert(((unsigned char *)&m_settings_data)[25] <= 1);
        assert(m_settings_data.anim_enabled == (n==1 || n==3));
    }
    puts("PASS all 256 animation and swap raw-byte values canonicalized");

    for (int n=0;n<40;n++) {
        if (n==24 || n==26) continue;
        reset(); stored_size=n; assert(settings_init()!=0);
        assert(settings_save()!=0 && writes==0);
    }
    puts("PASS unknown, short and oversized files preserved");

    reset(); assert(settings_init()==0); read_error=VFS_ERR_FAIL;
    assert(settings_save()!=0 && writes==0);
    reset(); read_error=VFS_ERR_FAIL; assert(settings_init()!=0);
    read_error=VFS_ERR_NOOBJ; assert(settings_save()!=0 && writes==0);
    puts("PASS read failures never recreate settings");

    reset(); read_error=VFS_ERR_NOOBJ; assert(settings_init()==0);
    assert(settings_save()==0 && writes==1);
    for (int n=-1;n<26;n++) {
        reset(); read_error=VFS_ERR_NOOBJ; assert(settings_init()==0); write_result=n;
        assert(settings_save()!=0);
    }
    puts("PASS absent file can be created; negative and short writes rejected");

    reset(); stored[16]=8; stored[20]=7; assert(settings_init()==0);
    assert(m_settings_data.chameleon_default_slot_index==INVALID_SLOT_INDEX);
    assert(m_settings_data.amiidb_sort_column==AMIIDB_SORT_COLUMN_DEFAULT);
    reset(); stored[16]=7; assert(settings_init()==0 && m_settings_data.chameleon_default_slot_index==7);
    puts("PASS slot index upper bound is exclusive and sort enum validated");

    reset(); available=false; assert(settings_init()!=0 && settings_save()!=0 && settings_reset()!=0);
    reset(); no_driver=true; assert(settings_init()!=0 && settings_save()!=0 && settings_reset()!=0);
    reset(); assert(settings_init()==0); remove_result=-1; assert(settings_reset()!=0);
    remove_result=VFS_ERR_NOOBJ; assert(settings_reset()==0);
    puts("PASS missing storage and failed reset handled without null dereference");
    puts("8 settings regression groups passed");
    return 0;
}
'''.replace('SOURCE_FILE', source.as_posix())
    cfile = root / 'settings_test.c'
    cfile.write_text(program)
    exe = root / ('settings_test.exe' if __import__('os').name == 'nt' else 'settings_test')
    command = [shutil.which('gcc') or 'gcc', '-std=c11', '-O2', '-fshort-enums',
               '-I', str(root), '-I', str(FW/'application/src/mod/vfs'),
               '-I', str(FW/'application/src/mod/ble'), str(cfile), '-o', str(exe)]
    subprocess.run(command, check=True, text=True)
    result = subprocess.run([str(exe)], check=True, capture_output=True, text=True)
    print(json.dumps({'test': 'settings', 'groups': 8, 'result': result.stdout}, indent=2))
