"""Actual remote bridge and GAP/NUS/workqueue handoff, SDK/UI boundaries modeled.

No hardware access. Boundary IRQs are delivered when the outer application IRQ
guard exits; this does not model SoftDevice radio scheduling or browser timing.
"""
import argparse,hashlib,json,os,re,subprocess,tempfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
FW=HERE.parents[1]
BLE=FW/'application/src/mod/ble'
SCENE=FW/'application/src/app/ble/scene/ble_scene_connect_start.c'
CASES=('atomic_first_frame','backpressure','sdk_error','stale_epoch','cccd_before','cccd_after',
       'disconnect_after','normal_disconnect','local_exit','mode_pending','malformed_bounds','wrong_peer_adopt')
strip=lambda s:re.sub(r'(?m)^\s*#include[^\n]*\n','',s)
def function(text,name):
    match=re.search(r'^(?:static\s+)?(?:void|bool|uint32_t|ble_link_state_t|ret_code_t)\s+'+name+r'\([^;]*?\)\s*\{',text,re.M)
    assert match,name
    end=text.index('{',match.start())+1;depth=1
    while depth:
        depth+=(text[end]=='{')-(text[end]=='}');end+=1
    return text[match.start():end]
def main_code():
    from test_ble_session_de326 import GLOBALS
    ble=(BLE/'ble_main.c').read_text(encoding='utf8')
    code=(HERE/'ble_session_de326.c.in').read_text().split('int main(',1)[0]
    code=code.replace('static void ble_file_link_poll(void) {} /* DE351 suite compiles the actual handoff owner. */','static void ble_file_link_poll(void);')
    code=code.replace('static int critical_depth, irq;','static int critical_depth, irq;\nstatic void (*pending_irq)(void);\nstatic void critical_exit(void){if(--critical_depth==0&&pending_irq){void(*f)(void)=pending_irq;pending_irq=NULL;f();}}')
    code=code.replace('#define CRITICAL_REGION_EXIT() --critical_depth; } while(0)','#define CRITICAL_REGION_EXIT() critical_exit(); } while(0)')
    code=code.replace('#define NRF_ERROR_INVALID_STATE 8','#define NRF_ERROR_INVALID_STATE 8\n#define NRF_ERROR_RESOURCES 19\n#define NRF_ERROR_DATA_SIZE 12')
    code=code.replace('/* GLOBALS */','\n'.join(re.search(r'^static[^\n]*\b'+n+r'\b[^\n]*;[^\n]*',ble,re.M)[0] for n in (*GLOBALS,'m_file_link_generation')))
    code=code.replace('/* ACTUAL_JOIN_TIMEOUT */',re.search(r'^#define BLE_FILE_JOIN_TIMEOUT_TICKS[^\n]*',ble,re.M)[0])
    code=code.replace('/* ACTUAL_WORK */',strip((BLE/'ble_work.c').read_text()))
    names=('nus_data_handler','ble_file_join_poll','ble_release_stopped_session','ble_process_pending','ble_link_state_get','ble_status_state_get','ble_stop_transport','ble_disable')
    code=code.replace('/* ACTUAL_BLE */','\n'.join(function(ble,n) for n in names))
    code=code.replace('/* CONNECT */',ble.split('case BLE_GAP_EVT_CONNECTED:',1)[1].split('case BLE_GAP_EVT_DISCONNECTED:',1)[0])
    code=code.replace('/* DISCONNECT */',ble.split('case BLE_GAP_EVT_DISCONNECTED:',1)[1].split('case BLE_GAP_EVT_PHY_UPDATE_REQUEST:',1)[0])
    tail=(HERE/'ble_same_link_main_de351.c.in').read_text()
    names=('ble_remote_mode_active','ble_remote_transport_ready','ble_nus_tx_data','ble_remote_open_file_link','ble_file_link_adopt','ble_file_link_poll')
    tail=tail.replace('/* ACTUAL_HANDOFF */','\n'.join(function(ble,n) for n in names))
    tail=tail.replace('/* ACTUAL_SCENE */',function(SCENE.read_text(),'ble_scene_connect_start_on_enter'))
    return code+'\n'+tail
def bridge_code():
    base=(HERE/'ble_remote_de347.c.in').read_text().split('int main(',1)[0]
    hook='''
static bool inject_local_after_claim;
void test_critical_exit(void) {
    if(--critical_depth==0 && inject_local_after_claim && dispatching && !file_link_requested) {
        inject_local_after_claim=false;ble_remote_local_activity();
    }
}
'''
    return base.replace('/* ACTUAL_REMOTE_SOURCE */',strip((BLE/'ble_remote.c').read_text()))+hook+(HERE/'ble_same_link_remote_de351.c.in').read_text()
def run(report_path=None):
    arm=os.environ.get('PIXL_ARM32')=='1';san=os.environ.get('PIXL_SANITIZE')=='1' and not arm
    sources=[BLE/n for n in ('ble_main.c','ble_main.h','ble_work.c','ble_work.h','ble_remote.c','ble_remote_protocol.c','ble_remote_protocol.h')]+[SCENE,Path(__file__)]
    sources += [HERE/n for n in ('ble_same_link_main_de351.c.in','ble_same_link_remote_de351.c.in','ble_session_de326.c.in','test_ble_session_de326.py','ble_remote_de347.c.in')]
    hashes=lambda:{str(p.relative_to(FW)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
    report={'device_access':False,'runtime':'arm32' if arm else 'asan_ubsan' if san else 'native','source_sha256':hashes(),'runs':[]}
    with tempfile.TemporaryDirectory(prefix='ble-same-link-de351-') as tmp:
        p=Path(tmp);c=p/'harness.c';exe=p/'test.exe'
        (p/'app_util_platform.h').write_text('extern int critical_depth;\nvoid test_critical_exit(void);\n#define CRITICAL_REGION_ENTER() do { critical_depth++;\n#define CRITICAL_REGION_EXIT() test_critical_exit(); } while(0)\n')
        flags=['arm-linux-gnueabihf-gcc' if arm else 'gcc','-std=c11','-O1','-g','-fshort-enums','-Wall','-Wextra','-Werror','-Wno-unused-function','-Wno-unused-parameter','-Wno-misleading-indentation','-I',str(p),'-I',str(BLE)]
        if arm:flags+=['-static']
        if san:flags+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
        def compile_run(name,code,args=(),extra=(),negative=False):
            c.write_text(code,encoding='utf8')
            built=subprocess.run(flags+[str(c),*map(str,extra),'-o',str(exe)],capture_output=True,text=True,timeout=60)
            assert built.returncode==0,built.stdout+built.stderr
            ran=subprocess.run((['qemu-arm'] if arm else [])+[str(exe),*args],capture_output=True,text=True,timeout=45)
            report['runs'].append({'name':name,'negative':negative,'exit_code':ran.returncode,'output':ran.stdout+ran.stderr})
            assert (ran.returncode==71 if negative else ran.returncode==0),report['runs'][-1]
        code=main_code()
        c.write_text(code,encoding='utf8')
        built=subprocess.run(flags+[str(c),'-o',str(exe)],capture_output=True,text=True,timeout=60)
        assert built.returncode==0,built.stdout+built.stderr
        for case in CASES:
            ran=subprocess.run((['qemu-arm'] if arm else [])+[str(exe),case],capture_output=True,text=True,timeout=15)
            report['runs'].append({'name':case,'exit_code':ran.returncode,'output':ran.stdout+ran.stderr})
            assert ran.returncode==0,report['runs'][-1]
        compile_run('remote_bridge',bridge_code(),extra=[BLE/'ble_remote_protocol.c',BLE/'ble_work.c'])
        # Demonstrate that queued old bytes and premature IRQ delivery are detectable.
        bad=code.replace('ble_work_set_handlers(ble_on_received_data, ble_on_transmit_ready);\n            ble_work_connected();','/* mutant: keep remote handler and old queue */')
        assert bad!=code
        compile_run('reject_old_queue_mutant',bad,['atomic_first_frame'],negative=True)
        bad=code.replace('m_remote_mode = false;\n            m_file_mode = true;','critical_exit(); ++critical_depth;\n            m_remote_mode = false;\n            m_file_mode = true;')
        assert bad!=code
        compile_run('reject_early_irq_mutant',bad,['atomic_first_frame'],negative=True)
    assert hashes()==report['source_sha256'],'source changed during test'
    report['passed']=True
    report['limits']=['SDK status and GAP/NUS events are modeled; actual production queue, bridge, policy and scene enter compile unchanged.','No actual RF/browser/phone, physical NFC or boot timing proof.','Remote bridge tests stub main handoff; the separate main suite compiles that actual handoff and receives a file frame at outer IRQ unlock.']
    if report_path:
        report_path.parent.mkdir(parents=True,exist_ok=True);report_path.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print(f'PASS {len(CASES)} main scenarios, remote bridge, 2 negative controls ({report["runtime"]})')
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--report',type=Path);args=parser.parse_args();run(args.report)
