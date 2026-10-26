"""Real SPIFFS namespace preflight: preserve bytes on file/directory collisions.

Uses unchanged extracted VFS routines and a synthetic NOR. --baseline proves
the three original collisions on a preserved source; never accesses a device.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]


def extract(text, signature):
    start = text.index('\n' + signature) + 1
    opening = text.index('{', start)
    depth = 1
    for end in range(opening + 1, len(text)):
        depth += (text[end] == '{') - (text[end] == '}')
        if not depth:
            return text[start:end + 1]
    raise ValueError(signature)


BODY = r'''
#include "vfs.h"
#include "cwalk.h"
#include "cwalk2.h"
#define NRF_LOG_INFO(...) ((void)0)
#define VFS_SPIFFS_FOLDER_NAME ".folder"
enum {FAULT_NONE, FAULT_OPEN, FAULT_READ, FAULT_CLOSE, FAULT_STAT};
static int fault;
static unsigned scans;
static int review_stat(spiffs *f,const char *path,spiffs_stat *st) {
    if(fault==FAULT_STAT){f->err_code=SPIFFS_ERR_INTERNAL;return SPIFFS_ERR_INTERNAL;}
    return SPIFFS_stat(f,path,st);
}
static spiffs_DIR *review_opendir(spiffs *f,const char *path,spiffs_DIR *d) {
    ++scans;
    if(fault==FAULT_OPEN){f->err_code=SPIFFS_ERR_INTERNAL;return NULL;}
    return SPIFFS_opendir(f,path,d);
}
static struct spiffs_dirent *review_readdir(spiffs_DIR *d,struct spiffs_dirent *e) {
    if(fault==FAULT_READ){fs.err_code=SPIFFS_ERR_INTERNAL;return NULL;}
    return SPIFFS_readdir(d,e);
}
static int review_closedir(spiffs_DIR *d) {
    int result=SPIFFS_closedir(d);
    return fault==FAULT_CLOSE ? SPIFFS_ERR_INTERNAL : result;
}
#define SPIFFS_opendir review_opendir
#define SPIFFS_readdir review_readdir
#define SPIFFS_closedir review_closedir
#define SPIFFS_stat review_stat
@@STRUCTURE@@
@@FUNCTIONS@@
#undef SPIFFS_opendir
#undef SPIFFS_readdir
#undef SPIFFS_closedir
#undef SPIFFS_stat

static void seed(const char *path,uint8_t value) {
    uint8_t data[7],meta[128];memset(data,value,sizeof(data));memset(meta,value,sizeof(meta));
    spiffs_file f=SPIFFS_open(&fs,path,SPIFFS_CREAT|SPIFFS_WRONLY,0);assert(f>=0);
    assert(SPIFFS_write(&fs,f,data,sizeof(data))==7);assert(SPIFFS_close(&fs,f)==0);
    assert(SPIFFS_update_meta(&fs,path,meta)==0);
}
static void verify(const char *path,uint8_t value) {
    uint8_t data[8];spiffs_stat st;
    spiffs_file f=SPIFFS_open(&fs,path,SPIFFS_RDONLY,0);assert(f>=0);
    assert(SPIFFS_read(&fs,f,data,sizeof(data))==7);assert(SPIFFS_close(&fs,f)==0);
    assert(SPIFFS_stat(&fs,path,&st)==0 && st.size==7);
    for(unsigned i=0;i<7;i++)assert(data[i]==value);
    for(unsigned i=0;i<128;i++)assert(st.meta[i]==value);
}
static int exists(const char *path){spiffs_stat st;return SPIFFS_stat(&fs,path,&st)==0;}
int main(int argc,char **argv) {
    assert(argc==2);const char *scenario=argv[1];
    /* Match the embedded target even when this harness runs on Windows. */
    cwk_path_set_style(CWK_STYLE_UNIX);
    capacity=2u*1024u*1024u;flash=malloc(capacity);assert(flash);memset(flash,255,capacity);
    assert(mount_fs()==0);SPIFFS_unmount(&fs);assert(SPIFFS_format(&fs)==0);assert(mount_fs()==0);
    seed("/source",0x31);seed("/source_dir/.folder",0x42);seed("/source_dir/file",0x53);
    seed("/unrelated",0x64);seed("/target2/keep",0x75);
    const char *target="/target",*keep=NULL;
    enum {MKDIR,CREATE,WRITE_DATA,RENAME_FILE,RENAME_DIR,READ_FILE,WRITE_EXISTING} operation=CREATE;
    int expected=VFS_ERR_OBJEX;
    bool allowed=false,overwrite=false;
    if(!strcmp(scenario,"mkdir_over_file")){operation=MKDIR;keep="/target";}
    else if(!strcmp(scenario,"create_file_over_dir")){keep="/target/.folder";}
    else if(!strcmp(scenario,"create_file_over_implicit_dir")){keep="/target/child";}
    else if(!strcmp(scenario,"write_data_over_dir")){operation=WRITE_DATA;keep="/target/.folder";}
    else if(!strcmp(scenario,"rename_file_over_dir")){operation=RENAME_FILE;keep="/target/.folder";}
    else if(!strcmp(scenario,"rename_file_over_implicit_dir")){operation=RENAME_FILE;keep="/target/child";}
    else if(!strcmp(scenario,"mkdir_under_file")){operation=MKDIR;target="/target/child";keep="/target";}
    else if(!strcmp(scenario,"create_under_file")){target="/target/child";keep="/target";}
    else if(!strcmp(scenario,"write_data_under_file")){operation=WRITE_DATA;target="/target/child";keep="/target";}
    else if(!strcmp(scenario,"rename_file_under_file")){operation=RENAME_FILE;target="/target/child";keep="/target";}
    else if(!strcmp(scenario,"rename_dir_under_file")){operation=RENAME_DIR;target="/target/child";keep="/target";}
    else if(!strcmp(scenario,"rename_file_under_self")){operation=RENAME_FILE;target="/source/child";}
    else if(!strcmp(scenario,"create_trailing_existing")){target="/target/";keep="/target";expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"write_data_trailing_existing")){operation=WRITE_DATA;target="/target/";keep="/target";expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"rename_file_trailing_existing")){operation=RENAME_FILE;target="/target/";keep="/target";expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"create_trailing_new")){target="/target/";expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"write_data_trailing_new")){operation=WRITE_DATA;target="/target/";expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"rename_file_trailing_new")){operation=RENAME_FILE;target="/target/";expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"create_double_separator")){target="/target//child";keep="/target/child";expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"write_data_double_separator")){operation=WRITE_DATA;target="/target//child";keep="/target/child";expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"mkdir_double_separator")){operation=MKDIR;target="/target//child";keep="/target/child";expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"rename_file_double_separator")){operation=RENAME_FILE;target="/target//child";keep="/target/child";expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"rename_dir_double_separator")){operation=RENAME_DIR;target="/target//child";keep="/target/child";expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"create_leading_double_separator")){target="//target";expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"mkdir_interior_and_trailing_separators")){operation=MKDIR;target="/target//child///";expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"mkdir_normal")){operation=MKDIR;allowed=true;}
    else if(!strcmp(scenario,"mkdir_implicit")){operation=MKDIR;keep="/target/child";allowed=true;}
    else if(!strcmp(scenario,"mkdir_trailing_slash")){operation=MKDIR;target="/target/";allowed=true;}
    else if(!strcmp(scenario,"mkdir_trailing_slashes")){operation=MKDIR;target="/target///";allowed=true;}
    else if(!strcmp(scenario,"mkdir_existing")){operation=MKDIR;keep="/target/.folder";expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"create_normal")){allowed=true;}
    else if(!strcmp(scenario,"create_in_dir")){target="/target/file";keep="/target/.folder";allowed=true;}
    else if(!strcmp(scenario,"create_overwrite")){keep="/target";allowed=overwrite=true;}
    else if(!strcmp(scenario,"write_data_overwrite")){operation=WRITE_DATA;keep="/target";allowed=overwrite=true;}
    else if(!strcmp(scenario,"rename_file_normal")){operation=RENAME_FILE;allowed=true;}
    else if(!strcmp(scenario,"rename_dir_normal")){operation=RENAME_DIR;allowed=true;}
    else if(!strcmp(scenario,"rename_dir_trailing_slashes")){operation=RENAME_DIR;target="/target///";allowed=true;}
    else if(!strcmp(scenario,"rename_file_over_file")){operation=RENAME_FILE;keep="/target";expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"read_only_no_scan")){operation=READ_FILE;target="/source";fault=FAULT_OPEN;allowed=true;}
    else if(!strcmp(scenario,"write_existing_no_scan")){operation=WRITE_EXISTING;target="/source";fault=FAULT_OPEN;allowed=true;}
    else if(!strcmp(scenario,"read_historical_double_separator")){operation=READ_FILE;target=keep="/target//child";fault=FAULT_OPEN;allowed=true;}
    else if(!strcmp(scenario,"write_historical_double_separator")){operation=WRITE_EXISTING;target=keep="/target//child";fault=FAULT_OPEN;allowed=true;}
    else if(!strcmp(scenario,"create_historical_double_separator")){target=keep="/target//child";fault=FAULT_OPEN;allowed=overwrite=true;}
    else if(!strcmp(scenario,"write_data_historical_double_separator")){operation=WRITE_DATA;target=keep="/target//child";fault=FAULT_OPEN;allowed=overwrite=true;}
    else if(!strcmp(scenario,"open_error")){fault=FAULT_OPEN;expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"read_error")){fault=FAULT_READ;expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"close_error")){fault=FAULT_CLOSE;expected=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"stat_error")){fault=FAULT_STAT;expected=VFS_ERR_FAIL;}
    else assert(0);
    if(keep)seed(keep,0x86);
    uint8_t *before=malloc(capacity);assert(before);memcpy(before,flash,capacity);
    unsigned writes_before=writes,erases_before=erases;
    int result;vfs_file_t fd={(void*)(intptr_t)-1};uint8_t data[7];memset(data,0xa9,sizeof(data));
    if(operation==MKDIR)result=vfs_spiffs_create_dir(target);
    else if(operation==RENAME_FILE)result=vfs_spiffs_rename_file("/source",target);
    else if(operation==RENAME_DIR)result=vfs_spiffs_rename_dir("/source_dir",target);
    else if(operation==WRITE_DATA)result=vfs_spiffs_write_file_data(target,data,sizeof(data));
    else {
        unsigned flags=operation==READ_FILE ? VFS_MODE_READONLY : operation==WRITE_EXISTING ? VFS_MODE_WRITEONLY :
                       VFS_MODE_CREATE|VFS_MODE_WRITEONLY|VFS_MODE_TRUNC;
        result=vfs_spiffs_open_file(target,&fd,flags);
        if(result==VFS_OK) {
            if(operation==CREATE)assert(vfs_spiffs_write_file(&fd,data,sizeof(data))==7);
            assert(vfs_spiffs_close_file(&fd)==VFS_OK);
        }
    }
    fault=FAULT_NONE;
    if(!allowed){
        assert(result==expected);
        assert(writes==writes_before && erases==erases_before && !memcmp(before,flash,capacity));
        verify("/source",0x31);verify("/source_dir/.folder",0x42);verify("/source_dir/file",0x53);
    }else{
        assert(result==(operation==WRITE_DATA ? 7 : VFS_OK));
        if(operation==MKDIR){assert(exists("/target/.folder"));assert(!exists("/target//.folder"));}
        else if(operation==RENAME_FILE){verify(target,0x31);assert(!exists("/source"));}
        else if(operation==RENAME_DIR){verify("/target/.folder",0x42);verify("/target/file",0x53);assert(!exists("/source_dir/file"));}
        else if(operation==READ_FILE || operation==WRITE_EXISTING){assert(scans==0);verify(target,keep ? 0x86 : 0x31);}
        else {
            uint8_t actual[7];spiffs_stat st;
            spiffs_file f=SPIFFS_open(&fs,target,SPIFFS_RDONLY,0);assert(f>=0);
            assert(SPIFFS_read(&fs,f,actual,sizeof(actual))==7 && !memcmp(actual,data,sizeof(actual)));
            assert(SPIFFS_close(&fs,f)==0);
            assert(SPIFFS_stat(&fs,target,&st)==0 && st.size==7);
            if(overwrite)for(unsigned i=0;i<128;i++)assert(st.meta[i]==0x86);
        }
    }
    if(overwrite)assert(scans==0);
    if(keep && !overwrite)verify(keep,0x86);
    verify("/unrelated",0x64);verify("/target2/keep",0x75);
    SPIFFS_unmount(&fs);assert(mount_fs()==0);
    if(keep && !overwrite)verify(keep,0x86);
    verify("/unrelated",0x64);verify("/target2/keep",0x75);
    printf("PASS %s result=%d scans=%u no_unrelated_changes=1\n",scenario,result,scans);
    SPIFFS_unmount(&fs);free(before);free(flash);return 0;
}
'''


def build(fw, folder, name, sanitize=False):
    src = fw / 'application/src'
    driver = src / 'mod/vfs/vfs_driver_spiffs.c'
    source = driver.read_text(encoding='utf-8')
    prefix = (HERE / 'spiffs_integration.c').read_text().split('static void pattern(', 1)[0]
    structure = source[source.index('typedef struct {'):source.index('} vfs_spiffs_dir_t;') + len('} vfs_spiffs_dir_t;')]
    signatures = ['static s32_t vfs_spiffs_map_error_code(', 'static int32_t vfs_check_file_path(',
                  'static int32_t vfs_check_folder_path(']
    if 'static int32_t vfs_check_namespace(' in source:
        signatures += ['static int32_t vfs_check_namespace(']
    signatures += ['int32_t vfs_spiffs_create_dir(', 'int32_t vfs_spiffs_open_file(',
                   'int32_t vfs_spiffs_close_file(', 'int32_t vfs_spiffs_write_file(',
                   'int32_t vfs_spiffs_write_file_data(', 'int32_t vfs_spiffs_rename_file(',
                   'int32_t vfs_spiffs_rename_dir_internal(', 'int32_t vfs_spiffs_rename_dir(']
    code = prefix + BODY.replace('@@STRUCTURE@@', structure).replace('@@FUNCTIONS@@', '\n'.join(extract(source, s) for s in signatures))
    c = folder / (name + '.c')
    c.write_text(code, encoding='utf-8')
    exe = folder / (name + ('.exe' if os.name == 'nt' else ''))
    spiffs = fw / 'components/spiffs/src'
    command = ['gcc', '-std=c11', '-O1', '-g', '-include', 'stdint.h', '-Wall', '-Wextra',
               '-Wno-unused-function', '-Wno-unused-parameter', '-Wno-sign-compare']
    if sanitize:
        command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
    for path in [folder, src / 'mod/vfs', src / 'mod', spiffs, fw / 'components/cwalk/include']:
        command += ['-I', str(path)]
    command += [str(c), str(src / 'mod/cwalk2.c'), str(fw / 'components/cwalk/src/cwalk.c')]
    command += list(map(str, sorted(spiffs.glob('*.c')))) + ['-o', str(exe)]
    built = subprocess.run(command, capture_output=True, text=True, timeout=90)
    assert built.returncode == 0, built.stdout + built.stderr
    return exe, hashlib.sha256(driver.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--sanitize', action='store_true')
    args = parser.parse_args()
    scenarios = ['mkdir_over_file', 'create_file_over_dir', 'create_file_over_implicit_dir', 'write_data_over_dir',
                 'rename_file_over_dir', 'rename_file_over_implicit_dir', 'mkdir_under_file', 'create_under_file',
                 'write_data_under_file', 'rename_file_under_file', 'rename_dir_under_file', 'rename_file_under_self',
                 'create_trailing_existing', 'write_data_trailing_existing', 'rename_file_trailing_existing',
                 'create_trailing_new', 'write_data_trailing_new', 'rename_file_trailing_new',
                 'create_double_separator', 'write_data_double_separator', 'mkdir_double_separator',
                 'rename_file_double_separator', 'rename_dir_double_separator', 'create_leading_double_separator',
                 'mkdir_interior_and_trailing_separators',
                 'mkdir_normal', 'mkdir_implicit', 'mkdir_trailing_slash', 'mkdir_trailing_slashes', 'mkdir_existing', 'create_normal',
                 'create_in_dir', 'create_overwrite', 'write_data_overwrite', 'rename_file_normal', 'rename_dir_normal',
                 'rename_dir_trailing_slashes', 'rename_file_over_file', 'read_only_no_scan', 'write_existing_no_scan',
                 'read_historical_double_separator', 'write_historical_double_separator',
                 'create_historical_double_separator', 'write_data_historical_double_separator',
                 'open_error', 'read_error', 'close_error', 'stat_error']
    report = {'device_access': False, 'source_root': str(FW), 'sanitize': args.sanitize, 'cases': [],
              'limits': ['Synthetic NOR and real SPIFFS; not physical flash, radio or power-loss proof.',
                         'No attempt to repair pre-existing ambiguous names; existing data is preserved.',
                         'New file names require one read-only scan; existing regular files use a stat fast path.',
                         'Read-only and non-CREATE opens do not perform namespace lookups.']}
    with tempfile.TemporaryDirectory(prefix='pixl-vfs-namespace-') as temp:
        folder = Path(temp)
        (folder / 'boards.h').write_text('')
        exe, report['source_sha256'] = build(FW, folder, 'candidate', args.sanitize)
        for case in scenarios:
            run = subprocess.run([str(exe), case], capture_output=True, text=True, timeout=30)
            report['cases'].append({'name': case, 'exit_code': run.returncode, 'output': run.stdout + run.stderr})
            print(run.stdout + run.stderr, end='', flush=True)
            if run.returncode:
                break
        if args.baseline:
            old, report['baseline_sha256'] = build(args.baseline.resolve(), folder, 'baseline', args.sanitize)
            report['negative_controls'] = []
            for case in ('mkdir_over_file', 'create_file_over_dir', 'rename_file_over_dir',
                         'create_double_separator', 'write_data_double_separator', 'mkdir_double_separator',
                         'rename_file_double_separator', 'rename_dir_double_separator'):
                run = subprocess.run([str(old), case], capture_output=True, text=True, timeout=30)
                report['negative_controls'].append({'name': case, 'exit_code': run.returncode, 'output': run.stdout + run.stderr})
                print('BASELINE', case, 'EXPECTED FAILURE' if run.returncode else 'UNEXPECTED PASS', flush=True)
    report['passed'] = len(report['cases']) == len(scenarios) and all(c['exit_code'] == 0 for c in report['cases'])
    if args.baseline:
        report['passed'] &= all(c['exit_code'] != 0 for c in report['negative_controls'])
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    assert report['passed'], report
    print('PASS', len(scenarios), 'namespace cases; data and metadata preserved')


if __name__ == '__main__':
    main()
