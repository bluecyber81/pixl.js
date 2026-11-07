"""Refresh the source-bound reset tests for a merged BL8 checkout.
Usage: python bind_merged.py <bootloader source directory> <selfcontained reset-only hosttests folder> <outdir>
Two native fixtures are provided in the reset-only test folder. They bind true Nordic C bodies to mocked hardware boundaries.
"""
from pathlib import Path
import hashlib,json,sys,shutil
src,template,out=map(Path,sys.argv[1:]); out.mkdir(parents=True,exist_ok=True)
src=src/'fw/bootloader/src/sdk'
boot=(src/'nrf_bootloader.c').read_text();req=(src/'nrf_dfu_req_handler.c').read_text();ble=(src/'nrf_dfu_ble.c').read_text()
def fn(text,mark):
    i=text.index(mark);q=text.index('{',i);d=1
    for j in range(q+1,len(text)):
        d+=(text[j]=='{')-(text[j]=='}')
        if not d:return text[i:j+1]
    raise ValueError(mark)
bound={}
def record(src, key):
    v=fn(src,key)
    bound[key]=hashlib.sha256(v.encode()).hexdigest()
    return v
for kind in ['sd','transaction']:
    a=(template/(kind+'.c')).read_text()
    for full,markers in [(boot,['static bool reset_backup_needed(', 'static void do_reset(', 'static void final_reset_process(', 'static void bootloader_reset(', 'static void inactivity_timeout(', 'static void dfu_observer(nrf_dfu_evt_type_t evt_type)']),
             (req, ['static bool discard_final_request(', 'static void on_abort_request(', 'void nrf_dfu_completion_process(bool timed_out)', 'static void on_data_obj_execute_request_sched(', 'static void on_data_obj_write_request('])]:
        for k in markers:
            v=fn(a,k)
            a=a.replace(v,record(full,k),1)
    a=a.replace('static bool discard_final_request(', 'static bool m_execute_deferred;\n'+record(req,'static bool data_image_ready(')+'\nstatic bool discard_final_request(', 1)
    a=a.replace('static void reset_case(void) {','static void reset_case(void) {\n    m_execute_deferred=false;',1)
    a=a.replace('static bool discard_final_request(', 'static void dfu_display_final_phase(bool saving) { static unsigned before; static bool begun; CHECK(g_dfu_finalizing && !in_irq); if (!saving) { before=validation_calls; begun=true; } else { CHECK(begun && validation_calls==before+1 && timer_callback!=NULL); begun=false; } }\nstatic bool discard_final_request(',1)
    sig='static bool discard_final_request('
    a=a.replace(sig,'''/* Transport and validator stubs delimit the reset-only fixture. The tests below exercise the real session predicate, restoration, and disconnect polling. */
static void ble_dfu_req_handler_callback(nrf_dfu_response_t *r,void *ctx){(void)r;(void)ctx;}
static uint32_t m_response_session;
static bool m_response_failed;
'''+record(ble,'bool nrf_dfu_ble_request_current(')+'\n'+sig,1)
    sig='static void dfu_observer(nrf_dfu_evt_type_t evt_type)'
    a=a.replace(sig,'''static nrf_dfu_obj_type_t m_current_object;
static void nrf_dfu_validation_init(void){}
static nrf_dfu_result_t nrf_dfu_validation_init_cmd_execute(uint32_t *a,uint32_t *b){(void)a;(void)b;return NRF_DFU_RES_CODE_SUCCESS;}
static unsigned reset_adv_starts;
static uint32_t advertising_start(void){++reset_adv_starts;return NRF_SUCCESS;}
static volatile bool m_disconnect_pending;
#define DFU_BLE_RESETTING_SOON (1u<<31)
#define m_flags reset_ble_flags
static uint32_t reset_ble_flags;
#ifndef APP_ERROR_CHECK
#define APP_ERROR_CHECK(ret) CHECK((ret)==NRF_SUCCESS)
#endif
'''+record(req,'static ret_code_t restore_init_command(')+'\n'+record(req,'void nrf_dfu_request_session_restore(')+'\n'+record(ble,'void nrf_dfu_ble_disconnect_process(')+'\n#undef m_flags\n'+sig,1)
    insert='''    reset_case();g_dfu_reset_pending=true;m_disconnect_pending=true;reset_adv_starts=0;
    nrf_dfu_ble_disconnect_process();CHECK(!m_disconnect_pending&&!reset_adv_starts);
    final_reset_process();CHECK(reset_calls==1&&!reset_while_busy);
    pass("combined_pending_abort_has_priority_over_disconnect_restore_and_advertising");
    reset_case();m_disconnect_pending=true;reset_adv_starts=0;reset_ble_flags=0;
    nrf_dfu_ble_disconnect_process();CHECK(!m_disconnect_pending&&reset_adv_starts==1);
    nrf_dfu_request_t ble_write=request(NRF_DFU_OP_OBJECT_WRITE);ble_write.callback.response=ble_dfu_req_handler_callback;
    m_response_session=17;m_response_failed=false;ble_write.p_context=(void *)(uintptr_t)16;
    CHECK(discard_final_request(&ble_write) && free_calls==1);
    ble_write.p_context=(void *)(uintptr_t)17;CHECK(!discard_final_request(&ble_write) && free_calls==1);
    g_dfu_reset_pending=true;CHECK(discard_final_request(&ble_write)&&free_calls==2);
    pass("combined_current_and_stale_generations_and_reset_fence");
'''
    if kind=='transaction':
        a=a.replace('    pass("in_flight_terminal_execute_takes_precedence");','    pass("in_flight_terminal_execute_takes_precedence");\n'+insert)
    (out/(kind+'.c')).write_bytes(a.encode())
shutil.copyfile(template/'run.sh',out/'run.sh')
(out/'bound.json').write_text(json.dumps({'files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (src/'nrf_bootloader.c',src/'nrf_dfu_req_handler.c',src/'nrf_dfu_ble.c')},'functions':bound, 'scope':'SDK fstorage and settings integration, merged source functions; SVC/events, advertising and signature decoding mocked.'},indent=2)+'\n')
