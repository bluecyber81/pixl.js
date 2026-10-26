"""Constructor-stage fault injection; never starts scenes, RF, BLE or a device."""
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

SRC = Path(__file__).resolve().parents[2] / 'application/src'


def function(text, name):
    m = re.search(r'^[^\n;]*\b' + name + r'\([^;]*?\)\s*\{', text, re.M)
    assert m, name
    end = text.index('{', m.start()) + 1
    depth = 1
    while depth:
        depth += (text[end] == '{') - (text[end] == '}')
        end += 1
    return text[m.start():end]


def compile_run(source):
    with tempfile.TemporaryDirectory(prefix='de310-startup-') as directory:
        folder = Path(directory)
        c = folder / 'test.c'
        exe = folder / ('test.exe' if os.name == 'nt' else 'test')
        c.write_text(source, encoding='utf-8')
        args = ['gcc', '-std=c11', '-O0', '-Wall', '-Wextra', '-Werror',
                '-Wno-unused-function', '-Wno-unused-parameter', str(c), '-o', str(exe)]
        if os.environ.get('UI_SANITIZE') == '1':
            args += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
        built = subprocess.run(args, capture_output=True, text=True)
        if built.returncode:
            raise AssertionError(built.stdout + built.stderr)
        run = subprocess.run([str(exe)], check=True, capture_output=True, text=True, timeout=10)
        assert 'PASS' in run.stdout


ALLOC = r'''
#include <assert.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
typedef struct {bool (*transition_guard)(void);} scene_guard_t;
static bool ntag_emu_prepare_change(void){return true;}
static unsigned calls, fail_at, live;
static void *alloc_stack[64];
static void *mui_mem_malloc(size_t n) {
    if (++calls == fail_at) return NULL;
    void *p = malloc(n); assert(p && live < 64);
    memset(p, 0xa5, n); alloc_stack[live++] = p; return p;
}
static void mui_mem_free(void *p) {
    if (!p) return;
    assert(live && alloc_stack[live - 1] == p); live--; free(p);
}
'''


class StartupTests(unittest.TestCase):
    def test_actual_nine_app_constructor_stages_unwind_every_failure(self):
        # AmiiboLink supplementary tests remain excluded by instruction.
        for app in ('ble', 'game', 'settings', 'amiibo', 'amiidb', 'chameleon', 'player', 'desktop', 'status_bar'):
            with self.subTest(app=app):
                text = (SRC / f'app/{app}/app_{app}.c').read_text(encoding='utf-8')
                body = function(text, f'app_{app}_on_run')
                before, remainder = body.split('    p_app_inst->p_handle = p_app_handle;', 1)
                cleanup = 'startup_failed:' + remainder.split('startup_failed:', 1)[1]
                allocations = re.findall(r'p_app_handle->(\w+) = (\w+)_create\(\);', before)
                self.assertTrue(allocations)
                # Execute the exact allocation prelude and exact rollback label.
                # The omitted successful body is the scene/hardware activation.
                body = before + '    p_app_inst->p_handle = p_app_handle;\n    return;\n' + cleanup
                fields = '\n'.join((f'scene_guard_t *{field};' if field == 'p_scene_dispatcher' else f'void *{field};') for field, _ in allocations)
                initialized_assert = ''
                if app == 'settings':
                    fields += '\nbool exit_saved;'
                    initialized_assert = 'assert(!v->exit_saved);'
                declarations = '\n'.join(f'static void *{name}_create(void) {{ return mui_mem_malloc(8); }}\n'
                                         f'static void {name}_free(void *p) {{ mui_mem_free(p); }}'
                                         for name in sorted({name for _, name in allocations}))
                release = '\n'.join(f'{name}_free(v->{field});' for field, name in reversed(allocations))
                source = ALLOC + f'''
typedef struct {{ void *p_handle; }} mini_app_inst_t;
typedef struct {{ {fields} }} app_{app}_t;
{declarations}
{body}
int main(void) {{
 for (unsigned failure = 1; failure <= {len(allocations) + 1}; failure++) {{
  calls = 0; fail_at = failure; mini_app_inst_t inst = {{0}};
  app_{app}_on_run(&inst);
  assert(!inst.p_handle && !live && calls == failure);
  calls = 0; fail_at = 0; app_{app}_on_run(&inst);
  assert(inst.p_handle && live == {len(allocations) + 1});
  app_{app}_t *v = inst.p_handle;
  {initialized_assert}
  {release}
  mui_mem_free(v); assert(!live);
 }}
 puts("PASS");
}}
'''
                compile_run(source)

    def test_actual_ble_and_game_view_malloc_failures(self):
        pieces = []
        callbacks = []
        for name, app in [('ble_status_view', 'ble'), ('game_view', 'game')]:
            text = (SRC / f'app/{app}/view/{name}.c').read_text(encoding='utf-8')
            pieces += [function(text, f'{name}_create'), function(text, f'{name}_free')]
            callbacks += [f'static void {name}_on_{cb}(void) {{}}' for cb in ('draw','input','enter','exit')]
        compile_run(ALLOC + r'''
typedef struct {void *user_data; void (*draw_cb)(void),(*input_cb)(void),(*enter_cb)(void),(*exit_cb)(void);} mui_view_t;
typedef struct {mui_view_t *p_view; void *event_cb; char ble_addr[20]; uint8_t page; uint8_t drawn_link_state; void *user_data;} ble_status_view_t;
typedef struct {mui_view_t *p_view; void *event_cb; int(*game_run)(void); uint8_t running; void *user_data;} game_view_t;
static mui_view_t *mui_view_create(void) {return mui_mem_malloc(sizeof(mui_view_t));}
static void mui_view_free(mui_view_t *p) {mui_mem_free(p);}
''' + '\n'.join(callbacks + pieces) + r'''
#define CHECK(name) do { \
 for(unsigned i=1;i<=2;i++) { calls=0;fail_at=i;assert(name##_create()==NULL && live==0); } \
 calls=0;fail_at=0;name##_t *v=name##_create();assert(v&&v->p_view&&live==2); \
 name##_free(v); name##_free(NULL); assert(!live); \
} while(0)
int main(void) { CHECK(ble_status_view); CHECK(game_view); puts("PASS"); }
''')


if __name__ == '__main__':
    unittest.main()
