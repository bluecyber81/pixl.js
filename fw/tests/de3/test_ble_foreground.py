"""Compile the actual bounded BLE queue; inject IRQ-like resets during callbacks."""
from pathlib import Path
import shutil
import re
import subprocess
import tempfile
import unittest

FW = Path(__file__).resolve().parents[2]
SRC = FW / 'application/src/mod/ble'

STUB = r'''
#include <stdint.h>
extern int critical_depth;
#define CRITICAL_REGION_ENTER() do { critical_depth++;
#define CRITICAL_REGION_EXIT() critical_depth--; } while (0)
'''
HARNESS = r'''
#include <assert.h>
#include <string.h>
#include "ble_work.h"
int critical_depth;
static char events[100];
static unsigned n;
static int mode;
static void clean(void) { assert(!critical_depth); events[n++]='C'; }
static void tx(void) { assert(!critical_depth); events[n++]='T'; }
static void rx2(const uint8_t *p,size_t len) { assert(!critical_depth && len); events[n++]='Z'; }
static void rx(const uint8_t *p,size_t len) {
    assert(!critical_depth && len);
    events[n++]=p[0];
    if (mode==1) {
        mode=0;
        ble_work_disconnected();
        ble_work_connected();
        uint8_t next='B'; assert(ble_work_receive(&next,1));
        assert(!ble_work_can_send()); /* old handler cannot reply to new peer */
        assert(p[0]=='A'); /* queued RX memory cannot replace active frame */
        unsigned before=n; ble_work_process(clean); assert(n==before);
    } else if (mode==2) {
        uint8_t next='R'; assert(ble_work_receive(&next,1));
    }
}
static void reset(void) {
    mode=0; ble_work_disconnected(); ble_work_set_handlers(rx,tx);
    ble_work_connected(); ble_work_process(clean); n=0; memset(events,0,sizeof(events));
}
int main(int argc,char **argv) {
    int test=argv[1][0]-'0'; uint8_t data[BLE_WORK_DATA_SIZE+1]; memset(data,'A',sizeof(data));
    if(test==0) {
        assert(!ble_work_can_send()); assert(ble_work_receive(data,1));
        ble_work_process(clean); assert(n==0);
    } else if(test==1) {
        reset(); assert(ble_work_receive(data,sizeof(data)-1)); data[0]='X';
        assert(ble_work_tx_ready()); assert(ble_work_receive(data,1));
        assert(n==0); ble_work_process(clean); assert(n==3 && !memcmp(events,"ATX",3));
        assert(ble_work_can_send());
    } else if(test==2) {
        reset(); for(int i=0;i<BLE_WORK_CAPACITY;i++) assert(ble_work_receive(data,1));
        assert(!ble_work_receive(data,1)); assert(!ble_work_can_send());
        ble_work_process(clean); assert(n==1 && events[0]=='C');
        assert(ble_work_receive(data,1)); ble_work_process(clean); assert(n==1);
    } else if(test==3) {
        reset(); assert(!ble_work_receive(data,sizeof(data))); ble_work_process(clean);
        assert(n==1 && events[0]=='C'); reset(); assert(!ble_work_receive(NULL,1));
        ble_work_process(clean); assert(n==1 && events[0]=='C');
    } else if(test==4) {
        reset(); assert(ble_work_receive(data,1)); assert(ble_work_tx_ready());
        ble_work_disconnected(); ble_work_connected(); data[0]='B';
        assert(ble_work_receive(data,1)); ble_work_process(clean);
        assert(n==2 && !memcmp(events,"CB",2));
    } else if(test==5) {
        reset(); assert(ble_work_receive(data,1)); ble_work_set_handlers(rx2,NULL);
        assert(ble_work_receive(data,1)); assert(ble_work_tx_ready());
        ble_work_process(clean); assert(n==2 && !memcmp(events,"CZ",2));
    } else if(test==6) {
        reset(); mode=1; assert(ble_work_receive(data,1)); ble_work_process(clean);
        assert(n==3 && !memcmp(events,"ACB",3)); assert(ble_work_can_send());
    } else if(test==7) {
        reset(); mode=2; assert(ble_work_receive(data,1)); ble_work_process(clean);
        assert(n==BLE_WORK_CAPACITY+1); mode=0; ble_work_process(clean);
        assert(n==BLE_WORK_CAPACITY+2);
    } else if(test==8) {
        reset(); for(unsigned i=0;i<20;i++) {
            assert(ble_work_receive(data,1)); ble_work_process(clean);
        } assert(n==20); ble_work_disconnected(); ble_work_process(clean);
        assert(n==21 && events[20]=='C' && !ble_work_can_send());
    } else return 2;
    assert(critical_depth==0); return 0;
}
'''

class Foreground(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        gcc = shutil.which('gcc')
        if not gcc:
            raise RuntimeError('Existing GCC required; refusing untested PASS')
        cls.temp = tempfile.TemporaryDirectory()
        cls.path = Path(cls.temp.name)
        (cls.path / 'app_util_platform.h').write_text(STUB)
        (cls.path / 'harness.c').write_text(HARNESS)
        cls.exe = cls.path / 'ble_test.exe'
        subprocess.run([gcc, '-std=c11', '-Wall', '-Wextra', '-Werror', '-Wno-unused-parameter',
                        '-I'+str(cls.path), '-I'+str(SRC), str(SRC/'ble_work.c'),
                        str(cls.path/'harness.c'), '-o', str(cls.exe)], check=True, capture_output=True)

    @classmethod
    def tearDownClass(cls): cls.temp.cleanup()

    def test_queue_and_session_scenarios(self):
        for scenario in range(9):
            with self.subTest(scenario=scenario):
                subprocess.run([str(self.exe),str(scenario)], check=True, timeout=10)

    def test_foreground_integration(self):
        main = (FW/'application/src/main.c').read_text(encoding='utf-8')
        ble = (SRC/'ble_main.c').read_text(encoding='utf-8')
        self.assertIn('ble_process_pending();\n        app_sched_execute();',main)
        self.assertIn('ble_work_process(ble_on_disconnected);',ble)
        self.assertNotIn('        ble_on_disconnected();',ble)
        self.assertIn('ble_work_connected();',ble)
        self.assertIn('ble_work_disconnected();',ble)
        self.assertNotIn('nus_event_async_call',ble)
        self.assertIn('ble_work_can_send()',ble)
        self.assertIn('mod/ble/ble_work.c', (FW/'application/Makefile').read_text(encoding='utf-8'))
        sdk = (FW/'application/config/sdk_config.h').read_text(encoding='utf-8')
        header = (SRC/'ble_work.h').read_text(encoding='utf-8')
        mtu = int(re.search(r'^#define NRF_SDH_BLE_GATT_MAX_MTU_SIZE (\d+)',sdk,re.M)[1])
        capacity = int(re.search(r'^#define BLE_WORK_DATA_SIZE (\d+)',header,re.M)[1])
        self.assertEqual(capacity,mtu-3)

if __name__=='__main__': unittest.main()
