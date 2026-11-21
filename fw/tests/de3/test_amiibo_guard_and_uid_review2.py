"""Actual-C regressions for rejected file navigation and recoverable UID errors.

The input handler, scene callback, UID helper and each menu's RAND_UID case are
extracted verbatim from the selected source tree. VFS/NFC/crypto boundaries are
deterministic fault-injection fixtures; no keys, tag dumps, or hardware access.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from root_host import function


def case_block(source, marker):
    start = source.index(marker)
    opening = source.index('{', start)
    depth = 1
    for index in range(opening + 1, len(source)):
        depth += (source[index] == '{') - (source[index] == '}')
        if not depth:
            return source[start:index + 1]
    raise ValueError(marker)


NAVIGATION = r'''
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"CHECK %d: %s\n",__LINE__,#x); return 71; } } while(0)
#define VFS_MAX_NAME_LEN 48
#define VFS_OK 0
#define string_get_cstr(s) (s)
enum { INPUT_KEY_LEFT, INPUT_KEY_CENTER, INPUT_KEY_RIGHT };
enum { INPUT_TYPE_PRESS, INPUT_TYPE_RELEASE, INPUT_TYPE_SHORT, INPUT_TYPE_LONG, INPUT_TYPE_REPEAT };
enum { AMIIBO_DETAIL_VIEW_EVENT_UPDATE, AMIIBO_DETAIL_VIEW_EVENT_MENU };
enum { AMIIBO_SCENE_AMIIBO_DETAIL_MENU = 2 };
typedef struct { unsigned key, type; } mui_input_event_t;
typedef struct { void *user_data; } mui_view_t;
typedef unsigned amiibo_detail_view_event_t;
typedef struct amiibo_detail_view_s {
    uint8_t info_page;
    uint16_t focus,max_ntags,note_offset,note_total;
    int8_t navigate_direction;
    void *user_data;
    void (*event_cb)(amiibo_detail_view_event_t,struct amiibo_detail_view_s *);
} amiibo_detail_view_t;
typedef struct {
    char current_file[48],current_folder[64];
    uint8_t tag[16];
    void *p_scene_dispatcher;
    amiibo_detail_view_t *p_amiibo_detail_view;
} app_amiibo_t;
static bool allow=true,load_ok=true;
static unsigned scans,loads,menus;
static bool amiibo_info_input(uint8_t*p,mui_input_event_t*e) {(void)p;(void)e;return false;}
static bool ntag_emu_prepare_change(void) {return allow;}
static void mui_scene_dispatcher_next_scene(void*d,unsigned id) {(void)d;(void)id;menus++;}
static void amiibo_detail_view_set_focus(amiibo_detail_view_t*v,unsigned n) {v->focus=n;}
static void amiibo_detail_view_set_max_ntags(amiibo_detail_view_t*v,unsigned n) {v->max_ntags=n;}
static void amiibo_scene_amiibo_detail_reload_error(app_amiibo_t*a,const char*p,int32_t e) {(void)a;(void)p;(void)e;}
static int32_t app_amiibo_file_neighbor(app_amiibo_t*a,int8_t direction,char*name,uint16_t*focus,uint16_t*total) {
    unsigned active=0;sscanf(a->current_file,"tag%u.bin",&active);scans++;
    *total=a->p_amiibo_detail_view->max_ntags;
    *focus=(active+*total+(direction<0?-1:1))%*total;
    snprintf(name,48,"tag%u.bin",*focus);return VFS_OK;
}
static bool amiibo_scene_amiibo_detail_reload_ntag(app_amiibo_t*a,const char*name) {
    loads++;if(!load_ok)return false;
    strcpy(a->current_file,name);a->tag[0]++;return true;
}
/*ACTUAL_NAVIGATION*/
int main(int argc,char**argv) {
    CHECK(argc==2);unsigned id=(unsigned)atoi(argv[1]),mode=id/6,direction=(id/3)%2,kind=id%3;
    const unsigned types[]={INPUT_TYPE_SHORT,INPUT_TYPE_LONG,INPUT_TYPE_REPEAT};
    unsigned active=mode==3?(direction?9:0):5;
    app_amiibo_t app={0};amiibo_detail_view_t detail={.focus=active,.max_ntags=10,.user_data=&app,
        .event_cb=app_amiibo_detail_view_on_event};app.p_amiibo_detail_view=&detail;
    strcpy(app.current_folder,"/tags");snprintf(app.current_file,sizeof(app.current_file),"tag%u.bin",active);
    memset(app.tag,0x35,sizeof(app.tag));uint8_t before[16];memcpy(before,app.tag,16);
    mui_view_t view={&detail};mui_input_event_t event={direction?INPUT_KEY_RIGHT:INPUT_KEY_LEFT,types[kind]};
    allow=mode!=0;load_ok=mode!=1;
    amiibo_detail_view_on_input(&view,&event);
    if(mode<2) {
        char expected[48];snprintf(expected,sizeof(expected),"tag%u.bin",active);
        CHECK(!strcmp(app.current_file,expected));CHECK(!memcmp(before,app.tag,16));
        CHECK(detail.focus==active);CHECK(detail.max_ntags==10);
        CHECK(scans==(mode==1));CHECK(loads==(mode==1));
    } else {
        unsigned expected=(active+10+(direction?1:-1))%10;char name[48];snprintf(name,sizeof(name),"tag%u.bin",expected);
        CHECK(detail.focus==expected);CHECK(!strcmp(app.current_file,name));
        CHECK(scans==1&&loads==1&&app.tag[0]==0x36);
    }
    CHECK(!detail.navigate_direction&&!menus);
    printf("PASS file navigation %u: mode=%u direction=%s input=%u focus=%u\n",id,mode,direction?"right":"left",types[kind],detail.focus);
    return 0;
}
'''


UID = r'''
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ntag_def.h"
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"CHECK %d: %s\n",__LINE__,#x); return 71; } } while(0)
#define NRF_SUCCESS 0
#define NRF_ERROR_INVALID_DATA 13
#define NTAG215_SIZE 540
#define UUID_SIZE 7
#define NRF_LOG_WARNING(...) ((void)0)
#define _T(name) #name
#define APP_ERROR_CHECK(code) do {if(code){fatal_errors++;return;}} while(0)
#define AMIIBO_DETAIL_MENU_RAND_UID 1
#define AMIIDB_DETAIL_MENU_RAND_UID 1
typedef unsigned ret_code_t;
typedef struct {int placeholder;} db_amiibo_t;
typedef struct {ntag_t ntag;bool temporary_tag_changed;void*p_toast_view,*p_scene_dispatcher;} app_amiibo_t;
typedef app_amiibo_t app_amiidb_t;
static bool keys=true,known=true,crypto_ok=true;
static unsigned rng_error,fatal_errors,toasts,back,rf_sets,no_keys;
static int amiibo_keys;
static const db_amiibo_t *get_amiibo_by_id(uint32_t h,uint32_t t) {(void)h;(void)t;static db_amiibo_t row;return known?&row:NULL;}
static bool amiibo_helper_is_key_loaded(void){return keys;}
static unsigned ntag_store_uuid_rand(ntag_t*n){n->data[1]++;return rng_error;}
static bool nfc3d_amiibo_unpack(const void*k,const uint8_t*in,uint8_t*out,bool v3){(void)k;(void)v3;memcpy(out,in,NTAG215_SIZE);return crypto_ok;}
static void nfc3d_amiibo_pack(const void*k,const uint8_t*in,uint8_t*out,bool v3){(void)k;(void)v3;memcpy(out,in,NTAG215_SIZE);}
static void amiibo_helper_get_uuid(ntag_t*n,uint8_t*out){memcpy(out,n->data,7);}
static void amiibo_helper_replace_uuid(uint8_t*out,const uint8_t*uuid,bool v3){(void)v3;out[1]=uuid[1];}
static ret_code_t amiibo_helper_set_defaults(uint8_t*out,const uint8_t*uuid,bool v3){(void)out;(void)uuid;(void)v3;return NRF_SUCCESS;}
static void mui_toast_view_show(void*v,const char*s){(void)v;(void)s;toasts++;}
static bool ntag_emu_set_tag(ntag_t*n){(void)n;rf_sets++;return true;}
static void mui_scene_dispatcher_previous_scene(void*v){(void)v;back++;}
static void amiibo_scene_amiibo_detail_no_key_msg(app_amiibo_t*a){(void)a;no_keys++;}
static void amiidb_scene_amiibo_detail_no_key_msg(app_amiidb_t*a){(void)a;no_keys++;}
/*ACTUAL_UID_HELPERS*/
static void file_menu(app_amiibo_t*app){switch(1){/*ACTUAL_FILE_CASE*/}}
static void db_menu(app_amiidb_t*app){switch(1){/*ACTUAL_DB_CASE*/}}
int main(int argc,char**argv){
    CHECK(argc==2);unsigned id=(unsigned)atoi(argv[1]),menu=id/6,mode=id%6;
    app_amiibo_t app={.temporary_tag_changed=true};app.ntag.type=NTAG_215;app.ntag.data[0]=4;app.ntag.data[1]=0x22;
    app.ntag.data[84]=0x10;app.ntag.data[88]=0x20;strcpy((char*)app.ntag.notes,"keep this note");
    if(mode==0)crypto_ok=false;
    if(mode==1)rng_error=18;
    if(mode==2)app.ntag.data[0]=3;
    if(mode==3)keys=false;
    if(mode==4)known=false;
    ntag_t before=app.ntag;
    if(menu)db_menu(&app);else file_menu(&app);
    CHECK(!fatal_errors);
    if(menu)CHECK(app.temporary_tag_changed==(mode!=5));
    if(mode<3){CHECK(toasts==1&&!back&&!rf_sets&&!no_keys);CHECK(!memcmp(&before,&app.ntag,sizeof(before)));}
    else if(mode==3){CHECK(no_keys==1&&!toasts&&!back&&!rf_sets);CHECK(!memcmp(&before,&app.ntag,sizeof(before)));}
    else if(mode==4){CHECK(!no_keys&&!toasts&&!back&&!rf_sets);CHECK(!memcmp(&before,&app.ntag,sizeof(before)));}
    else {CHECK(!toasts&&!no_keys&&back==1&&rf_sets==1);CHECK(app.ntag.data[1]==0x23);CHECK(!memcmp(before.notes,app.ntag.notes,sizeof(before.notes)));}
    printf("PASS random UID %u: menu=%s mode=%u tag-preserved-on-error\n",id,menu?"database":"file",mode);return 0;
}
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fw', type=Path, default=HERE.parents[1])
    parser.add_argument('--out', type=Path)
    parser.add_argument('--expect-original-failures', action='store_true')
    parser.add_argument('--sanitize', action='store_true')
    args = parser.parse_args()
    temporary_output = tempfile.TemporaryDirectory(prefix='amiibo-review2-') if args.out is None else None
    if temporary_output is not None:
        args.out = Path(temporary_output.name)
    src = args.fw.resolve() / 'application/src'
    args.out.mkdir(parents=True, exist_ok=True)
    names = ['app/amiibo/view/amiibo_detail_view.c', 'app/amiibo/scene/amiibo_scene_amiibo_detail.c',
             'app/amiibo/scene/amiibo_scene_amiibo_detail_menu.c',
             'app/amiidb/scene/amiidb_scene_amiibo_detail_menu.c', 'amiibo_helper.c', 'ntag/ntag_def.h']
    hashes = {name: hashlib.sha256((src / name).read_bytes()).hexdigest() for name in names}
    text = {name: (src / name).read_text() for name in names}
    nav = NAVIGATION.replace('/*ACTUAL_NAVIGATION*/',
        function(text[names[1]], 'app_amiibo_detail_view_on_event') + '\n' +
        function(text[names[0]], 'amiibo_detail_view_on_input'))
    helper_source = text['amiibo_helper.c']
    uid_functions = []
    for name in ['to_little_endian_int32', 'is_valid_amiibo_ntag',
                 'amiibo_helper_sign_new_ntag', 'amiibo_helper_rand_amiibo_uuid']:
        # The boolean validator is called earlier in this C unit than its
        # definition. Start at its declaration rather than at that call site.
        selected = helper_source[helper_source.index('bool is_valid_amiibo_ntag('):] \
            if name == 'is_valid_amiibo_ntag' else helper_source
        uid_functions.append(function(selected, name))
    uid = UID.replace('/*ACTUAL_UID_HELPERS*/', '\n'.join(uid_functions))
    uid = uid.replace('/*ACTUAL_FILE_CASE*/', case_block(text[names[2]], 'case AMIIBO_DETAIL_MENU_RAND_UID: {'))
    uid = uid.replace('/*ACTUAL_DB_CASE*/', case_block(text[names[3]], 'case AMIIDB_DETAIL_MENU_RAND_UID: {'))
    cases = []
    for suite, source, count in [('navigation', nav, 24), ('uid', uid, 12)]:
        generated = args.out / f'{suite}.c'
        generated.write_text(source)
        binary = args.out / suite
        cmd = ['gcc', '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
               '-Wno-unused-function', '-Wno-unused-parameter', '-fno-pie', '-no-pie',
               '-I', str(src / 'ntag'), str(generated), '-o', str(binary)]
        if args.sanitize:
            cmd += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer']
        built = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        (args.out / f'{suite}_build.log').write_text(built.stdout + built.stderr)
        if built.returncode:
            raise RuntimeError(built.stdout + built.stderr)
        for case in range(count):
            env = dict(os.environ)
            # This managed runner uses ptrace. LeakSanitizer is unavailable;
            # ASan and UBSan still check invalid accesses and undefined behavior.
            env['ASAN_OPTIONS'] = 'detect_leaks=0'
            ran = subprocess.run([str(binary), str(case)], env=env, capture_output=True, text=True, timeout=15)
            negative = case < 12 if suite == 'navigation' else case % 6 < 3
            expected = 71 if args.expect_original_failures and negative else 0
            cases.append({'suite': suite, 'case': case, 'returncode': ran.returncode,
                          'expected': expected, 'passed': ran.returncode == expected,
                          'stdout': ran.stdout, 'stderr': ran.stderr})
    unchanged = hashes == {name: hashlib.sha256((src / name).read_bytes()).hexdigest() for name in names}
    result = {'passed': all(c['passed'] for c in cases) and unchanged,
              'negative_control': args.expect_original_failures, 'sanitize': args.sanitize,
              'leak_sanitizer': False, 'source_sha256': hashes, 'sources_unchanged': unchanged,
              'cases': cases, 'device_access': False,
              'limits': ['Actual production-C input/callback/UID helpers and menu case bodies.',
                         'Synthetic VFS, NFC, random and crypto boundaries; no target SDK or hardware.',
                         'No physical LCD, radio, flash, or whole-device stack measurement.']}
    (args.out / 'RESULTS.json').write_text(json.dumps(result, indent=2) + '\n')
    print(f"{'PASS' if result['passed'] else 'FAIL'} {len(cases)} cases, "
          f"{sum(c['returncode'] == 71 for c in cases)} reproduced original failures, "
          f"sources unchanged={unchanged}, device_access=False")
    if not result['passed']:
        for case in cases:
            if not case['passed']:
                print(case)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
