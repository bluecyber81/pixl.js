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
#define PIXL_RUNTIME_DIAGNOSTICS 1
#include "SOURCE_FILE"
static unsigned startup_marks;
static int recovery_result;
void startup_storage_checkpoint(enum startup_storage_checkpoint step) {
    startup_marks |= 1u << step;
}
/* DE3 module boundary is mocked here; fault/restart tests compile its real C separately. */
int32_t vfs_persist_recover(vfs_driver_t *d) {(void)d;return recovery_result;}
int32_t vfs_persist_write(vfs_driver_t *d,const char *p,const void *b,size_t n) {return d->write_file_data(p,(void*)b,n);}
int32_t vfs_persist_write_meta(vfs_driver_t*d,const char*p,const void*b,size_t n,const uint8_t*m) {
 int32_t r=vfs_persist_write(d,p,b,n);if(r==(int32_t)n&&m){int32_t c=d->update_file_meta(p,(void*)m,128);if(c<0)return c;}return r;
}
static unsigned char stored[64];
static int stat_error, size_delta, read_limit, stat_type;
static int stored_size, read_error, writes, write_result, metadata_result, remove_result;
static bool available, no_driver, mount_success;
static vfs_driver_t driver;
vfs_driver_t *vfs_get_default_driver(void) { return no_driver ? NULL : &driver; }
static bool mounted(void) { return available; }
static int32_t mount_mock(void) { available = mount_success; return available ? 0 : -1; }
static int32_t stat_mock(const char *name, vfs_obj_t *obj) {
    assert(!strcmp(name, "/settings.bin"));
    if (stat_error) return stat_error;
    obj->type=stat_type;obj->size=(uint32_t)(stored_size+size_delta);return VFS_OK;
}
static int32_t read_mock(const char *name, void *data, size_t capacity) {
    (void)name;
    if (read_error) return read_error;
    size_t n = (size_t)stored_size < capacity ? (size_t)stored_size : capacity;
    if (read_limit && n>(size_t)read_limit) n=(size_t)read_limit;
    memcpy(data, stored, n); return (int32_t)n;
}
static int32_t write_mock(const char *name, void *data, size_t length) {
    (void)name; writes++;
    if (write_result == (int)length && length <= sizeof(stored)) {
        memcpy(stored, data, length);
        stored_size = (int)length;
    }
    return write_result;
}
static int32_t meta_mock(const char *n, void *d, size_t z) {
    (void)n; (void)d; (void)z; return metadata_result;
}
static int32_t remove_mock(const char *n) { (void)n; return remove_result; }
void vfs_meta_encode(uint8_t *a, uint8_t n, vfs_meta_t *m) { (void)a;(void)n;(void)m; }
static void reset(void) {
    stat_error=size_delta=read_limit=0;stat_type=VFS_TYPE_REG;
    startup_marks=0; recovery_result=0; mount_success=false;
    available=true; no_driver=false; stored_size=26; read_error=0; writes=0;
    write_result=26; metadata_result=0; remove_result=0;
    memcpy(stored, &def_settings_data, 26);
    driver=(vfs_driver_t){.mounted=mounted,.mount=mount_mock,.stat_file=stat_mock,.read_file_data=read_mock,
        .write_file_data=write_mock,.update_file_meta=meta_mock,.remove_file=remove_mock};
}
int main(void) {
    reset();
    stored[offsetof(settings_data_t,chameleon_slot_num)]=20;
    stored[offsetof(settings_data_t,chameleon_default_slot_index)]=14;
    assert(settings_init()==0);
    settings_get_data()->chameleon_slot_num=50;
    settings_get_data()->chameleon_default_slot_index=42;
    assert(settings_save()==0);
    settings_get_data()->chameleon_slot_num=8;
    settings_get_data()->chameleon_default_slot_index=0;
    settings_get_data()->flip_display=true;
    write_result=VFS_ERR_NOSPC;
    assert(settings_save()!=0);
    unsigned before_discard=writes;
    settings_discard_chameleon_changes();
    assert(settings_get_data()->chameleon_slot_num==50 && settings_get_data()->chameleon_default_slot_index==42);
    assert(settings_get_data()->flip_display && writes==(int)before_discard);
    assert(settings_reset()==0);
    settings_get_data()->chameleon_slot_num=50;
    settings_discard_chameleon_changes();
    assert(settings_get_data()->chameleon_slot_num==8 && settings_get_data()->chameleon_default_slot_index==INVALID_SLOT_INDEX);
    for(unsigned len=24;len<=26;len+=2) {
        reset();stored_size=len;
        stored[12]=1;stored[1]=180;stored[10]=73;stored[14]=LANGUAGE_EN_US;
        stored[16]=14;stored[21]=40;stored[18]=0x7d;stored[19]=0x7d;
        read_error=VFS_ERR_FAIL;assert(settings_init()!=0);
        SETTINGS_TOGGLE(anim_enabled);SETTINGS_TOGGLE(anim_enabled);
        SETTINGS_SET(sleep_timeout_sec,60);SETTINGS_SET(sleep_timeout_sec,30);
        SETTINGS_SET(language,LANGUAGE_DE_DE); /* Directly select the already displayed default. */
        settings_toggle_app(1);settings_toggle_app(1);settings_toggle_app(9);settings_toggle_app(9);
        settings_toggle_app(16); /* Out-of-range IDs cannot modify adjacent fields. */
        SETTINGS_SET(chameleon_slot_num,8);SETTINGS_SET(chameleon_default_slot_index,INVALID_SLOT_INDEX);
        settings_discard_chameleon_changes(); /* Only release ownership of these two fields. */
        assert(settings_save()!=0 && writes==0);
        read_error=0;write_result=VFS_ERR_NOSPC;assert(settings_save()!=0 && writes==1);
        assert(m_settings_data.chameleon_slot_num==40 && m_settings_data.chameleon_default_slot_index==14);
        assert(!m_settings_data.anim_enabled && m_settings_data.sleep_timeout_sec==30);
        assert(m_settings_data.language==LANGUAGE_DE_DE && m_settings_data.lcd_backlight==73);
        assert(m_settings_data.app_enable_bits==0x7f7f); /* Unselected disabled bits remain disabled. */
        write_result=26;assert(settings_save()==0 && writes==2 && settings_init()==0);
        assert(!m_settings_data.anim_enabled && m_settings_data.sleep_timeout_sec==30 &&
               m_settings_data.language==LANGUAGE_DE_DE && m_settings_data.app_enable_bits==0x7f7f);
        read_error=VFS_ERR_FAIL;assert(settings_init()!=0);
        read_error=0;stored[12]=1;stored[1]=180;stored[18]=0;
        assert(settings_retry_load()==0 && m_settings_data.anim_enabled &&
               m_settings_data.sleep_timeout_sec==180 && !(m_settings_data.app_enable_bits & 2));
    }
    reset();read_error=VFS_ERR_FAIL;assert(settings_init()!=0);
    SETTINGS_SET(sleep_timeout_sec,30);settings_toggle_app(1);assert(settings_reset()==0);
    read_error=0;stored[1]=180;stored[18]=0;assert(settings_retry_load()==0);
    assert(m_settings_data.sleep_timeout_sec==180 && !(m_settings_data.app_enable_bits & 2));
    puts("PASS intentional defaults survive verified late load, write failures, and restart; discard/reset clear precisely scoped choices");
    for (int legacy=0; legacy<=1; legacy++) {
        reset(); stored[0]=(unsigned char)legacy;
        assert(settings_init()==0 && !settings_get_lcd_dim());
        assert(settings_save()==0 && writes==0 && stored[0]==legacy);
        settings_cycle_lcd_dim();
        assert(settings_lcd_dim_idle_seconds()==5);
        assert(settings_get_lcd_dim() && writes==0 && settings_save()==0 && writes==1);
        assert(settings_init()==0 && settings_get_lcd_dim() && settings_save()==0 && writes==1);
        for (int mode=0;mode<3;mode++) {
            const unsigned expected[3]={15,30,0};
            settings_cycle_lcd_dim();
            assert(settings_get_lcd_dim() && settings_lcd_dim_idle_seconds()==expected[mode]);
        }
        settings_cycle_lcd_dim();
        assert(settings_save()==0 && writes==2 && stored[0]==0 && settings_init()==0 && !settings_get_lcd_dim());
    }
    reset(); stored[0]=0xfe;
    assert(settings_init()==0 && !settings_get_lcd_dim() && !writes);
    reset(); stored_size=24; stored[0]=0xd3;
    assert(settings_init()==0 && !settings_get_lcd_dim() && !writes);
    puts("PASS dim opt-in, valid legacy values, migration, persistence and no extra writes");

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
    reset(); assert(settings_init()==0);
    read_error=VFS_ERR_FAIL; assert(settings_save()==VFS_ERR_FAIL && writes==0);
    puts("PASS read failures never recreate settings");

    /* Late recovery must preserve fields not edited against boot defaults,
     * including disabled apps in the same byte as a newly disabled app. */
    for (int length=24;length<=26;length+=2) {
        reset();stored_size=length;stored[1]=180;stored[10]=75;stored[16]=4;
        stored[18]=0xf7;stored[19]=0xfc;stored[21]=40;stored[23]=1;stored[24]=1;
        read_error=VFS_ERR_FAIL;assert(settings_init()!=0);
        m_settings_data.chameleon_default_slot_index=6;
        m_settings_data.app_enable_bits &= ~(uint16_t)2;
        read_error=0;
        assert(settings_retry_load()==0 && writes==0);
        assert(m_settings_data.sleep_timeout_sec==180 && m_settings_data.lcd_backlight==75);
        assert(m_settings_data.app_enable_bits==0xfcf5 && m_settings_data.chameleon_slot_num==40);
        assert(m_settings_data.chameleon_default_slot_index==6);
        assert(m_settings_data.no_sleep_mode==(length==26) && m_settings_data.flip_display==(length==26));
        assert(settings_save()==0 && writes==1 && stored[16]==6 && stored[21]==40 && stored[18]==0xf5);
        assert(settings_save()==0 && writes==1);
    }
    for (int fault=0;fault<10;fault++) {
        reset();stored[21]=40;stored[10]=75;read_error=VFS_ERR_FAIL;assert(settings_init()!=0);
        read_error=0;m_settings_data.chameleon_default_slot_index=3;
        switch(fault){
        case 0: stat_error=VFS_ERR_FAIL;break;
        case 1: stat_error=VFS_ERR_NOOBJ;break;
        case 2: read_error=VFS_ERR_FAIL;break;
        case 3: read_error=VFS_ERR_NOOBJ;break;
        case 4: read_limit=24;break; /* A short current file must not be mistaken for legacy. */
        case 5: size_delta=-1;break;
        case 6: stat_type=VFS_TYPE_DIR;break;
        case 7: recovery_result=VFS_ERR_CRPT;break;
        case 8: available=false;break;
        case 9: no_driver=true;break;
        }
        assert(settings_save()!=0 && writes==0 && stored[16]==INVALID_SLOT_INDEX);
        assert(m_settings_data.chameleon_default_slot_index==3 && m_settings_data.chameleon_slot_num==8);
        stat_error=read_error=read_limit=size_delta=recovery_result=0;
        stat_type=VFS_TYPE_REG;available=true;no_driver=false;
        assert(settings_save()==0 && writes==1 && stored[16]==3 && stored[21]==40 && stored[10]==75);
    }
    reset();stored[10]=72;available=false;assert(settings_init()!=0);
    available=true;assert(settings_save()==0 && writes==0 && m_settings_data.lcd_backlight==72);
    puts("PASS retry after temporary read/mount faults preserves valid files, in-memory edits, independent flags and legacy ABI");

    reset(); read_error=stat_error=VFS_ERR_NOOBJ; assert(settings_init()==0);
    assert(settings_retry_load()==0 && !writes);
    assert(settings_save()==0 && writes==1);
    read_error=stat_error=0; assert(settings_save()==0 && writes==1);

    /* Restore the filesystem after a new/empty boot, before either entering
     * Chameleon (which needs the real slot count) or the first settings save. */
    reset();read_error=stat_error=VFS_ERR_NOOBJ;assert(settings_init()==0);
    read_error=stat_error=0;stored[10]=73;stored[16]=9;stored[21]=20;
    assert(settings_save()==0 && writes==0 && m_settings_data.lcd_backlight==73 &&
           m_settings_data.chameleon_default_slot_index==9 && m_settings_data.chameleon_slot_num==20);

    for (int first_save=0;first_save<=1;first_save++) for(int length=24;length<=26;length+=2) {
        reset();read_error=stat_error=VFS_ERR_NOOBJ;assert(settings_init()==0);
        m_settings_data.chameleon_default_slot_index=3;
        stored[10]=75;stored[16]=12;stored[21]=40;stored_size=length;read_error=stat_error=0;
        if(first_save) {
            write_result=VFS_ERR_NOSPC;assert(settings_save()!=0 && writes==1);
        } else {
            assert(settings_retry_load()==0 && writes==0);
        }
        assert(m_settings_data.lcd_backlight==75 && m_settings_data.chameleon_slot_num==40 &&
               m_settings_data.chameleon_default_slot_index==3);
        settings_discard_chameleon_changes();
        assert(m_settings_data.chameleon_default_slot_index==12 && stored[16]==12);
        write_result=26;assert(settings_save()==0 && stored_size==26 && stored[10]==75 && stored[21]==40);
    }
    for (int fault=0;fault<5;fault++) {
        reset();read_error=stat_error=VFS_ERR_NOOBJ;assert(settings_init()==0);
        stored[16]=3;read_error=stat_error=0;
        if(!fault)stored_size=25;
        if(fault==1)stat_error=VFS_ERR_FAIL;
        if(fault==2)read_limit=24;
        if(fault==3)read_error=VFS_ERR_NOOBJ;
        if(fault==4)stat_error=VFS_ERR_NOOBJ;
        assert(settings_save()!=0 && writes==0 && stored[16]==3);
    }
    reset();stored[10]=76;assert(settings_init()==0 && settings_reset()==0);
    stat_error=read_error=VFS_ERR_NOOBJ;m_settings_data.lcd_backlight=64;
    assert(settings_retry_load()==0 && settings_save()==0 && writes==1 && stored[10]==64);
    stat_error=read_error=0;assert(settings_save()==0 && writes==1);
    puts("PASS newly restored records supersede provisional defaults, missing settings can still be created after init/reset");
    for (int n=-1;n<26;n++) {
        reset(); read_error=stat_error=VFS_ERR_NOOBJ; assert(settings_init()==0); write_result=n;
        assert(settings_save()!=0);
    }
    puts("PASS absent file can be created; negative and short writes rejected");

    reset(); stored[16]=8; stored[20]=7; assert(settings_init()==0);
    assert(m_settings_data.chameleon_default_slot_index==INVALID_SLOT_INDEX);
    assert(m_settings_data.amiidb_sort_column==AMIIDB_SORT_COLUMN_DEFAULT);
    reset(); stored[16]=7; assert(settings_init()==0 && m_settings_data.chameleon_default_slot_index==7);
    puts("PASS slot index upper bound is exclusive and sort enum validated");

    reset(); available=false; assert(settings_init()!=0 && settings_save()!=0 && settings_reset()!=0);
    assert(startup_marks==0);
    reset(); available=false; mount_success=true;
    assert(settings_init()==0 && startup_marks==3);
    reset(); recovery_result=VFS_ERR_CRPT;
    assert(settings_init()!=0 && startup_marks==1 && writes==0);
    reset(); read_error=VFS_ERR_FAIL;
    assert(settings_init()!=0 && startup_marks==3 && writes==0);
    reset(); no_driver=true; assert(settings_init()!=0 && settings_save()!=0 && settings_reset()!=0);
    reset(); assert(settings_init()==0); remove_result=-1; assert(settings_reset()!=0);
    remove_result=VFS_ERR_NOOBJ; assert(settings_reset()==0);
    puts("PASS missing storage and failed reset handled without null dereference");
    puts("12 settings regression groups passed");
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
    print(json.dumps({'test': 'settings', 'groups': 12, 'result': result.stdout}, indent=2))
