"""Cold remote permission -> real deferred GAP mode -> real work cleanup.

Uses the production bridge and mode functions together instead of giving the
bridge an already-active mocked radio. Nordic hardware calls remain bounded
stubs; these tests cannot prove over-the-air advertising or host discovery.
"""
from pathlib import Path
import ast
import os
import re
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]
SRC = FW / 'application/src/mod/ble'


def function(source, name):
    match = re.search(r'^(?:static\s+)?\w+(?:\s*\*)?\s+' + name + r'\([^;]*?\)\s*\{', source, re.M)
    assert match, name
    end = source.index('{', match.start()) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[match.start():end]


# Reuse the SDK-shaped types and mocks of the deferred-mode harness. Replace
# its queue shortcuts with the real queue, and its startup stub with ble_init.
tree = ast.parse((HERE / 'test_ble_remote_modes_de347.py').read_text())
header = next(ast.literal_eval(node.value) for node in tree.body
              if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'code' for t in node.targets))
for name in ('ble_work_disconnected', 'ble_work_cleanup_complete', 'ble_work_set_handlers', 'ble_work_process',
             'ble_remote_dispatching', 'ble_remote_response_pending'):
    header = header.replace(function(header, name), '')
header = header.replace('static unsigned critical_depth;', 'int critical_depth;')
header = header.replace('static void ble_on_disconnected(void){cleanup_calls++;mock_clean=true;}',
                        'static void ble_on_disconnected(void){cleanup_calls++;}')
header = header.replace('&&mock_clean&&!m_sessions_enabled', '&&ble_work_cleanup_complete()&&!m_sessions_enabled')
header = '#include "ble_work.h"\n' + header
header += r'''
#define REMOTE_LCD_CHUNK_MAX 0
#define MINI_APP_ID_BLE 1
#define MINI_APP_ID_AMIIBOLINK 2
typedef struct {bool file,link;} mini_app_launcher_t;
static mini_app_launcher_t launcher;
static mini_app_launcher_t *mini_app_launcher(void){return &launcher;}
static void *mini_app_launcher_get_app_handle(mini_app_launcher_t *l,unsigned id){return id==1?(l->file?l:NULL):(l->link?l:NULL);}
static void mini_app_launcher_run(mini_app_launcher_t *l,unsigned id){(void)l;(void)id;assert(!"unexpected handoff");}
static struct {bool active,pending,replying;uint32_t generation;} protocol;
static bool permission,dispatching,handoff_requested,handoff_armed,file_link_requested,recovery;
static uint32_t local_generation,handoff_local,handoff_tick,handoff_link,m_link_generation;
static unsigned stack_inits,gap_inits,gatt_inits,service_inits,conn_inits,df_inits;
static void ble_stack_init(void){stack_inits++;}
static void gap_params_init(void){gap_inits++;}
static void gatt_init(void){gatt_inits++;}
static void services_init(void){service_inits++;}
static void conn_params_init(void){conn_inits++;}
static void df_core_init(void){df_inits++;}
static bool vfs_packed_recovery_required(void){return recovery;}
static bool safe_nfc(void){return true;}
static bool ui_ready(void){return true;}
static void ble_release_advertising_hold(void){}
static void ble_remote_receive(const uint8_t *data,size_t size){(void)data;(void)size;}
#define ble_remote_protocol_session(p,g,a) do{(p)->generation=(g);(p)->active=(a);}while(0)
#define ble_remote_protocol_poll(...) ((void)0)
'''
main = (SRC / 'ble_main.c').read_text()
remote = (SRC / 'ble_remote.c').read_text()
header += function(remote, 'ble_remote_dispatching') + '\n' + function(remote, 'ble_remote_response_pending') + '\n'
names = ('remote_init_step', 'ble_remote_init_phase', 'ble_remote_init_result', 'ble_init', 'advertising_init', 'advertising_start', 'ble_set_device_name', 'ble_addr_set', 'ble_apply_device_mode',
         'ble_adv_start', 'ble_stop_transport', 'ble_disable', 'ble_device_mode_prepare',
         'ble_pending_mode_poll', 'ble_nus_set_handler', 'ble_session_generation', 'ble_link_generation',
         'ble_remote_mode_active', 'ble_remote_mode_owned', 'ble_mode_transition_pending',
         'ble_transport_idle', 'ble_remote_transport_ready')
header += '\n'.join(function(main, name) for name in names)
header += '\n' + '\n'.join(function(remote, name) for name in
                            ('ble_remote_enabled', 'ble_remote_set_enabled', 'other_owner', 'ble_remote_poll'))
header += r'''
static void tick(void){ble_work_process(ble_on_disconnected);ble_pending_mode_poll();ble_remote_poll();}
static void reset(void){
    ble_work_disconnected();ble_work_set_handlers(NULL,NULL);ble_work_process(ble_on_disconnected);
    memset(&launcher,0,sizeof launcher);memset(&protocol,0,sizeof protocol);
    m_conn_handle=m_nus_session_handle=m_release_handle=65535;
    m_ble_initialized=m_sessions_enabled=m_remote_mode=m_file_mode=m_mode_pending=m_advertising_active=false;
    m_mode_adv_requested=m_mode_handlers_ready=m_mode_stop_requested=m_mode_wait_reply=false;
    m_advertising.p_adv_data=NULL;m_advertising.adv_mode_current=0;
    permission=dispatching=handoff_requested=handoff_armed=file_link_requested=recovery=false;
    stack_inits=gap_inits=gatt_inits=service_inits=conn_inits=df_inits=0;
    sdk_addr_result=sdk_name_result=sdk_adv_result=sdk_mtu_result=sdk_start_result=0;
    m_remote_start_retries=0;
    advertised=addr_calls=clock_tick=0;last_name=NULL;
}
int main(void){
    /* No file-transfer app or prior BLE initialization is required. */
    reset();tick();assert(!stack_inits&&!advertised);
    assert(ble_remote_set_enabled(true));tick();
    assert(stack_inits==1&&m_mode_pending&&!advertised&&ble_remote_enabled());
    tick();assert(advertised==1&&ble_remote_mode_active()&&!m_mode_pending);
    assert(!strcmp(last_name,"Pixl.Remote")&&ble_remote_init_phase()==BLE_REMOTE_INIT_READY&&!ble_remote_init_result());
    assert(configured_flags==6&&configured_timeout==0&&ble_work_cleanup_complete());
    for(unsigned i=0;i<100;i++)tick();
    assert(stack_inits==1&&gap_inits==1&&gatt_inits==1&&service_inits==1&&conn_inits==1&&df_inits==1&&advertised==1);
    assert(ble_remote_set_enabled(false));tick();assert(!ble_remote_mode_owned()&&!m_sessions_enabled);
    assert(ble_remote_set_enabled(true));tick();tick();assert(advertised==2&&stack_inits==1);

    /* Both BLE app owners block startup until they have left. */
    for(unsigned owner=0;owner<2;owner++){
        reset();launcher.file=owner==0;launcher.link=owner==1;ble_remote_set_enabled(true);
        for(unsigned i=0;i<4;i++)tick();assert(!stack_inits&&!advertised);
        launcher.file=launcher.link=false;tick();tick();assert(advertised==1);
    }
    /* Recovery and a real retained GAP link suppress remote reconfiguration. */
    reset();recovery=true;ble_remote_set_enabled(true);tick();tick();assert(!advertised);
    recovery=false;tick();tick();assert(advertised==1);
    reset();m_conn_handle=7;ble_remote_set_enabled(true);tick();tick();assert(!advertised&&!stack_inits);
    m_conn_handle=65535;ble_work_disconnected();tick();tick();assert(advertised==1);

    /* Permission cancellation while deferred configuration is pending. */
    reset();ble_remote_set_enabled(true);tick();ble_remote_set_enabled(false);ble_remote_poll();
    tick();assert(!m_mode_pending&&!m_sessions_enabled&&!advertised);
    /* A genuinely deferred SDK reply is retried without claiming visibility. */
    for(unsigned fault=0;fault<4;fault++){
        reset();ble_remote_set_enabled(true);tick();
        unsigned *slot=fault==0?&sdk_addr_result:fault==1?&sdk_name_result:fault==2?&sdk_mtu_result:&sdk_adv_result;
        *slot=NRF_ERROR_BUSY;tick();assert(m_mode_pending&&!advertised&&!m_sessions_enabled);
        *slot=0;tick();assert(!m_mode_pending&&advertised==1&&m_sessions_enabled);
    }
    reset();ble_remote_set_enabled(true);tick();sdk_start_result=NRF_ERROR_BUSY;tick();
    assert(ble_remote_init_phase()==BLE_REMOTE_INIT_START && !m_advertising_active);
    sdk_start_result=0;clock_tick=499;tick();assert(!m_advertising_active);
    clock_tick=500;tick();assert(m_advertising_active && ble_remote_init_phase()==BLE_REMOTE_INIT_READY);

    reset();ble_remote_set_enabled(true);tick();sdk_start_result=NRF_ERROR_INVALID_STATE;tick();
    for(unsigned n=1;n<=3;n++){clock_tick=500*n;tick();assert(!m_advertising_active);}
    sdk_start_result=0;clock_tick=5000;tick();assert(!m_advertising_active && !m_remote_start_retries);
    ble_remote_set_enabled(false);tick();ble_remote_set_enabled(true);tick();tick();assert(m_advertising_active);
    assert(!critical_depth);
    puts("PASS integrated remote startup, both owners, disconnect, SDK deferrals, bounded advertising retries and re-enable");
}
'''

with tempfile.TemporaryDirectory(prefix='remote-advertise-start-') as directory:
    directory = Path(directory)
    harness = directory / 'test.c'
    harness.write_text(header)
    (directory / 'app_util_platform.h').write_text('extern int critical_depth;\n#define CRITICAL_REGION_ENTER() do { critical_depth++;\n#define CRITICAL_REGION_EXIT() critical_depth--; } while(0)\n')
    arm = os.environ.get('PIXL_ARM32') == '1'
    sanitized = os.environ.get('PIXL_SANITIZE') == '1' and not arm
    executable = directory / 'test'
    cmd = ['arm-linux-gnueabihf-gcc' if arm else 'gcc', '-std=c11', '-O1', '-g', '-fshort-enums',
           '-Wall', '-Wextra', '-Werror', '-Wno-unused-function', '-Wno-unused-variable', '-Wno-misleading-indentation',
           '-I', str(directory), '-I', str(SRC), str(harness), str(SRC / 'ble_work.c'), '-o', str(executable)]
    if arm:
        cmd += ['-static']
    if sanitized:
        cmd += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
    for board in ('BOARD_OLED', 'BOARD_LCD'):
        subprocess.run(cmd + ['-D' + board], check=True, timeout=60)
        subprocess.run((['qemu-arm'] if arm else []) + [str(executable)], check=True, timeout=30)
        print('PASS', board, 'real foreground startup/cleanup integration; SDK/radio remain mocked')
