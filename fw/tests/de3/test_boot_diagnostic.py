"""Actual read-only boot observer, DF framing, SDK CRC32/SHA256 and Nordic layout.

Hardware/registers/radio are synthetic. No device, flash writes or bootloader
settings initialization. Crypto fixture files are byte-exact from the pinned SDK.
"""
import argparse
import ast
import hashlib
import inspect
import json
from pathlib import Path
import struct
import subprocess
import tempfile
import test_dfu_transfer_guard as fixture

HERE=Path(__file__).resolve().parent
FW=HERE.parents[1]
SRC=FW/'application/src'
VENDOR=HERE/'boot_diag_fixture'

REGISTERS=r'''
#pragma once
#include <stdint.h>
#include <stddef.h>
#include <assert.h>
typedef struct { uint32_t CODEPAGESIZE,CODESIZE; struct { uint32_t PART,VARIANT,FLASH,RAM; } INFO; } test_ficr_t;
typedef struct { uint32_t NRFFW[2]; } test_uicr_t;
static test_ficr_t ficr;
static test_uicr_t uicr;
#define NRF_FICR (&ficr)
#define NRF_UICR (&uicr)
static _Alignas(4) uint8_t test_flash[0x80000];
static unsigned flash_reads;
static const uint8_t *test_flash_ptr(uint32_t address) {
    assert(ficr.CODEPAGESIZE==4096&&ficr.CODESIZE==128&&ficr.INFO.PART==0x52832);
    assert(ficr.INFO.FLASH==512&&ficr.INFO.RAM==64);
    assert(address<sizeof(test_flash)&&!critical_depth);
    ++flash_reads; return test_flash+address;
}
#define BOOT_DIAG_FLASH_PTR(address) test_flash_ptr(address)
'''

MBR=r'''
#pragma once
#define MBR_SIZE 0x1000u
#define MBR_PAGE_SIZE_IN_WORDS 1024u
#define MBR_BOOTLOADER_ADDR 0xff8u
#define MBR_PARAM_PAGE_ADDR 0xffcu
#define MBR_UICR_BOOTLOADER_ADDR (&NRF_UICR->NRFFW[0])
#define MBR_UICR_PARAM_PAGE_ADDR (&NRF_UICR->NRFFW[1])
'''

SDM=r'''
#pragma once
#define SOFTDEVICE_INFO_STRUCT_OFFSET 0x2000u
#define SOFTDEVICE_INFO_STRUCT_ADDRESS 0x3000u
#define SD_VERSION_OFFSET 0x2014u
#define SD_INFO_STRUCT_SIZE_GET(base) (*test_flash_ptr((base)+0x2000))
#define SD_SIZE_GET(base) (*(const uint32_t*)test_flash_ptr((base)+0x2008))
#define SD_ID_GET(base) (*(const uint32_t*)test_flash_ptr((base)+0x2010))
#define SD_VERSION_GET(base) (*(const uint32_t*)test_flash_ptr((base)+0x2014))
#define SD_FWID_GET(base) (*(const uint16_t*)test_flash_ptr((base)+0x200c))
'''

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report',type=Path)
    parser.add_argument('--wire-fixture',type=Path)
    parser.add_argument('--sanitize',action='store_true')
    parser.add_argument('--negative-controls',action='store_true')
    args=parser.parse_args()
    vendor=json.loads((VENDOR/'SOURCES.json').read_text())
    for name,row in vendor['files'].items():
        assert hashlib.sha256((VENDOR/name).read_bytes()).hexdigest()==row['sha256'],name
    report={'device_access':False,'sanitizers':args.sanitize,'cases':[], 'sdk':vendor,
            'source_sha256':{p:hashlib.sha256((SRC/p).read_bytes()).hexdigest()
                             for p in list(fixture.PRODUCTION)+['mod/boot_diag.c','mod/boot_diag.h']},
            'limits':['Synthetic hardware/radio; no physical Bluetooth or bootloader readback.',
                      'CRC validates settings2 header bytes4..91, not signature or full settings page.',
                      'Boot fingerprint includes padding and excludes known MBR/settings pages; no full backup.',
                      'No manufacturer/board/display identity or replacement compatibility established.']}
    with tempfile.TemporaryDirectory(prefix='pixl-boot-diag-') as temporary:
        folder=Path(temporary)
        tree=ast.parse(inspect.getsource(fixture.main))
        stubs=next(ast.literal_eval(n.value) for n in ast.walk(tree) if isinstance(n,ast.Assign)
                   and any(isinstance(t,ast.Name) and t.id=='stubs' for t in n.targets))
        stubs.update({'nrf.h':REGISTERS,'nrf_mbr.h':MBR,'nrf_sdm.h':SDM,
                      'nrf_bootloader_info.h':'#pragma once\n#define SD_PRESENT (*(const uint32_t*)test_flash_ptr(0x3004)==0x51b1e5dbu)\n',
                      'sdk_common.h':'#pragma once\n#define NRF_MODULE_ENABLED(name) 1\n#define STATIC_ASSERT(...) _Static_assert(__VA_ARGS__)\n#define ANON_UNIONS_ENABLE\n#define ANON_UNIONS_DISABLE\n',
                      'sdk_config.h':'#pragma once\n',
                      'boot_mbedtls.h':'#pragma once\n#define MBEDTLS_SHA256_C\n'})
        for name,value in stubs.items(): (folder/name).write_text(value)
        def build(name,mutation=None):
            harness=(HERE/'ble_mtu_host.c').read_text().split('int main(',1)[0]
            harness='\n'.join(line for line in harness.splitlines() if not line.startswith('static const df_cmd_entry_t capture_entries[]='))+'\n'
            module=SRC/'mod/boot_diag.c'
            if mutation:
                old,new=mutation;code=module.read_text();assert code.count(old)==1
                # Keep the original relative settings include resolvable.
                code=code.replace('#include "../app/settings/scene/settings_device_info.h"',
                                  '#include "'+(SRC/'app/settings/scene/settings_device_info.h').as_posix()+'"')
                module=folder/(name+'_module.c');module.write_text(code.replace(old,new))
            protocol='#include "'+module.as_posix()+'"\n'+'\n'.join('#include "'+(SRC/p).as_posix()+'"' for p in fixture.PRODUCTION)
            harness=harness.replace('/* ACTUAL_PROTOCOL_INCLUDES */',protocol)
            ble=(SRC/'mod/ble/ble_main.c').read_text()
            harness=harness.replace('/* ACTUAL_BLE_FUNCTIONS */','\n'.join(fixture.function(ble,s) for s in
                ('ret_code_t ble_nus_tx_data(','size_t ble_nus_max_data_length(','void ble_nus_abort_transfer(')))
            harness+='\nvoid mbedtls_platform_zeroize(void *data,size_t size){volatile unsigned char *p=data;while(size--)*p++=0;}\n'
            harness+=(HERE/'boot_diag_host.c').read_text()
            c=folder/(name+'.c');c.write_text(harness);exe=folder/(name+'.exe')
            command=['gcc','-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-Wno-unused-parameter',
                     '-Wno-sign-compare','-Wno-unused-function','-DNRF52_SERIES','-DNRF52832_XXAA',
                     '-DPIXL_BOOT_DIAGNOSTICS=1','-DMBEDTLS_CONFIG_FILE="boot_mbedtls.h"']
            for include in (folder,VENDOR,SRC/'mod',SRC/'mod/df',SRC/'mod/vfs',SRC/'mod/ble'):
                command+=['-I',str(include)]
            if args.sanitize:command+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
            result=subprocess.run(command+[str(c),str(VENDOR/'crc32.c'),str(VENDOR/'sha256.c'),'-o',str(exe)],capture_output=True,text=True,timeout=60)
            assert result.returncode==0,result.stdout+result.stderr
            return exe
        exe=build('candidate')
        for mtu in (23,185,250):
            for scenario in range(17):
                run=subprocess.run([str(exe),str(scenario),str(mtu)],capture_output=True,text=True,timeout=20)
                row={'mtu':mtu,'scenario':scenario,'exit_code':run.returncode,'output':run.stdout+run.stderr}
                report['cases'].append(row);assert run.returncode==0,row
                print(run.stdout,end='')
                if scenario==0:
                    wire=next(s[5:] for s in run.stdout.splitlines() if s.startswith('WIRE '));raw=bytes.fromhex(wire)
                    assert len(raw)==128
                    image=bytearray((i*17+3)&255 for i in range(0x77000,0x7e000))
                    struct.pack_into('<II',image,0,0x20010000,0x77081)
                    assert raw[80:112]==hashlib.sha256(image).digest()
                    if 'wire_fixture_hex' in report:assert report['wire_fixture_hex']==wire
                    report['wire_fixture_hex']=wire
        report['negative_controls']=[]
        if args.negative_controls:
            controls=[('trust_corrupt_settings',('stored_crc != UINT32_MAX && crc == stored_crc','stored_crc != UINT32_MAX'),6),
                      ('ignore_parameter_layout',('(flags & (1u << 8)) &&','true &&'),8),
                      ('mask_reset_thumb',('(reset & 1u) &&','true &&'),5)]
            for name,mutation,scenario in controls:
                control=build(name,mutation)
                run=subprocess.run([str(control),str(scenario),'23'],capture_output=True,text=True,timeout=20)
                assert run.returncode==71 and 'CHECK' in run.stderr,(name,run.returncode,run.stderr)
                report['negative_controls'].append({'name':name,'exit_code':run.returncode,'output':run.stderr.strip()})
                print('PASS rejected control',name)
    report['passed']=True
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2)+'\n')
    if args.wire_fixture:
        args.wire_fixture.parent.mkdir(parents=True,exist_ok=True)
        args.wire_fixture.write_text(json.dumps({'hex':report['wire_fixture_hex'],'source':'actual C observer with mock registers, real SDK CRC32/SHA256','physical_device':False,'source_sha256':report['source_sha256']},indent=2)+'\n')
    print('PASS 51 actual-C boot diagnostic cases; no device access')

if __name__=='__main__':main()
