"""Bind the dispatch/session functions from the reviewed C tree to the existing SDK flash fixture.
Run with Python 3 and a Linux GCC with ASan/UBSan. The SDK fixture supplies the radio and flash model."""
import argparse, hashlib, json, subprocess
from pathlib import Path
arg=argparse.ArgumentParser()
arg.add_argument('tree',type=Path)
arg.add_argument('fixture',type=Path)
arg.add_argument('outdir',type=Path)
arg.add_argument('--fixture-extra',type=Path,default=Path(__file__).with_name('session_cases.c'))
arg.add_argument('--integrated',action='store_true')
arg.add_argument('--emit-only',action='store_true',help='Prepare the source-bound native fixture for another normal-transfer test.')
a=arg.parse_args()
out=a.outdir;out.mkdir(exist_ok=True,parents=True)
tree=a.tree/'fw/bootloader/src/sdk'
code=a.fixture.read_text()
# Inject a link-loss IRQ at the CRC calculation, after main dispatch and before
# the flash admission of a data packet. All DFU functions use original bodies.
marker='uint32_t crc32_compute(uint8_t const * p_data, uint32_t size, uint32_t const * p_crc)\n{'
assert code.count(marker)==1
code=code.replace(marker,'static void disconnect_irq(void);\nstatic bool disconnect_on_crc;\n'+marker+'\n    if (disconnect_on_crc) { disconnect_on_crc=false;disconnect_irq(); }')
hashes={}
def func(s,mark):
 i=s.index(mark); j=s.index('{',i); depth=1
 for k in range(j+1,len(s)):
  depth+=(s[k]=='{')-(s[k]=='}')
  if not depth: return s[i:k+1]
 raise RuntimeError(mark)
def actual(file,mark):
 result=func((tree/file).read_text(),mark)
 hashes[mark]=hashlib.sha256(result.encode()).hexdigest();return result
def swap(file,mark):
 global code
 old=func(code,mark);code=code.replace(old,actual(file,mark),1)
req='nrf_dfu_req_handler.c'; bl='nrf_dfu_ble.c';boot='nrf_bootloader.c'
for file,mark in [(req,'static bool discard_final_request('),(req,'static bool nrf_dfu_obj_op('),(req,'static bool on_data_obj_execute_request('),(req,'static void on_data_obj_execute_request_sched('),(req,'static void nrf_dfu_req_handler_req_process(')]:
 swap(file,mark)
for op in ('create','write','select','crc'):
 swap(req,'static void on_data_obj_'+op+'_request(')
# Separate BLE and SDK globals from their original translation units.
pos=code.index('static bool discard_final_request')
code=code[:pos]+actual(req,'static bool data_image_ready(')+'''\nstatic bool m_execute_deferred;
static nrf_dfu_obj_type_t m_current_object=NRF_DFU_OBJ_TYPE_COMMAND;
static bool nrf_dfu_ble_request_current(nrf_dfu_request_t const * p_req);
static bool g_dfu_reset_pending;
static unsigned cached_decodes,cached_executes;
static bool bad_size,expire_during_restore;
static uint32_t restored_image_bytes;
static void inactivity_timeout(void);
static void nrf_dfu_validation_init(void) {
    ++cached_decodes;
    if (expire_during_restore) {expire_during_restore=false;inactivity_timeout();}
    init_command_valid=s_dfu_settings.progress.command_size != 0;
}
static nrf_dfu_result_t nrf_dfu_validation_init_cmd_execute(uint32_t *addr,uint32_t *size) {
    ++cached_executes;
    *addr=(uint32_t)(uintptr_t)application_page;
    *size=restored_image_bytes;
    return bad_size?NRF_DFU_RES_CODE_INVALID_OBJECT:NRF_DFU_RES_CODE_SUCCESS;
}
'''+actual(req,'static ret_code_t restore_init_command(')+'\n'+actual(req,'void nrf_dfu_request_session_restore(')+'\n'+code[pos:]
swap(boot,'static void dfu_observer(nrf_dfu_evt_type_t evt_type)\n')
# Only use routines of interest from the full zero-IO model. The compare file is untouched.
j=code.index('static uint16_t ctrl_pt_write_status(')
block='''static volatile bool m_disconnect_pending;
static unsigned advert_calls, flags_for_ble;
#define DFU_BLE_RESETTING_SOON 1
static unsigned advertising_start(void){CHECK(!in_irq && !nrf_fstorage_is_busy(NULL));++advert_calls;return 0;}
#define APP_ERROR_CHECK(x) CHECK((x)==0)
#define m_flags flags_for_ble
'''
block+=actual(bl,'bool nrf_dfu_ble_request_current(')+'\n'+actual(bl,'void nrf_dfu_ble_disconnect_process(')+'\n#undef m_flags\n'
code=code[:j]+block+code[j:]
if a.integrated:
 for mark in ['static void do_reset(', 'static void final_reset_process(', 'static void bootloader_reset(', 'static void inactivity_timeout(void)\n']:
  swap(boot,mark)
 j=code.index('static void final_reset_process(')
 code=code[:j]+'static uint8_t m_reset_backup_attempts;\n'+actual(boot,'static bool reset_backup_needed(')+'\n'+code[j:]
 code=code.replace('struct { struct { ble_gatts_evt_write_t write;', 'struct { uint16_t conn_handle; struct { ble_gatts_evt_write_t write;')
 code=code.replace('ble_evt_t event={.evt.gatts_evt.params.write=', 'ble_evt_t event={.evt.gatts_evt.conn_handle=7,.evt.gatts_evt.params.write=')
 j=code.index('static void on_write(')
 code=code[:j]+'''#define BLE_HCI_REMOTE_USER_TERMINATED_CONNECTION 0x13
#define BLE_ERROR_INVALID_CONN_HANDLE 0x3002
static unsigned disconnect_requests;
static ret_code_t sd_ble_gap_disconnect(uint16_t conn,uint8_t reason) { CHECK(critical_depth && conn==m_conn_handle); ++disconnect_requests;return 0;}
'''+actual(bl,'static void response_fail_locked(')+'\n'+actual(bl,'static void ingress_fail(')+'\n'+code[j:]
 for mark in ['static void on_write(', 'static uint32_t on_ctrl_pt_write(', 'static void * response_context_get(']:
  swap(bl,mark)

s=(tree/bl).read_text()
i=s.index('case BLE_GAP_EVT_DISCONNECTED:');j=s.index('} break;',i)
b=s[s.index('{',i)+1:j]
assert 'response_session_reset' in b and 'm_disconnect_pending' in b
code=code[:code.index('int main(void) {')]+ '\nstatic void disconnect_irq(void) { in_irq=true;'+b+'in_irq=false; }\n'
f=a.fixture_extra.read_text()
# Keep earlier 7 interoperability/pressure scenarios intact before the new regression group.
p=a.fixture.read_text();a1=p.index('int main(void) {');a2=p.index('    reset_ble();\n    memset(application_page,0x12',a1)
old_main=p[a1:a2]
code=code.replace('static void nrf_dfu_command_req(nrf_dfu_request_t *r,nrf_dfu_response_t *s) {CHECK(false);}','static unsigned command_requests; static void nrf_dfu_command_req(nrf_dfu_request_t *r,nrf_dfu_response_t *s) { ++command_requests; }')
if a.integrated:
 old_main=old_main.replace('pool_full=true;packet(4);app_sched_execute();','pool_full=true;disconnect_requests=0;packet(4);app_sched_execute();CHECK(m_response_failed && disconnect_requests==1);')
 old_main=old_main.replace('packet(4);app_sched_execute();CHECK(!frames && alloc_attempts==1','disconnect_requests=0;packet(4);app_sched_execute();CHECK(m_response_failed && disconnect_requests==1);CHECK(!frames && alloc_attempts==1')
 old_main=old_main.replace('CHECK(frames==1 && wire_offset==4 && pool_free==1 && !pool_used);','CHECK(!frames && wire_offset==0 && !pool_free && !pool_used && m_response_failed);')
 old_main=old_main.replace('new_write_after_pool_pressure_can_advance','no_later_bytes_after_pool_pressure_requires_reconnect').replace('pool_no_mem_prn1_silent','pool_no_mem_prn1_resets_link').replace('scheduler_no_mem_packet_prn1_silent_single_free','scheduler_no_mem_packet_prn1_resets_link_single_free')
 f=f.replace('CHECK(reset_calls==1);','CHECK(!reset_calls && g_dfu_reset_pending);final_reset_process();CHECK(reset_calls==1);')
 f=f.replace('m_disconnect_pending=g_dfu_reset_pending=bad_size=false;', 'm_disconnect_pending=g_dfu_reset_pending=bad_size=expire_during_restore=false; m_reset_backup_attempts=0;')
 extra='''
    fresh(); prepare_data(1);packet(4);app_sched_execute();disconnect_irq();
    in_irq=true;inactivity_timeout();in_irq=false;
    nrf_dfu_ble_disconnect_process();final_reset_process();
    CHECK(m_disconnect_pending && !advert_calls && !reset_calls && pool_used);
    backend_drain();nrf_dfu_ble_disconnect_process();final_reset_process();
    CHECK(!m_disconnect_pending && !advert_calls && reset_calls==1 && !reset_while_busy && pool_free==1 && !cached_decodes);
    pass("inactivity_wins_during_flash_drain_without_readvertising_rollback_or_leak");
    fresh();disconnect_irq();expire_during_restore=true;
    nrf_dfu_ble_disconnect_process();final_reset_process();
    CHECK(!m_disconnect_pending && !advert_calls && g_dfu_reset_pending && reset_calls==1 && cached_decodes==1);
    pass("inactivity_irq_during_restore_suppresses_last_readvertising");
'''
 f=f.replace('    printf("RESULT',extra+'\n    printf("RESULT')
code+=f.replace('/* ORIGINAL INTEROP CASES */',old_main)
code=code.replace('static bool discard_final_request(', 'static void dfu_display_final_phase(bool saving) { static unsigned before; static bool begun; CHECK(g_dfu_finalizing && !in_irq); if (!saving) { before=validation_calls; begun=true; } else { CHECK(begun && validation_calls==before+1 && timer_callback!=NULL); begun=false; } }\nstatic bool discard_final_request(',1)
source=out/'session_joined.c';source.write_text(code)
if a.emit_only:
 print('Prepared the C fixture; no tests executed.')
 raise SystemExit(0)
flags=['gcc','-std=c11','-O1','-g','-fshort-enums','-fno-pie','-no-pie','-Wall','-Wextra','-Werror','-Wno-unused-parameter','-Wno-unused-function','-Wno-int-to-pointer-cast','-Wno-pointer-to-int-cast','-DEXPECT_LENGTH_GUARD_FIX=1','-DEXPECT_ADMISSION_CRC_FIX=1']
runs={}
for name,extra in [('native',[]),('san',['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer'])]:
 exe=out/name
 subprocess.run([*flags,*extra,str(source),'-o',str(exe)],check=True)
 r=subprocess.run([str(exe)],capture_output=True,text=True)
 (out/(name+'.log')).write_text(r.stdout+r.stderr)
 if r.returncode: raise RuntimeError((r.returncode,r.stdout[-300:],r.stderr[:1400]))
 runs[name]=r.stdout.splitlines()[-1]
 print(name,runs[name])
fullfiles=['sdk/nrf_dfu_req_handler.c','sdk/nrf_dfu_ble.c','sdk/nrf_bootloader.c','dfu_completion.h']
full={f:hashlib.sha256((tree.parent/f).read_bytes()).hexdigest() for f in fullfiles}
(out/'session_results.json').write_text(json.dumps(dict(runs=runs,bound=hashes,sourceSHA256=full,base_fixture_sha256=hashlib.sha256(a.fixture.read_bytes()).hexdigest(),compiled_source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),model='C scheduler, settings and fstorage with radio/SVC/hardware flash, signed-command decoder and timer inputs simulated.'),indent=2)+'\n')
