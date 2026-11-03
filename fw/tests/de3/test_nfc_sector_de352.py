"""SECTOR_SELECT framing and recovery against the actual NFC parser/HAL.

NXP NT3H2111/2211 rev. 3.6 section 10.12: C2 FF, then sector + 3 RFU
bytes (CRC is removed by HAL). RFU values and existing sector mapping stay
unchanged. SDK/RF timing is modeled; no device or private collection is read.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile

FW = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('nfc_sector_helper', FW/'tests/de2/test_cache_nfc.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

def harness(root):
    ntag = (root/'application/src/ntag/ntag_emu_v2.c').read_text(encoding='utf8')
    hal = (root/'application/src/hal/hal_nfc_t2t.c').read_text(encoding='utf8')
    code = (FW/'tests/de2/ec_nfc_host.c').read_text(encoding='utf8').split('int main(void) {')[0]
    code = code.replace('#define NRF_SUCCESS 0', r'''#undef assert
#define assert(c) do { if (!(c)) { fprintf(stderr,"FAIL line %d: %s\n",__LINE__,#c); exit(71); } } while(0)
#define NRF_SUCCESS 0''')
    code = code.replace('/* ACTUAL_NFC_FUNCTIONS */',
        helper.function(hal, 'ret_code_t hal_nfc_send(')+'\n'+
        ntag[ntag.index('typedef enum {'):ntag.index('/* One shared snapshot')]+'\n'+
        helper.function(ntag, 'static void nfc_received_process('))
    return code + r'''
static unsigned scenarios;
static void recover_read(uint8_t *data) {
    const uint8_t read[] = {NFC_CMD_READ, 0};
    reset_io(); nfc_received_process(read,sizeof(read),data);
    assert(ack == -1 && tx_calls == 1 && registers.TXD.AMOUNT == 16);
    assert(!memcmp((const void *)m_nfc_buffer,data,16));
    assert(!ntag_emu.is_selecting_sector && ntag_emu.sector == 0 && !ntag_emu.dirty);
}
static void begin(uint8_t *data) {
    const uint8_t first[] = {NFC_CMD_SECTOR_SELECT,0xff};
    reset_io(); nfc_received_process(first,sizeof(first),data);
    assert(ack == 0xa && ntag_emu.is_selecting_sector && !tx_calls && !passive_calls);
}
int main(int argc,char **argv) {
    assert(argc == 2);
    for (unsigned type=0; type<2; ++type) {
        uint8_t *data = new_tag(type ? NTAG_I2C_PLUS_2K : NTAG_215);
        size_t size = _ntag_data_size(&ntag_emu.ntag);
        uint8_t *before=malloc(size); assert(before); memcpy(before,data,size);
        if (!strcmp(argv[1],"first")) {
            for (size_t n=1;n<=72;++n) {
                if (n==2) continue;
                uint8_t *p=calloc(n,1); assert(p); p[0]=NFC_CMD_SECTOR_SELECT;
                if (n>1) p[1]=0xff;
                expect_nack(p,n,data);
                assert(!ntag_emu.is_selecting_sector && ntag_emu.sector==0 && !passive_calls);
                recover_read(data); free(p); ++scenarios;
            }
            for (unsigned arg=0;arg<255;++arg) {
                const uint8_t p[]={NFC_CMD_SECTOR_SELECT,(uint8_t)arg};
                expect_nack(p,sizeof(p),data);
                assert(!ntag_emu.is_selecting_sector && ntag_emu.sector==0 && !passive_calls);
                recover_read(data); ++scenarios;
            }
        } else if (!strcmp(argv[1],"second")) {
            for (size_t n=0;n<=72;++n) {
                if (n==4) continue;
                uint8_t *p=n ? calloc(n,1):NULL;
                if (n) { assert(p); p[0]=1; }
                begin(data); expect_nack(p,n,data);
                assert(!ntag_emu.is_selecting_sector && ntag_emu.sector==0 && !passive_calls);
                recover_read(data); free(p); ++scenarios;
            }
            /* Lost packet 2 followed by a normal READ must not select 0x30. */
            const uint8_t read[]={NFC_CMD_READ,0};
            begin(data); expect_nack(read,sizeof(read),data);
            assert(!ntag_emu.is_selecting_sector && ntag_emu.sector==0 && !passive_calls);
            recover_read(data); ++scenarios;
        } else {
            assert(!strcmp(argv[1],"valid"));
            choose_sector(0,data); recover_read(data); ++scenarios;
            if (type) {
                choose_sector(1,data);
                const uint8_t read[]={NFC_CMD_READ,0};
                reset_io(); nfc_received_process(read,sizeof(read),data);
                assert(ack==-1 && registers.TXD.AMOUNT==16);
                assert(!memcmp((const void *)m_nfc_buffer,data+1024,16));
                const uint8_t fast[]={NFC_CMD_FAST_READ,0,2};
                reset_io(); nfc_received_process(fast,sizeof(fast),data);
                assert(ack==-1 && registers.TXD.AMOUNT==12);
                assert(!memcmp((const void *)m_nfc_buffer,data+1024,12));
                choose_sector(0,data); recover_read(data); ++scenarios;
            }
            /* Preserve permissive RFU handling; this fix only checks shape. */
            for (unsigned rfu=0;rfu<256;++rfu) {
                const uint8_t p[]={0,(uint8_t)rfu,(uint8_t)(rfu^0x5a),(uint8_t)(rfu^0xa5)};
                begin(data); reset_io(); nfc_received_process(p,sizeof(p),data);
                assert(ack==-1 && passive_calls==1 && !tx_calls && !ntag_emu.is_selecting_sector);
                recover_read(data); ++scenarios;
            }
        }
        assert(!memcmp(before,data,size)); free(before); free(data);
    }
    printf("PASS SECTOR_SELECT %s: %u scenarios\n",argv[1],scenarios); return 0;
}
'''

def run(report_path=None, baseline_root=None):
    arm=os.environ.get('PIXL_ARM32')=='1'
    sanitize=os.environ.get('PIXL_SANITIZE')=='1' and not arm
    runtime='arm32' if arm else 'asan_ubsan' if sanitize else 'native'
    tracked=[FW/'application/src/ntag/ntag_emu_v2.c',FW/'application/src/hal/hal_nfc_t2t.c',Path(__file__),FW/'tests/de2/ec_nfc_host.c',FW/'tests/de2/test_cache_nfc.py']
    hashes={str(p.relative_to(FW)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in tracked}
    report={'runtime':runtime,'device_access':False,'source_sha256':hashes,'runs':[],
            'reference':'https://www.nxp.com/docs/en/data-sheet/NT3H2111_2211.pdf',
            'reference_section':'Rev. 3.6 section 10.12, pages 56-57, Figure 28'}
    with tempfile.TemporaryDirectory(prefix='de352-nfc-sector-') as temp:
        folder=Path(temp); c=folder/'sector.c'; exe=folder/('sector.exe' if os.name=='nt' else 'sector')
        flags=['arm-linux-gnueabihf-gcc' if arm else os.environ.get('CC','gcc'),'-std=c11','-O1','-g','-fshort-enums','-Wall','-Wextra','-Werror','-Wno-pointer-to-int-cast','-Wno-unused-parameter','-Wno-unused-function','-I',str(FW/'application/src/ntag')]
        if arm: flags+=['-static']
        if sanitize: flags+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
        def check(name,source,cases,negative=False):
            c.write_text(source,encoding='utf8')
            built=subprocess.run(flags+[str(c),'-o',str(exe)],capture_output=True,text=True,timeout=60)
            assert built.returncode==0,built.stdout+built.stderr
            for case in cases:
                result=subprocess.run((['qemu-arm'] if arm else [])+[str(exe),case],capture_output=True,text=True,timeout=45)
                item={'name':name+'-'+case,'negative':negative,'exit_code':result.returncode,'output':result.stdout+result.stderr}
                report['runs'].append(item)
                assert result.returncode==(71 if negative else 0),item
        code=harness(FW)
        check('candidate',code,('first','second','valid'))
        # Each independent validation must be observed by its own test.
        old_first='''        if (data_length != 2 || p_data[1] != 0xff) {
            hal_send_ack_nack(0x0);
            break;
        }
'''
        old_second='''        if (data_length != 4) {
            hal_send_ack_nack(0x0);
            return;
        }
'''
        assert old_first in code and old_second in code
        check('missing-first-guard',code.replace(old_first,''),('first',),True)
        check('missing-second-guard',code.replace(old_second,''),('second',),True)
        if baseline_root:
            old=harness(baseline_root)
            check('baseline-reproduces',old,('first','second'),True)
            check('baseline-valid',old,('valid',))
    report['passed']=True
    report['limits']=['Actual parser and TX-copy code compiled, RF/SDK peripheral behavior modeled.','No on-device or physical NFC timing/game test.','RFU values and sector range retained for compatibility.']
    if report_path:
        report_path.parent.mkdir(parents=True,exist_ok=True)
        report_path.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print(f'PASS NFC sector framing/recovery ({runtime}); 2 independent negative controls')
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--report',type=Path)
    parser.add_argument('--baseline-root',type=Path)
    args=parser.parse_args(); run(args.report,args.baseline_root)
