#!/usr/bin/env python3
"""Regression: old-context input must not reach a new foreground app.

Reuses the earlier actual-C desktop lifecycle harness, extends the boundary with
the production SDK debounce port, BSP, translation, queue and list input body.
Timer/GPIO registers remain ideal, deterministic host services.

Run directly without arguments from any working directory. The default requires
context isolation for all 21 cases; original stale-input behavior is a failure.
The source-derived C bodies and scenario template are retained unchanged.
Use --output to retain generated C, executable, source hashes and detailed logs.
Without --output, artifacts live only in a TemporaryDirectory.
PIXL_SANITIZE=1 or --sanitize enables ASan/UBSan; leak detection is excluded.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import main_menu_return_context_support as menu

HARNESS = Path(__file__).with_name("main_menu_return_context.c.in")


def replace_function(text, name, replacement):
    old = menu.function(text, name)
    assert text.count(old) == 1, name
    return text.replace(old, replacement)


def run(args):
    args.output.mkdir(parents=True, exist_ok=True)
    code, hashes = menu.assemble(args.root)
    src = args.root / "fw/application/src"

    def read(path):
        p = src / path
        hashes[path] = hashlib.sha256(p.read_bytes()).hexdigest()
        return menu.strip_includes(p.read_text())

    # Substitute the SDK fixture's explicit GPIO/timer boundary for the former
    # no-op timers. Registers and deadlines are modeled, no physical IRQ claim.
    timer_fixture = args.root / "fw/tests/de3/button_sdk_debounce_host.c"
    timer = timer_fixture.read_text().split("#define btn_state_t sdk_btn_state_t", 1)[0]
    timer = timer.replace("registered[7]", "registered[16]").replace("registered_count<7", "registered_count<16")
    for name in ["app_timer_create", "app_timer_start", "app_timer_stop"]:
        code = replace_function(code, name, "")
    for macro in re.findall(r"^#define\s+(\w+)", timer, re.M):
        code = re.sub(r"^#define\s+" + re.escape(macro) + r"(?:\s|\().*\n", "", code, flags=re.M)
    code = code.replace("typedef int bsp_event_t;", timer + "\ntypedef int bsp_event_t;")
    code = code.replace("uint32_t app_enable_bits;", "uint32_t app_enable_bits; bool swap_buttons;")
    code = code.replace("outstanding, updates, menu_enters", "outstanding, menu_enters")
    code = code.replace("static bool deny_prepare, start_fails, recovery;", "static bool deny_prepare, start_fails, recovery;\nstatic void (*save_hook)(void), (*run_hook)(void);")
    code = replace_function(code, "fixture_app_prepare", """static bool fixture_app_prepare(mini_app_inst_t *inst, mini_app_exit_reason_t reason) {
    if(save_hook) { void (*hook)(void)=save_hook; save_hook=NULL; hook(); }
    return !deny_prepare;
}""")
    core = read("mui/mui_core.c")
    code = replace_function(code, "mui_update", menu.function(core, "mui_update"))
    code = replace_function(code, "mui_post", menu.function(core, "mui_post"))
    # Extend the explicit list storage boundary with fields consumed by the
    # complete real list-input function. Selection callback is still real Home.
    old = "typedef struct { void *user_data; mui_list_item_t *items[2]; } mui_list_view_t;"
    assert old in code
    code = code.replace(old, """typedef struct mui_list_view_s mui_list_view_t;
struct mui_list_view_s {
    void *user_data; mui_list_item_t *items[11];
    uint16_t focus_index, scroll_offset;
    uint8_t canvas_height, canvas_width, anim_type;
    int16_t anim_value; mui_anim_t anim;
    void (*selected_cb)(mui_list_view_event_t, mui_list_view_t *, mui_list_item_t *);
};""")
    code = code.replace("mui_list_item_t home;", "mui_list_item_t home, rows[10];")
    code = replace_function(code, "mui_list_item_array_size", "static size_t mui_list_item_array_size(mui_list_item_t **items) { return 11; }")
    code = replace_function(code, "mui_list_item_array_get", "static mui_list_item_t *mui_list_item_array_get(mui_list_item_t **items, size_t i) { CHECK(i<11); return items[i]; }")
    list_source = read("mui/view/mui_list_view.c")
    list_input = """
#define LIST_ITEM_HEIGHT 13
#define LIST_ANIM_SHORT_TIME 150
#define LIST_ANIM_LONG_TIME 300
#define LIST_ANIM_FOCUS 0
#define LIST_ANIM_SCROLL 1
static void mui_list_view_start_text_anim(mui_list_view_t *list) {}
static void list_anim_exec(void *p, int32_t value) { ((mui_list_view_t *)p)->anim_value=(int16_t)value; }
""" + menu.function(list_source, "mui_list_view_on_input")
    code = replace_function(code, "fixture_menu_input", list_input + "\n" + """static void fixture_menu_input(mui_view_t *view,mui_input_event_t *event) {
    fixture_app_t *a=view->user_data;
    mui_view_t list_view={.user_data=&a->list};
    mui_list_view_on_input(&list_view,event);
}""")
    insert = """
    for(unsigned n=0;n<10;n++) a->list.items[n]=&a->rows[n];
    a->list.items[10]=&a->home; a->list.focus_index=10;
    a->list.canvas_height=51; a->list.canvas_width=128;
    a->list.selected_cb=chameleon_scene_menu_on_event;
    mui_anim_init(&a->list.anim); mui_anim_set_var(&a->list.anim,&a->list);
    mui_anim_set_exec_cb(&a->list.anim,list_anim_exec);
"""
    assert code.count("a->list.user_data=a;") == 1
    code = code.replace("a->list.user_data=a;", "a->list.user_data=a;" + insert)
    run_body = menu.function(code, "fixture_app_run")
    run_new = run_body.replace("if(start_fails && !inst->p_app->sys) return;", """if(run_hook && !inst->p_app->sys) { void (*hook)(void)=run_hook; run_hook=NULL; hook(); }
    if(start_fails && !inst->p_app->sys) return;""")
    run_new = run_new.replace("MUI_LAYER_WINDOW", "MUI_LAYER_FULLSCREEN")
    run_new = run_new.replace("a->p_view->user_data=a; a->p_view->input_cb=fixture_menu_input;",
                              "a->p_view->user_data=&a->list; a->p_view->input_cb=mui_list_view_on_input;")
    code = code.replace(run_body, run_new)
    kill = menu.function(code, "fixture_app_kill")
    code = code.replace(kill, kill.replace("fixture_app_t *a=inst->p_handle;", "fixture_app_t *a=inst->p_handle;\n    mui_anim_stop(&a->list.anim);").replace("MUI_LAYER_WINDOW", "MUI_LAYER_FULLSCREEN"))
    extra = """
static unsigned raw_counts[3][5], delivered_counts[3][5];
static unsigned trace_sequence;
static unsigned current_app_id(void) {
    mini_app_inst_t *p=mini_app_launcher()->p_main_app_inst; return p ? p->p_app->id : UINT32_MAX;
}
static void app_util_critical_region_enter(uint8_t *nested) { *nested=0; }
static void app_util_critical_region_exit(uint8_t nested) {}
static void mui_nav_diag_raw(uint8_t key,uint8_t type) {
    CHECK(key<3 && type<5); raw_counts[key][type]++;
    printf("RAW t=%u key=%u type=%u app=%u busy=%u\\n",now,key,type,current_app_id(),mini_app_launcher_input_blocked(mini_app_launcher()));
}
static void mui_nav_diag_post(uint8_t key,uint8_t type,bool accepted,uint8_t depth) {
    printf("POST seq=%u t=%u key=%u type=%u app=%u accepted=%u depth=%u busy=%u\\n",++trace_sequence,now,key,type,current_app_id(),accepted,depth,mini_app_launcher_input_blocked(mini_app_launcher()));
}
static void mui_nav_diag_deliver(uint8_t key,uint8_t type) {
    CHECK(key<3 && type<5); delivered_counts[key][type]++;
    printf("DELIVER t=%u key=%u type=%u app=%u\\n",now,key,type,current_app_id());
}
static void mui_nav_diag_list(uint8_t type,uint32_t selection,uint16_t focus) {}
static void ble_remote_local_activity(void) {}
""" + read("mod/bsp_btn.h") + read("mui/mui_event.c")
    code = code.replace("#define LV_ANIM_RESOLUTION 1024", extra + "\n#define LV_ANIM_RESOLUTION 1024", 1)
    main_pos = code.index("int main(int argc,char **argv)")
    code = code[:main_pos]
    code += "\n#define btn_state_t sdk_btn_state_t\n" + read("mod/app_button_de343.c") + "\n#undef btn_state_t\n"
    code += read("mod/bsp_btn.c") + read("mui/mui_input.c")
    code += HARNESS.read_text()
    cfile=args.output/"event_flow.c"; binary=args.output/"event_flow"
    cfile.write_text(code)
    command=["gcc","-std=c11","-O1","-g","-Wall","-Wextra","-Werror","-Wno-unused-function","-Wno-unused-parameter","-Wno-unused-value","-Wno-comment","-fshort-enums","-I",str(args.root/"fw/components/mlib")]
    if args.sanitize:
        command += ["-fsanitize=address,undefined","-fno-sanitize-recover=all","-fno-omit-frame-pointer","-fno-pie","-no-pie"]
    command += [str(cfile),"-o",str(binary)]
    built=subprocess.run(command,capture_output=True,text=True,timeout=60)
    report={"schema":1,"source_root":str(args.root.resolve()),"source_sha256":hashes,
            "runner_sha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "harness_sha256":hashlib.sha256(HARNESS.read_bytes()).hexdigest(),
            "support_sha256":hashlib.sha256(Path(menu.__file__).read_bytes()).hexdigest(),
            "support_harness_sha256":hashlib.sha256(Path(menu.__file__).with_suffix('.c.in').read_bytes()).hexdigest(),
            "timer_fixture_sha256":hashlib.sha256(timer_fixture.read_bytes()).hexdigest(),
            "build":{"exit":built.returncode,"command":command,"stdout":built.stdout,"stderr":built.stderr},"sanitize":args.sanitize,"require_context_isolation":args.require_context_isolation,"cases":[],
            "limits":["GPIO levels and app_timer start/stop are idealized host services; production debounce port/BSP/translation/queue/handlers execute.",
                      "The 11-row Chameleon menu storage and non-desktop startup/cleanup/save are fixtures; the full actual list-input and real Home callback execute.",
                      "No physical timing, noisy contact, Nordic timer command queue, actual RF or filesystem I/O measurement.",
                      "A conditional source-level reproduction is not proof that the user performed these gestures or experienced this exact timing."]}
    if built.returncode:
        print(built.stderr)
    else:
        for case in range(21):
            run=subprocess.run([str(binary),str(case)],capture_output=True,text=True,timeout=15,
                env=dict(os.environ,ASAN_OPTIONS='detect_leaks=0:halt_on_error=1',UBSAN_OPTIONS='halt_on_error=1:print_stacktrace=1',
                         MENU_EXPECT_INPUT_ISOLATION='1' if args.require_context_isolation else '0'))
            report['cases'].append({'case':case,'exit':run.returncode,'stdout':run.stdout,'stderr':run.stderr})
            print('CASE',case,'EXIT',run.returncode,run.stdout,run.stderr)
    report['source_unchanged']=all(hashlib.sha256((src/p).read_bytes()).hexdigest()==h for p,h in hashes.items())
    report['passed']=built.returncode==0 and len(report['cases'])==21 and all(c['exit']==0 for c in report['cases']) and report['source_unchanged']
    (args.output/'RESULTS.json').write_text(json.dumps(report,indent=2)+'\n')
    (args.output/'run.log').write_text('\n'.join('CASE '+str(c['case'])+' EXIT '+str(c['exit'])+'\n'+c['stdout']+c['stderr'] for c in report['cases']))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=menu.DEFAULT,
                        help="Repository root containing fw/ (default: this checkout)")
    parser.add_argument("--output", type=Path,
                        help="Retain artifacts in this directory; otherwise use a temporary directory")
    parser.add_argument("--sanitize", action="store_true",
                        default=os.environ.get("PIXL_SANITIZE") == "1")
    parser.add_argument("--require-context-isolation", action="store_true", default=True,
                        help="Require isolation (always enabled; retained for command compatibility)")
    args = parser.parse_args()
    args.root = args.root.resolve()
    if args.output is None:
        with tempfile.TemporaryDirectory(prefix="pixl-main-menu-context-") as directory:
            args.output = Path(directory)
            report = run(args)
    else:
        args.output = args.output.resolve()
        report = run(args)
    passed = sum(case['exit'] == 0 for case in report['cases'])
    print(f"MAIN MENU CONTEXT: {passed}/21 cases passed; "
          f"context isolation required; source unchanged={report['source_unchanged']}; "
          f"sanitized={report['sanitize']}")
    raise SystemExit(0 if report['passed'] else 1)


if __name__=='__main__':
    main()
