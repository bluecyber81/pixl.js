"""Actual Chameleon config decode, file read and CRC retry contracts."""
from pathlib import Path
import os, re, shutil, subprocess, tempfile, unittest
from root_host import FW, SRC, function

TAG_DIR = FW / 'components/chameleon-ultra/firmware/application/src/rfid/nfctag'

def definition(text, name, result):
    match = re.search(r'(?m)^(?:static\s+)?' + result + r'\s+' + name + r'\([^;]*?\)\s*\{', text)
    assert match, name
    return function(text[match.start():], name)

class ChameleonStateTests(unittest.TestCase):
    def compile_run(self, source):
        with tempfile.TemporaryDirectory(prefix='pixl-chameleon-state-') as temp:
            folder=Path(temp)
            (folder/'app_util.h').write_text('#define PACKED __attribute__((packed))\n#define STATIC_ASSERT(x) _Static_assert(x,#x)\n')
            (folder/'utils.h').write_text('')
            c=folder/'test.c';exe=folder/'test.exe';c.write_text(source,encoding='utf-8')
            cmd=[shutil.which('gcc'),'-std=c11','-fshort-enums','-mno-ms-bitfields','-Wall','-Wextra','-Werror',
                 '-Wno-unused-function','-Wno-unused-parameter','-Wno-unused-variable','-I',str(folder),'-I',str(TAG_DIR)]
            if os.environ.get('PIXL_SANITIZE')=='1':
                cmd+=['-g','-O1','-fsanitize=address,undefined','-fno-omit-frame-pointer','-no-pie']
            built=subprocess.run(cmd+[str(c),'-o',str(exe)],capture_output=True,text=True,timeout=60)
            self.assertEqual(built.returncode,0,built.stdout+built.stderr)
            ran=subprocess.run([str(exe)],capture_output=True,text=True,timeout=60)
            self.assertEqual(ran.returncode,0,ran.stdout+ran.stderr)
            self.assertIn('PASS',ran.stdout)
            print(ran.stdout.strip())

    def test_config_formats_bad_lengths_indices_types_and_file_preservation(self):
        tag=(TAG_DIR/'tag_emulation.c').read_text(encoding='utf-8')
        port=(SRC/'app/chameleon/port/fds_utils.c').read_text(encoding='utf-8')
        code=Path(__file__).with_name('chameleon_state_load.c.in').read_text(encoding='utf-8')
        for name,result in [('tag_emulation_decode_config','bool'),('tag_emulation_load_config','int32_t'),
                            ('tag_emulation_init','bool')]:
            code=code.replace('@'+name+'@',definition(tag,name,result))
        code=code.replace('@fds_read_config@',definition(port,'fds_read_config','int32_t'))
        self.compile_run(code)

    def test_app_failed_init_dialog_exit_does_not_save_or_start_scene(self):
        text=(SRC/'app/chameleon/app_chameleon.c').read_text(encoding='utf-8')
        code=Path(__file__).with_name('chameleon_state_lifecycle.c.in').read_text(encoding='utf-8')
        for name in ['app_chameleon_init_error_cb','app_chameleon_show_load_error','app_chameleon_on_run','app_chameleon_on_kill']:
            code=code.replace('@'+name+'@',definition(text,name,'void'))
        self.compile_run(code)

    def test_nfc_wakeup_uses_existing_ntag_fallback_if_chameleon_init_fails(self):
        text=(SRC/'main.c').read_text(encoding='utf-8')
        self.compile_run(r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#define NRF_LOG_INFO(...) ;
#define NRF_POWER_RESETREAS_NFC_MASK 1
#define NRF_POWER_RESETREAS_LPCOMP_MASK 2
#define APP_ERROR_CHECK(e) assert((e)==0)
typedef int ret_code_t;typedef struct{unsigned value;}ntag_t;
typedef struct{ntag_t ntag;}cache_data_t;
const ntag_t default_ntag215={215};static cache_data_t cache={{99}};
static uint32_t reason;static bool default_valid,init_ok,cached,data_ready;
static unsigned init_calls,irq,sense,ntag,cache_set,clean,clear;
static uint32_t nrf_power_resetreas_get(void){return reason;}
static void nrf_power_resetreas_clear(uint32_t n){assert(n==reason);clear++;}
static bool tag_helper_valid_default_slot(void){return default_valid;}
static bool tag_emulation_init(void){init_calls++;return init_ok;}
static bool tag_emulation_active_data_ready(void){return data_ready;}
static void hal_nfc_set_nrfx_irq_enable(bool on){assert(on);irq++;}
static void tag_emulation_sense_run(void){sense++;}
static ret_code_t ntag_emu_init(const ntag_t*n){assert(n==&default_ntag215);ntag++;return 0;}
static bool cache_valid(void){return cached;}
static cache_data_t*cache_get_data(void){return &cache;}
static void ntag_emu_set_tag(ntag_t*n){assert(n==&cache.ntag);cache_set++;}
static void cache_clean(void){clean++;}
'''+definition(text,'check_wakeup_src','uint32_t')+r'''
int main(void){
 for(unsigned r=0;r<4;r++)for(unsigned d=0;d<2;d++)for(unsigned ok=0;ok<2;ok++)for(unsigned c=0;c<2;c++)for(unsigned ready=0;ready<2;ready++){
  reason=r;default_valid=d;init_ok=ok;cached=c;data_ready=ready;init_calls=irq=sense=ntag=cache_set=clean=clear=0;
  assert(check_wakeup_src()==r);bool invoked=d&&(r&1),started=invoked&&ok&&ready;
  assert(init_calls==invoked && irq==started && sense==started && ntag==!started);
  assert(cache_set==(!started&&c) && clean==(!started&&!c) && clear==1);
 }
 puts("PASS 64 actual wakeup cases: failed/empty Chameleon init never enables its IRQ/sense; NTAG cache fallback preserved");
}
''')

    def test_failed_save_remains_dirty_until_successful_retry(self):
        source=(TAG_DIR/'tag_emulation.c').read_text(encoding='utf-8')
        self.compile_run(r'''
#include <assert.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <stdio.h>
#include "tag_emulation.h"
#define NRF_LOG_INFO(...) ((void)0)
#define NRF_LOG_ERROR(...) ((void)0)
typedef struct {unsigned id,key;} fds_slot_record_map_t;
static uint8_t data[16]={1};static uint16_t saved_crc;
static unsigned attempts;static bool fail_write,m_tag_data_loaded=true;
static tag_data_buffer_t buffer={sizeof(data),data,&saved_crc};
tag_data_buffer_t*get_buffer_by_tag_type(tag_specific_type_t t){return &buffer;}
static int save_cb(tag_specific_type_t t,tag_data_buffer_t*b){return b->length;}
static tag_datas_savecb_t get_data_savecb_from_tag_type(tag_specific_type_t t){return save_cb;}
static void calc_14a_crc_lut(uint8_t*p,unsigned n,uint8_t*out){out[0]=0x34;out[1]=0x12;}
tag_sense_type_t get_sense_type_from_tag_type(tag_specific_type_t t){return TAG_SENSE_HF;}
static void get_fds_map_by_slot_sense_type_for_dump(unsigned s,unsigned t,fds_slot_record_map_t*m){m->id=1;m->key=1;}
static bool fds_write_sync(unsigned id,unsigned key,unsigned n,void*b){attempts++;return !fail_write;}
'''+definition(source,'save_data_by_tag_type','bool')+r'''
int main(void){
 fail_write=true;save_data_by_tag_type(0,TAG_TYPE_MIFARE_1024);assert(attempts==1 && saved_crc==0);
 save_data_by_tag_type(0,TAG_TYPE_MIFARE_1024);assert(attempts==2 && saved_crc==0);
 fail_write=false;save_data_by_tag_type(0,TAG_TYPE_MIFARE_1024);assert(attempts==3 && saved_crc==0x1234);
 save_data_by_tag_type(0,TAG_TYPE_MIFARE_1024);assert(attempts==3);
 puts("PASS failed writes remain dirty, successful retry commits CRC, unchanged data skips write");
}
''')

    def test_real_hf_loaders_and_file_length_do_not_register_short_data(self):
        tag=(TAG_DIR/'tag_emulation.c').read_text(encoding='utf-8')
        for kind,file in [('mf1','nfc_mf1.c'),('mf0_ntag','nfc_mf0_ntag.c')]:
            with self.subTest(kind=kind):
                hf=(TAG_DIR/'hf'/file).read_text(encoding='utf-8')
                code=Path(__file__).with_name('chameleon_data_load.c.in').read_text(encoding='utf-8')
                code=code.replace('@LOADER@',definition(hf,f'nfc_tag_{kind}_data_loadcb','int'))
                code=code.replace('@CALL@',f'nfc_tag_{kind}_data_loadcb')
                for name,result in [('tag_emulation_load_by_buffer','bool'),('load_data_by_tag_type','void'),('tag_emulation_sense_run','void'),('tag_emulation_load_data','void'),('tag_emulation_init','bool')]:
                    code=code.replace('@'+name+'@',definition(tag,name,result))
                self.compile_run(code)

    def test_slot_navigation_and_shrink_are_hf_only_and_keep_index_in_file(self):
        tag=(TAG_DIR/'tag_emulation.c').read_text(encoding='utf-8')
        helper=(SRC/'app/chameleon/port/tag_helper.c').read_text(encoding='utf-8')
        code=Path(__file__).with_name('chameleon_slot_bounds.c.in').read_text(encoding='utf-8')
        for name,result in [('tag_emulation_prepare_slot_count','bool'),('tag_emulation_slot_find_next','uint8_t'),('tag_emulation_slot_find_prev','uint8_t')]:
            code=code.replace('@'+name+'@',definition(tag,name,result))
        # This source uses indentation before the function definition.
        code=code.replace('@tag_helper_set_slot_num@',definition(helper.replace('    void tag_helper_set_slot_num','void tag_helper_set_slot_num'),'tag_helper_set_slot_num','void'))
        self.compile_run(code)

    def test_main_entry_and_after_slot_change_require_ready_hf_data(self):
        text=(SRC/'app/chameleon/scene/chameleon_scene_main.c').read_text(encoding='utf-8')
        code=Path(__file__).with_name('chameleon_main_entry.c.in').read_text(encoding='utf-8')
        for name in ['chameleon_scene_main_event_cb','chameleon_scene_main_on_enter']:
            code=code.replace('@'+name+'@',definition(text,name,'void'))
        self.compile_run(code)

    def test_empty_type_selection_back_has_a_home_exit(self):
        text=(SRC/'app/chameleon/scene/chameleon_scene_menu_card_type.c').read_text(encoding='utf-8')
        self.compile_run(r'''
#include <assert.h>
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
typedef struct{void*p_scene_dispatcher,*p_msg_box;}app_chameleon_t;
typedef struct{void*user_data;}mui_list_view_t;typedef mui_list_view_t mui_list_item_t;
typedef unsigned mui_list_view_event_t;typedef uintptr_t chameleon_menu_item_t;typedef unsigned tag_specific_type_t;
enum{CHAMELEON_MENU_BACK,CHAMELEON_MENU_CARD_TYPE,TAG_TYPE_UNDEFINED=0,CHAMELEON_VIEW_ID_MSG_BOX=1};
static unsigned type,home,previous;static unsigned hf_tag_specific_types[2]={0,1};
static unsigned tag_helper_get_active_tag_type(void){return type;}
static unsigned tag_emulation_get_slot(void){return 0;}
static unsigned mui_list_view_get_focus(void*p){return 0;}
static void tag_emulation_change_type(unsigned a,unsigned b){}
#define mui_msg_box_set_header(...) ((void)0)
#define mui_msg_box_set_message(...) ((void)0)
#define mui_msg_box_set_btn_text(...) ((void)0)
#define mui_msg_box_set_btn_focus(...) ((void)0)
#define mui_msg_box_set_event_cb(...) ((void)0)
#define mui_view_dispatcher_switch_to_view(...) ((void)0)
static void*mini_app_launcher(void){return NULL;}
static void mini_app_launcher_exit(void*p){home++;}
static void mui_scene_dispatcher_previous_scene(void*p){previous++;}
'''+definition(text,'chameleon_scene_menu_card_type_on_event','void')+r'''
int main(void){app_chameleon_t app={0};mui_list_view_t view={&app};mui_list_item_t item={(void*)CHAMELEON_MENU_BACK};
 for(unsigned t=0;t<2;t++){type=t;home=previous=0;chameleon_scene_menu_card_type_on_event(0,&view,&item);assert(home==!t&&previous==t);}
 puts("PASS empty type selection exits to Home; configured type retains previous-scene navigation");
}
''')

    def test_failed_save_prevents_slot_overwrite_and_successful_retry_preserves_data(self):
        text=(TAG_DIR/'tag_emulation.c').read_text(encoding='utf-8')
        code=Path(__file__).with_name('chameleon_slot_save_retry.c.in').read_text(encoding='utf-8')
        for name,result in [('save_data_by_tag_type','bool'),('tag_emulation_save_data','void'),('tag_emulation_sense_run','void'),
                            ('tag_emulation_sense_end','void'),('tag_emulation_get_slot','uint8_t'),
                            ('tag_emulation_set_slot','void'),('tag_emulation_change_slot','void'),
                            ('tag_emulation_prepare_slot_count','bool')]:
            code=code.replace('@'+name+'@',definition(text,name,result))
        self.compile_run(code)

if __name__=='__main__':unittest.main()
