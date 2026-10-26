"""Actual successor C: NULL retain callbacks, bounded IRQ queue, large favorites.

Only host mocks. No device, keys, network or firmware build. CC selects an
existing compiler; UI_SANITIZE=1 enables ASan/UBSan on supported hosts.
"""
from pathlib import Path
import os,re,shlex,shutil,subprocess,tempfile,unittest

FW=Path(__file__).resolve().parents[2]
SRC=FW/'application/src'
HERE=Path(__file__).resolve().parent

def function(text,name):
    match=re.search(r'(?m)^.*\b'+re.escape(name)+r'\([^;]*?\)\s*\{',text)
    if not match:raise ValueError(name)
    opening=text.index('{',match.start());depth=1
    for end in range(opening+1,len(text)):
        depth+=(text[end]=='{')-(text[end]=='}')
        if not depth:return text[match.start():end+1]
    raise ValueError('Unclosed function')

class Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cc=os.environ.get('CC') or shutil.which('gcc')
        if not cc:raise RuntimeError('An existing GCC is required; this suite cannot silently skip.')
        cls.cc=shlex.split(cc) if os.name!='nt' else [cc]

    def compile_run(self,code,stubs=None,args=()):
        with tempfile.TemporaryDirectory(prefix='pixl-ui-de3-2-') as tmp:
            temp=Path(tmp)
            for name,contents in (stubs or {}).items():
                (temp/name).write_text(contents)
            src=temp/'test.c';src.write_text(code,encoding='utf-8')
            exe=temp/('test.exe' if os.name=='nt' else 'test')
            command=self.cc+['-std=c11','-O1','-Wall','-Wextra','-Werror','-Wno-unused-function','-Wno-unused-parameter',
                            '-I',str(temp),'-I',str(FW/'components/mlib'),str(src),'-o',str(exe)]
            if os.environ.get('UI_SANITIZE')=='1':command+=['-fsanitize=address,undefined','-fno-omit-frame-pointer','-no-pie']
            subprocess.run(command,check=True,timeout=60)
            for arguments in args or [()]:
                subprocess.run([str(exe),*map(str,arguments)],check=True,timeout=15)

    def test_complete_four_kill_callbacks_null_and_retained(self):
        source=[]
        amiibo=(SRC/'app/amiibo/app_amiibo.c').read_text(encoding='utf-8')
        header=(SRC/'app/amiibo/app_amiibo.h').read_text(encoding='utf-8')
        cache=re.search(r'typedef struct \{[^}]*\} app_amiibo_cache_data_t;',header).group(0)
        magic=re.search(r'^#define APP_AMIIBO_CACHE_PAGE_MAGIC[^\n]+',header,re.M).group(0)
        source.extend(function(amiibo,n) for n in ('app_amiibo_restore_browser_cache','app_amiibo_save_browser_cache'))
        for name in ('amiibo','amiidb','amiibolink','chameleon'):
            source.append(function((SRC/f'app/{name}/app_{name}.c').read_text(encoding='utf-8'),f'app_{name}_on_kill'))
        code=(HERE/'ui_retained_exit_host.c').read_text(encoding='utf-8').replace('/* ACTUAL_KILL_CALLBACKS */','\n'.join(source))
        code=code.replace('/* ACTUAL_AMIIBO_CACHE_DEFINITION */',cache+'\n'+magic)
        self.compile_run(code,args=[(app,retain,scene,direction) for app in range(4) for retain in (0,1) for scene in (3,4,9) for direction in (-1,0,1)])

    def test_real_bounded_event_queue_irq_lifecycle_fifo_and_coalescing(self):
        stubs={'mui_common.h':'''#pragma once
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include <string.h>
#define MUI_EVENT_ID_REDRAW 0
#define MUI_EVENT_ID_INPUT 1
#define MUI_EVENT_ID_ANIM 2
void *mui_mem_malloc(size_t);
void mui_mem_free(void*);
''','nrf_log.h':'#define NRF_LOG_WARNING(...) ((void)0)\n',
        'app_util_platform.h':'void app_util_critical_region_enter(uint8_t*);\nvoid app_util_critical_region_exit(uint8_t);\n',
        'mui_nav_diag.h':'#pragma once\n#define mui_nav_diag_post(k,t,a,d) ((void)(k),(void)(t),(void)(a),(void)(d))\n#define mui_nav_diag_deliver(k,t) ((void)(k),(void)(t))\n',
        'mui_event.h':(SRC/'mui/mui_event.h').read_text(encoding='utf-8'),
        'mui_event.c':(SRC/'mui/mui_event.c').read_text(encoding='utf-8')}
        self.compile_run((HERE/'ui_event_queue_host.c').read_text(encoding='utf-8'),stubs)

    def test_actual_favorite_callbacks_selected_after100_and_menu_return(self):
        text=(SRC/'app/amiidb/scene/amiidb_scene_amiibo_detail.c').read_text(encoding='utf-8')
        names=('amiidb_scene_amiibo_detail_fav_list_read_cb','amiidb_scene_amiibo_fav_list_init','amiidb_scene_amiibo_fav_list_update')
        code=(HERE/'ui_favorite_detail_host.c').read_text(encoding='utf-8').replace('/* ACTUAL_FAVORITE_CALLBACKS */','\n'.join(function(text,n) for n in names))
        self.compile_run(code)

    def test_actual_scene_exits_stop_timers_and_clear_callbacks(self):
        callbacks=[]
        for app,scene in [('amiibo','amiibo_detail'),('amiidb','amiibo_detail'),('amiibolink','main')]:
            source=(SRC/f'app/{app}/scene/{app}_scene_{scene}.c').read_text(encoding='utf-8')
            callbacks.append(function(source,f'{app}_scene_{scene}_on_exit'))
        self.compile_run(r'''
#include <assert.h>
#include <stddef.h>
#include <stdbool.h>
typedef struct {int fav_array;} app_amiibo_t;
typedef app_amiibo_t app_amiidb_t;
typedef app_amiibo_t app_amiibolink_t;
static int stopped,cleared,disabled,handlers,released,initialized;
static int m_amiibo_gen_delay_timer=1;
static void app_timer_stop(int timer){assert(timer==1);stopped++;}
static bool ntag_emu_set_update_cb(void*cb,void*ctx) {assert(!cb&&!ctx);cleared++;return true;}
static void ble_disable(void){disabled++;}
static void ble_nus_set_handler(void*rx,void*tx){assert(!rx&&!tx);handlers++;}
#define amiidb_fav_array_clear(x) ((void)(x),released++)
#define amiidb_fav_array_init(x) ((void)(x),initialized++)
'''+'\n'.join(callbacks)+r'''
int main(void){
 app_amiibo_t app={0};
 amiibo_scene_amiibo_detail_on_exit(&app); assert(stopped==1&&cleared==1);
 amiidb_scene_amiibo_detail_on_exit(&app); assert(stopped==2&&cleared==2&&released==1&&initialized==1);
 amiibolink_scene_main_on_exit(&app); assert(stopped==3&&cleared==3&&disabled==1&&handlers==1);
 return 0;
}
''')

if __name__=='__main__':unittest.main()
