"""Actual desktop exit/destructor and settings-kill C; mocked animation registry.

No device access. This verifies a defensive ownership contract, not the cause
of the independently investigated Amiidb navigation allocation failure.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
from test_ui_lifecycle_de3_2 import function

FW = Path(__file__).resolve().parents[2]
FILES = {
    'application/src/app/desktop/view/app_list_view.c': [
        'app_list_view_on_exit', 'app_list_view_free'],
    'application/src/app/settings/app_settings.c': ['app_settings_on_kill'],
}
HARNESS = r'''
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"CHECK line %d: %s\n",__LINE__,#x); exit(71); } } while (0)
#define NRF_SUCCESS 0
#define NRF_LOG_WARNING(...) ((void)0)
enum { MUI_LAYER_WINDOW, MUI_LAYER_FULLSCREEN, MUI_LAYER_TOAST };
typedef struct { int id; } mui_anim_t;
typedef struct { void *user_data; } mui_view_t;
typedef struct { mui_anim_t icon_anim, name_anim; mui_view_t *p_view; } app_list_view_t;
typedef struct {
    bool exit_saved;
    void *p_scene_dispatcher, *p_view_dispatcher, *p_view_dispatcher_toast;
    void *p_list_view, *p_progress_bar, *p_msg_box, *p_toast_view;
} app_settings_t;
typedef struct { void *p_handle; } mini_app_inst_t;
static mui_anim_t *active[2];
static unsigned stops, views_freed, objects_freed, detached, saved;
static bool anim_enabled;
static app_list_view_t *owner;
static app_settings_t *settings_owner;
static bool mui_list_view_anim_enabled(void) { return anim_enabled; }
static void mui_anim_stop(mui_anim_t *anim) {
    CHECK(anim); stops++;
    for (unsigned i=0; i<2; ++i) if (active[i]==anim) active[i]=NULL;
}
static void mui_view_free(mui_view_t *view) {
    CHECK(!active[0] && !active[1]);
    if (view) { CHECK(owner && view==owner->p_view); views_freed++; free(view); }
}
static void mui_mem_free(void *ptr) {
    CHECK(ptr && (ptr==owner || ptr==settings_owner));
    CHECK(!active[0] && !active[1]); objects_freed++; free(ptr);
}
static void mui_nav_diag_end(void) {}
static int32_t settings_save(void) { saved++; return NRF_SUCCESS; }
static void mui_scene_dispatcher_free(void *p) { (void)p; }
static void mui_view_dispatcher_detach(void *p, int layer) {
    CHECK(settings_owner);
    if (p==settings_owner->p_view_dispatcher) CHECK(layer==MUI_LAYER_FULLSCREEN);
    else { CHECK(p==settings_owner->p_view_dispatcher_toast); CHECK(layer==MUI_LAYER_TOAST); }
    detached++;
}
static void mui_view_dispatcher_free(void *p) { (void)p; }
static void mui_list_view_free(void *p) { (void)p; }
static void mui_progress_bar_free(void *p) { (void)p; }
static void mui_msg_box_free(void *p) { (void)p; }
static void mui_toast_view_free(void *p) { (void)p; }
@FUNCTIONS@
static void create_active(void) {
    owner=calloc(1,sizeof(*owner)); CHECK(owner);
    owner->p_view=calloc(1,sizeof(*owner->p_view)); CHECK(owner->p_view);
    owner->p_view->user_data=owner;
    active[0]=&owner->icon_anim; active[1]=&owner->name_anim;
    anim_enabled=true;
}
int main(int argc,char **argv) {
    CHECK(argc==2); unsigned c=(unsigned)atoi(argv[1]);
    if (c==0 || c==1 || c==3 || c==4) {
        create_active(); if(c!=0) anim_enabled=false;
        app_list_view_on_exit(owner->p_view);
        CHECK(!active[0] && !active[1] && stops==2);
        if(c==4) { app_list_view_on_exit(owner->p_view); CHECK(stops==4); }
        app_list_view_free(owner); owner=NULL;
        CHECK(views_freed==1 && objects_freed==1 && !active[0] && !active[1]);
    } else if(c==2) {
        create_active(); anim_enabled=false;
        app_list_view_free(owner); owner=NULL;
        CHECK(stops==2 && views_freed==1 && objects_freed==1);
    } else if(c==5) {
        mui_view_t empty={0}; app_list_view_on_exit(NULL); app_list_view_on_exit(&empty);
        app_list_view_free(NULL); CHECK(!stops && !views_freed && !objects_freed);
    } else if(c==6) {
        settings_owner=calloc(1,sizeof(*settings_owner)); CHECK(settings_owner);
        settings_owner->exit_saved=true;
        settings_owner->p_view_dispatcher=(void*)(uintptr_t)1;
        settings_owner->p_view_dispatcher_toast=(void*)(uintptr_t)2;
        mini_app_inst_t app={settings_owner}; app_settings_on_kill(&app); settings_owner=NULL;
        CHECK(!app.p_handle && detached==2 && objects_freed==1 && !saved);
    } else if(c==7) {
        mini_app_inst_t app={0}; app_settings_on_kill(&app);
        CHECK(!app.p_handle && !detached && !objects_freed && saved==1);
    } else CHECK(false);
    printf("PASS lifecycle case %u\n",c); return 0;
}
'''


def hashes(root):
    return {str(name): hashlib.sha256((root / name).read_bytes()).hexdigest() for name in FILES}


def run(root, sanitize=False, baseline=False):
    pieces = [function((root / path).read_text(encoding='utf-8'), name)
              for path, names in FILES.items() for name in names]
    code = HARNESS.replace('@FUNCTIONS@', '\n'.join(pieces))
    cases = [1, 2, 6] if baseline else list(range(8))
    results = []
    with tempfile.TemporaryDirectory(prefix='pixl-desktop-lifecycle-') as tmp:
        folder = Path(tmp)
        source = folder / 'probe.c'
        source.write_text(code, encoding='utf-8', newline='\n')
        binary = folder / ('probe.exe' if os.name == 'nt' else 'probe')
        command = shlex.split(os.environ.get('CC', 'gcc')) + [
            '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
            '-Wno-unused-function', '-Wno-unused-parameter']
        if sanitize:
            command += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
        build = subprocess.run(command + [str(source), '-o', str(binary)], capture_output=True,
                               text=True, timeout=60)
        assert build.returncode == 0, build.stdout + build.stderr
        for case in cases:
            result = subprocess.run([str(binary), str(case)], capture_output=True, text=True, timeout=15)
            expected = 71 if baseline else 0
            assert result.returncode == expected, (case, result.returncode, result.stdout, result.stderr)
            if baseline:
                assert 'CHECK' in result.stderr
            assert 'AddressSanitizer' not in result.stderr and 'runtime error:' not in result.stderr
            results.append({'case': case, 'returncode': result.returncode, 'expected': expected})
            print(('PASS negative DE331 ' if baseline else 'PASS ') + str(case))
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--baseline-root', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    before = hashes(FW)
    report = {'source_sha256': before, 'sanitize': args.sanitize, 'cases': run(FW, args.sanitize),
              'test_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'limits': ['Real extracted C callbacks; scheduler/animation registry and ancillary UI services mocked.',
                         'Defensive lifecycle contract, no proof of the reported Amiidb allocation failure cause.',
                         'No device action or RF/physical display test.']}
    if args.baseline_root:
        report['negative_source_sha256'] = hashes(args.baseline_root)
        report['negative_control'] = run(args.baseline_root, args.sanitize, True)
    report['source_sha256_after'] = hashes(FW)
    assert before == report['source_sha256_after']
    report['passed'] = True
    if args.output:
        args.output.mkdir(parents=True, exist_ok=True)
        (args.output / 'RESULTS.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('PASS 8 actual-C desktop/settings lifecycle cases')
