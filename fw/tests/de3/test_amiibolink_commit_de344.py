"""Actual transport + NFC engine + slot callback: new-tag save failures.

Host C only; filesystem result, radio transmission, timers and UI are mocked.
--baseline-proof requires the unpatched source to violate the same contract.
No device, no files on the device, and no radio/crypto interoperability claim.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent


def function(source, name):
    match = re.search(r'^\s*(?:static\s+)?(?:bool|void|uint8_t)\s+' + re.escape(name) + r'\([^;]*?\)\s*\{', source, re.M)
    assert match, name
    end = match.end()
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[match.start():end]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=HERE.parents[1])
    parser.add_argument('--baseline-proof', action='store_true')
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--report-dir', type=Path)
    args = parser.parse_args()
    src = args.source_root.resolve() / 'application/src'
    paths = [src / p for p in ('ntag/ntag_emu_v2.c', 'ntag/ntag_def.h',
             'mod/ble/ble_amiibolink.c', 'mod/ble/ble_amiibolink.h',
             'mod/df/df_buffer.h', 'app/amiibolink/scene/amiibolink_scene_main.c')]
    hashes = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    engine = re.sub(r'(?m)^\s*#include[^\n]*\n', '', paths[0].read_text())
    transport = paths[2].read_text()
    scene = paths[5].read_text()
    code = (HERE / 'nfc_lifecycle_host.c').read_text().split('/* ACTUAL_SOURCE */')[0]
    code += engine + paths[3].read_text() + paths[4].read_text()
    code += transport[transport.index('static ntag_t m_ntag'):transport.index('/* The buffer helpers')]
    code += r'''
#define MAX_MTU_DAT_SIZE 247
#define NRF_LOG_WARNING(...) ((void)0)
#define NRF_LOG_HEXDUMP_DEBUG(...) ((void)0)
static uint8_t ble_tx[247];
static size_t ble_tx_length;
static unsigned ble_tx_count, cmd_tx_count;
static uint16_t last_cmd;
static void ble_nus_tx_data(const void *data,size_t length){
 assert(length<=sizeof(ble_tx));memcpy(ble_tx,data,length);ble_tx_length=length;++ble_tx_count;
}
static void ble_amiibolink_send_cmd(uint16_t cmd){last_cmd=cmd;++cmd_tx_count;}
static void ble_amiibolink_send_data(uint8_t *data,uint16_t length){ble_nus_tx_data(data,length);}
static void utils_get_device_id(uint8_t id[8]){memset(id,0,8);}
'''
    code += '\n'.join(function(transport, n) for n in (
        'link_has', 'ble_amiibolink_reset_transfer', 'link_begin_transfer', 'link_append',
        'link_commit_transfer', 'ble_amiibolink_write_ntag', 'ble_amiibolink_process_cmd',
        'ble_amiibolink_received_data_v1', 'get_xor', 'amiloop_send_data', 'ble_amiloop_received_data'))
    code += r'''
typedef struct {uint8_t index,max_size;} amiibolink_view_t;
typedef struct {amiibolink_view_t *p_amiibolink_view;ble_amiibolink_mode_t amiibolink_mode;} app_amiibolink_t;
typedef struct {ble_amiibolink_mode_t amiibolink_mode;} settings_data_t;
static settings_data_t settings;
static settings_data_t *settings_get_data(void){return &settings;}
#define DEFAULT_NTAG_INDEX 99
#define APP_TIMER_TICKS(n) (n)
static uint8_t m_active_index;
static ble_amiibolink_mode_t m_active_mode;
static unsigned writes,reloads,events;
static bool fail_save;
static uint8_t persisted;
static int m_amiibo_gen_delay_timer;
static uint32_t m_generate_generation;
static void app_timer_stop(int n){(void)n;}
static void app_timer_start(int n,int ticks,void*p){(void)n;(void)ticks;(void)p;}
static void *mui(void){return NULL;}
static void mui_update(void *p){(void)p;}
static bool ntag_update(app_amiibolink_t *app,uint8_t slot,ntag_t *tag){
 (void)app;assert(slot==m_active_index);++writes;
 if(fail_save)return false;
 persisted=tag->data[16];return true;
}
static void ntag_reload(app_amiibolink_t *app,uint8_t slot){
 (void)app;++reloads;m_active_index=slot;
 ntag_t next={.type=NTAG_215};next.data[16]=0x77;
 assert(ntag_emu_set_tag(&next));
}
static void amiibolink_scene_switch_mode(app_amiibolink_t *app,ble_amiibolink_mode_t mode,uint8_t slot){(void)app;(void)mode;(void)slot;}
'''
    code += '\n'.join(function(scene, n) for n in (
        'ntag_save_error', 'ntag_update_cb', 'amiibolink_scene_ble_event_handler'))
    code += r'''
static amiibolink_view_t view;
static app_amiibolink_t app;
static unsigned reenter;
static void other_owner(ntag_event_type_t type,void *ctx,ntag_t *tag){(void)type;(void)ctx;(void)tag;}
static void event_cb(void *ctx,ble_amiibolink_event_type_t event,uint8_t *data,size_t length){
 assert(!m_transfer_active&&!m_data_pos&&!index);++events;
 amiibolink_scene_ble_event_handler(ctx,event,data,length);
 if(reenter==1){link_begin_transfer();const uint8_t next=0x66;assert(link_append(&next,1));index=8;}
 if(reenter==2){assert(ntag_emu_set_update_cb(other_owner,(void*)8));ntag_t next={.type=NTAG_215};next.data[16]=0x88;assert(ntag_emu_set_tag(&next));}
 if(reenter==3){assert(!ntag_emu_set_update_cb(other_owner,(void*)8));assert(ntag_emu.cb_context==&app);}
}
static void seed(ble_amiibolink_mode_t mode,bool fail,unsigned behavior){
 memset(&ntag_emu,0,sizeof(ntag_emu));ble_amiibolink_reset_transfer();
 memset(&settings,0,sizeof(settings));
 writes=reloads=events=ble_tx_count=cmd_tx_count=0;ble_tx_length=0;last_cmd=0;
 persisted=0x11;fail_save=fail;reenter=behavior;
 view=(amiibolink_view_t){5,26};app=(app_amiibolink_t){&view,mode};
 m_active_index=mode==BLE_AMIIBOLINK_MODE_NTAG?99:5;m_active_mode=mode;
 ntag_t old={.type=NTAG_215};old.data[16]=0x11;
 assert(ntag_emu_set_tag(&old)&&ntag_emu_set_update_cb(ntag_update_cb,&app));
 m_event_handler=event_cb;m_event_ctx=&app;
}
static void stage(size_t length){
 uint8_t incoming[540]={0};incoming[16]=0x55;
 link_begin_transfer();assert(link_append(incoming,length));index=4;
}
static void final_loop(void){
 const uint8_t packet[]={0x02,4,0x87,1,5,0,0x87,0x03};
 ble_amiloop_received_data(packet,sizeof(packet));
}
static void final_link(void){
 const uint8_t command[]={0xcc,0xdd};ble_amiibolink_received_data_v1(command,sizeof(command));
}
#define CHECK(x) do{if(!(x)){fprintf(stderr,"CHECK failed line %d: %s\n",__LINE__,#x);return 71;}}while(0)
int main(void){
 unsigned cases=0;
 const ble_amiibolink_mode_t modes[]={BLE_AMIIBOLINK_MODE_CYCLE,BLE_AMIIBOLINK_MODE_NTAG};
 for(unsigned m=0;m<2;m++)for(unsigned failed=0;failed<2;failed++)for(unsigned wire=0;wire<3;wire++){
  seed(modes[m],failed,0);uint32_t generation=ntag_emu.generation;
  stage(wire==1?539:540);bool committed=false;
  if(wire==0)committed=link_commit_transfer();
  if(wire==1){final_loop();CHECK(ble_tx_count==1&&ble_tx_length==5);committed=ble_tx[2]==0;}
  if(wire==2){final_link();committed=cmd_tx_count==1&&last_cmd==0xccdd;}
  CHECK(events==1&&writes==1&&committed==!failed);
  CHECK(!m_transfer_active&&!m_data_pos&&!index);
  if(failed){
   CHECK(persisted==0x11&&ntag_emu_save_pending()&&ntag_emu.dirty&&view.index==5&&!reloads);
   CHECK(ntag_emu.ntag.data[16]==0x55&&ntag_emu.generation==generation+1);
   /* Retrying only the final packet cannot advance a slot or forget pending RAM. */
   unsigned old_writes=writes;final_loop();CHECK(ble_tx[2]==1&&events==1&&writes==old_writes);
   unsigned old_tx=cmd_tx_count;final_link();CHECK(cmd_tx_count==old_tx&&events==1);
   fail_save=false;CHECK(ntag_emu_retry_save());
   CHECK(persisted==0x55&&!ntag_emu_save_pending()&&writes==2&&view.index==5);
  }else{
   CHECK(persisted==0x55&&!ntag_emu_save_pending());
   CHECK(reloads==(modes[m]==BLE_AMIIBOLINK_MODE_CYCLE));
   if(reloads)CHECK(ntag_emu.ntag.data[16]==0x77&&ntag_emu.generation==generation+2);
   else CHECK(ntag_emu.ntag.data[16]==0x55&&ntag_emu.generation==generation+1);
  }
  ++cases;
 }
 for(unsigned failed=0;failed<2;failed++){
  seed(BLE_AMIIBOLINK_MODE_NTAG,failed,1);stage(540);
  CHECK(link_commit_transfer()==!failed);
  CHECK(events==1&&m_transfer_active&&m_data_pos==1&&index==8&&m_ntag.data[0]==0x66);
  CHECK(ntag_emu.ntag.data[16]==0x55&&ntag_emu_save_pending()==failed);
  ++cases;
 }
 seed(BLE_AMIIBOLINK_MODE_NTAG,false,2);stage(540);
 CHECK(link_commit_transfer());CHECK(persisted==0x55&&ntag_emu.cb_context==(void*)8&&ntag_emu.ntag.data[16]==0x88);
 CHECK(!m_transfer_active&&!m_data_pos);++cases;
 seed(BLE_AMIIBOLINK_MODE_NTAG,true,3);stage(540);
 CHECK(!link_commit_transfer());CHECK(events==1&&writes==2&&ntag_emu.cb_context==&app&&ntag_emu_save_pending());++cases;
 /* A new complete transaction first flushes previously pending RAM. */
 seed(BLE_AMIIBOLINK_MODE_NTAG,true,0);stage(540);CHECK(!link_commit_transfer());
 fail_save=false;stage(540);CHECK(link_commit_transfer());
 CHECK(writes==3&&events==2&&persisted==0x55&&!ntag_emu_save_pending());++cases;
 /* Volatile modes do not require a slot write; their ACK remains valid. */
 seed(BLE_AMIIBOLINK_MODE_RANDOM,true,0);stage(540);CHECK(link_commit_transfer());
 CHECK(!writes&&!ntag_emu_save_pending()&&events==1);++cases;
 printf("PASS %u actual engine/transport/scene new-save cases: failed ACK, retries, cycle generation, reentrant transport, owner handoff, volatile mode\n",cases);
 return 0;
}
'''
    with tempfile.TemporaryDirectory(prefix='amiibolink-de344-') as folder:
        temp = Path(folder)
        cfile = temp / 'probe.c'
        cfile.write_text(code)
        binary = temp / ('probe.exe' if os.name == 'nt' else 'probe')
        command = ['gcc', '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                   '-Wno-unused-function', '-Wno-unused-variable', '-Wno-unused-parameter',
                   '-Wno-sign-compare', '-Wno-error=incompatible-pointer-types',
                   '-I', str(src / 'ntag'), str(cfile), '-o', str(binary)]
        if args.sanitize or os.environ.get('PIXL_SANITIZE') == '1':
            command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer', '-no-pie']
        subprocess.run(command, check=True, timeout=60)
        result = subprocess.run([str(binary)], text=True, capture_output=True, timeout=30)
        expected = 71 if args.baseline_proof else 0
        assert result.returncode == expected, (result.returncode, result.stdout, result.stderr)
        if args.baseline_proof:
            assert 'committed==!failed' in result.stderr
            print('PASS baseline negative control: failed storage was acknowledged as success')
        else:
            print(result.stdout.strip())
        if args.report_dir:
            args.report_dir.mkdir(parents=True, exist_ok=True)
            (args.report_dir / 'actual_probe.c').write_text(code)
            (args.report_dir / 'output.log').write_text(result.stdout + result.stderr)
            (args.report_dir / 'RESULT.json').write_text(json.dumps({
                'source_sha256': hashes, 'test_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                'generated_c_sha256': hashlib.sha256(code.encode()).hexdigest(),
                'compiler': command, 'exit': result.returncode, 'expected': expected,
                'baseline_proof': args.baseline_proof, 'device_access': False,
                'mocked': ['storage result', 'radio transmit', 'UI/timers', 'cycle next-slot load']}, indent=2) + '\n')


if __name__ == '__main__':
    main()
