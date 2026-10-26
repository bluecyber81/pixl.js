"""Actual VFS directory rename plus real SPIFFS on synthetic NOR; no device access.

Optional --baseline FW expects the preserved source to fail the collision case.
Only reviewed VFS functions are extracted unchanged. Fault cases inject ordinary
SPIFFS API errors; successful storage operations use the complete real backend.
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]

def extract(text, signature):
    start = text.index(signature)
    opening = text.index('{', start)
    depth = 1
    for end in range(opening + 1, len(text)):
        depth += (text[end] == '{') - (text[end] == '}')
        if depth == 0:
            return text[start:end + 1]
    raise ValueError(signature)

BODY = r'''
#include "vfs.h"
#include "cwalk.h"
#include "cwalk2.h"
#define NRF_LOG_INFO(...) ((void)0)
#define VFS_SPIFFS_FOLDER_NAME ".folder"
enum {FAULT_NONE, FAULT_TARGET_STAT, FAULT_CHILD_STAT, FAULT_OPEN_DIR,
      FAULT_READ_DIR, FAULT_CLOSE_DIR, FAULT_RENAME_SECOND};
static int fault;
static unsigned rename_calls;
static int review_stat(spiffs *f,const char *path,spiffs_stat *st) {
    if ((fault==FAULT_TARGET_STAT && !strcmp(path,"/target")) ||
        (fault==FAULT_CHILD_STAT && !strcmp(path,"/target/b.bin"))) {
        f->err_code=SPIFFS_ERR_INTERNAL;return SPIFFS_ERR_INTERNAL;
    }
    return SPIFFS_stat(f,path,st);
}
static spiffs_DIR *review_opendir(spiffs *f,const char *path,spiffs_DIR *d) {
    if(fault==FAULT_OPEN_DIR){f->err_code=SPIFFS_ERR_INTERNAL;return NULL;}
    return SPIFFS_opendir(f,path,d);
}
static struct spiffs_dirent *review_readdir(spiffs_DIR *d,struct spiffs_dirent *e) {
    if(fault==FAULT_READ_DIR){fs.err_code=SPIFFS_ERR_INTERNAL;return NULL;}
    return SPIFFS_readdir(d,e);
}
static int review_closedir(spiffs_DIR *d) {
    int result=SPIFFS_closedir(d);
    return fault==FAULT_CLOSE_DIR ? SPIFFS_ERR_INTERNAL : result;
}
static int review_rename(spiffs *f,const char *from,const char *to) {
    rename_calls++;
    if(fault==FAULT_RENAME_SECOND && rename_calls==2){f->err_code=SPIFFS_ERR_INTERNAL;return SPIFFS_ERR_INTERNAL;}
    return SPIFFS_rename(f,from,to);
}
#define SPIFFS_stat review_stat
#define SPIFFS_opendir review_opendir
#define SPIFFS_readdir review_readdir
#define SPIFFS_closedir review_closedir
#define SPIFFS_rename review_rename
@@STRUCTURE@@
@@FUNCTIONS@@
#undef SPIFFS_stat
#undef SPIFFS_opendir
#undef SPIFFS_readdir
#undef SPIFFS_closedir
#undef SPIFFS_rename
static void seed(const char *path,uint8_t value) {
    uint8_t data[7],meta[128];memset(data,value,sizeof(data));memset(meta,value,sizeof(meta));
    spiffs_file f=SPIFFS_open(&fs,path,SPIFFS_CREAT|SPIFFS_WRONLY,0);assert(f>=0);
    assert(SPIFFS_write(&fs,f,data,sizeof(data))==(int)sizeof(data));assert(SPIFFS_close(&fs,f)==0);
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
int main(int argc,char **argv){
    assert(argc==2);const char *scenario=argv[1];
    capacity=4u*1024u*1024u;flash=malloc(capacity);assert(flash);memset(flash,255,capacity);
    assert(mount_fs()==0);SPIFFS_unmount(&fs);assert(SPIFFS_format(&fs)==0);assert(mount_fs()==0);
    seed("/source/a.bin",0x31);seed("/source/b.bin",0x42);
    seed("/source2/keep.bin",0x53);seed("/target2/keep.bin",0x64);
    const char *from="/source",*to="/target";
    int expected_error=VFS_ERR_OBJEX;
    bool success=false,late_failure=false;
    if(!strcmp(scenario,"collision"))seed("/target/b.bin",0x75);
    else if(!strcmp(scenario,"existing_file"))seed("/target",0x75);
    else if(!strcmp(scenario,"existing_marker"))seed("/target/.folder",0x75);
    else if(!strcmp(scenario,"existing_implicit"))seed("/target/unrelated.bin",0x75);
    else if(!strcmp(scenario,"self")){to=from;expected_error=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"self_slash")){to="/source/";expected_error=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"descendant")){to="/source/sub";expected_error=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"descendant_slash")){from="/source/";to="/source/sub/";expected_error=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"long_child")){
        seed("/source/nested_1234567890/file.bin",0x75);
        to="/target_123456789012345678901234567890123456789";expected_error=VFS_ERR_MAXNM;
    }
    else if(!strcmp(scenario,"target_stat_error")){fault=FAULT_TARGET_STAT;expected_error=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"child_stat_error")){fault=FAULT_CHILD_STAT;expected_error=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"open_dir_error")){fault=FAULT_OPEN_DIR;expected_error=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"read_dir_error")){fault=FAULT_READ_DIR;expected_error=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"close_dir_error")){fault=FAULT_CLOSE_DIR;expected_error=VFS_ERR_FAIL;}
    else if(!strcmp(scenario,"late_rename_error")){fault=FAULT_RENAME_SECOND;expected_error=VFS_ERR_FAIL;late_failure=true;}
    else if(!strcmp(scenario,"normal")){success=true;}
    else if(!strcmp(scenario,"trailing_slashes")){from="/source/";to="/target/";success=true;}
    else if(!strcmp(scenario,"common_prefix")){to="/source_new";success=true;}
    else assert(0);
    uint8_t *before=malloc(capacity);assert(before);memcpy(before,flash,capacity);
    unsigned writes_before=writes;
    int result=vfs_spiffs_rename_dir(from,to);
    fault=FAULT_NONE;
    if(success){
        assert(result==VFS_OK && rename_calls==2);
        const char *prefix=!strcmp(scenario,"common_prefix")?"/source_new":"/target";
        char path[64];snprintf(path,sizeof(path),"%s/a.bin",prefix);verify(path,0x31);
        snprintf(path,sizeof(path),"%s/b.bin",prefix);verify(path,0x42);
        assert(!exists("/source/a.bin") && !exists("/source/b.bin"));
    }else if(late_failure){
        assert(result==expected_error && rename_calls==2);
        verify("/target/a.bin",0x31);verify("/source/b.bin",0x42);
        puts("LIMIT: underlying multi-file rename is not power-loss/I-O atomic; late failure is reported.");
    }else{
        assert(rename_calls==0 && writes==writes_before && !memcmp(before,flash,capacity));
        assert(result==expected_error);
        verify("/source/a.bin",0x31);verify("/source/b.bin",0x42);
    }
    verify("/source2/keep.bin",0x53);verify("/target2/keep.bin",0x64);
    printf("PASS %s result=%d rename_calls=%u\n",scenario,result,rename_calls);
    SPIFFS_unmount(&fs);assert(mount_fs()==0);
    verify("/source2/keep.bin",0x53);verify("/target2/keep.bin",0x64);
    SPIFFS_unmount(&fs);free(before);free(flash);
}
'''

def build(fw, folder, name):
    src=fw/'application/src'
    driver=src/'mod/vfs/vfs_driver_spiffs.c'
    source=driver.read_text(encoding='utf-8')
    fixture=(HERE/'spiffs_integration.c').read_text(encoding='utf-8')
    prefix=fixture[:fixture.index('static void pattern(')]
    structure=source[source.index('typedef struct {'):source.index('} vfs_spiffs_dir_t;')+len('} vfs_spiffs_dir_t;')]
    signatures=['static s32_t vfs_spiffs_map_error_code(', 'static int32_t vfs_check_file_path(',
                'static int32_t vfs_check_folder_path(', 'int32_t vfs_spiffs_rename_dir_internal(',
                'int32_t vfs_spiffs_rename_dir(']
    if 'static int32_t vfs_check_namespace(' in source:
        signatures.insert(1, 'static int32_t vfs_check_namespace(')
    code=prefix+BODY.replace('@@STRUCTURE@@',structure).replace('@@FUNCTIONS@@','\n'.join(extract(source,s) for s in signatures))
    c=folder/(name+'.c');c.write_text(code)
    exe=folder/(name+'.exe')
    spiffs=fw/'components/spiffs/src'
    command=['gcc','-std=c11','-O1','-g','-include','stdint.h']
    for path in [folder,src/'mod/vfs',src/'mod',spiffs,fw/'components/cwalk/include']:
        command+=['-I',str(path)]
    command+=[str(c),str(src/'mod/cwalk2.c'),str(fw/'components/cwalk/src/cwalk.c')]
    command+=list(map(str,sorted(spiffs.glob('*.c'))))+['-o',str(exe)]
    compile_result=subprocess.run(command,capture_output=True,text=True,timeout=90)
    assert compile_result.returncode==0,compile_result.stdout+compile_result.stderr
    return exe,hashlib.sha256(driver.read_bytes()).hexdigest()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--baseline',type=Path)
    parser.add_argument('--report',type=Path)
    args=parser.parse_args()
    report={'device_access':False,'source_root':str(FW),'cases':[],
            'limits':['Host synthetic NOR, no physical flash or power interruption.','Multi-file rename remains non-atomic after preflight.']}
    with tempfile.TemporaryDirectory(prefix='pixl-directory-rename-') as temporary:
        folder=Path(temporary);(folder/'boards.h').write_text('')
        exe,report['driver_sha256']=build(FW,folder,'candidate')
        scenarios=['collision','existing_file','existing_marker','existing_implicit','self','self_slash',
                   'descendant','descendant_slash','long_child','target_stat_error','child_stat_error',
                   'open_dir_error','read_dir_error','close_dir_error','late_rename_error',
                   'normal','trailing_slashes','common_prefix']
        for name in scenarios:
            run=subprocess.run([str(exe),name],capture_output=True,text=True,timeout=30)
            report['cases'].append({'name':name,'exit_code':run.returncode,'output':run.stdout+run.stderr})
            print(run.stdout+run.stderr,end='',flush=True)
            if run.returncode:break
        if args.baseline:
            base,source_hash=build(args.baseline.resolve(),folder,'baseline')
            run=subprocess.run([str(base),'collision'],capture_output=True,text=True,timeout=30)
            report['negative_control']={'driver_sha256':source_hash,'exit_code':run.returncode,'output':run.stdout+run.stderr,
                                        'rejected':run.returncode!=0}
            print('BASELINE negative control:', 'EXPECTED FAILURE' if run.returncode else 'UNEXPECTED PASS',flush=True)
    report['passed']=len(report['cases'])==len(scenarios) and all(case['exit_code']==0 for case in report['cases'])
    if args.baseline:report['passed'] &= report['negative_control']['rejected']
    if args.report:args.report.write_text(json.dumps(report,indent=2)+'\n')
    assert report['passed'],report
    print('PASS 18 actual-SPIFFS directory rename cases' + (' and baseline negative control' if args.baseline else ''))

if __name__=='__main__':main()
