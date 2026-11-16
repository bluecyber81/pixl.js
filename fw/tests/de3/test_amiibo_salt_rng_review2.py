"""Actual UID/default/store helpers: first and second RNG failures are recoverable.

The NRF random and crypto boundaries are injected. Actual production tag layout,
UUID/BCC/default logic and output-commit paths are compiled. No real keys/data.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from root_host import function


def actual(text, name):
    definition = re.search(r'(?m)^(?:static )?(?:void|bool|ret_code_t|uint32_t) ' + re.escape(name) + r'\(', text)
    if not definition:
        raise ValueError(name)
    return function(text[definition.start():], name)


HARNESS = r'''
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <setjmp.h>
#include "ntag_def.h"
#define CHECK(x) do {if(!(x)){fprintf(stderr,"CHECK %d: %s\n",__LINE__,#x);return 71;}}while(0)
#define NRF_SUCCESS 0u
#define NRF_ERROR_INVALID_DATA 13u
#define NRF_ERROR_INVALID_PARAM 7u
#define NRF_ERROR_NOT_SUPPORTED 8u
#define NTAG215_SIZE 540
#define VERIFY_SUCCESS(code) do {if(code)return code;}while(0)
#define APP_ERROR_CHECK(code) do {if(code){fatal_errors++;longjmp(fault,1);}}while(0)
typedef unsigned ret_code_t;
typedef struct {int placeholder;} db_amiibo_t;
static jmp_buf fault;
static unsigned fatal_errors,random_calls,fail_random_call,pack_calls;
static bool crypto_ok=true,amiibo_keys_loaded=true;
static int amiibo_keys;
static const db_amiibo_t *get_amiibo_by_id(uint32_t h,uint32_t t){(void)h;(void)t;static db_amiibo_t known;return &known;}
static bool is_valid_amiibo_v3(uint32_t h,uint32_t t){(void)h;(void)t;return false;}
static ret_code_t utils_rand_bytes(uint8_t*out,uint8_t n){
    random_calls++;for(unsigned i=0;i<n;i++)out[i]=(uint8_t)(17*random_calls+i);
    return random_calls==fail_random_call?19u:NRF_SUCCESS;
}
static bool nfc3d_amiibo_unpack(const void*k,const uint8_t*in,uint8_t*out,bool v3){(void)k;(void)v3;memcpy(out,in,NTAG215_SIZE);return crypto_ok;}
static void nfc3d_amiibo_pack(const void*k,const uint8_t*in,uint8_t*out,bool v3){(void)k;(void)v3;pack_calls++;memcpy(out,in,NTAG215_SIZE);}
static bool is_valid_amiibo_ntag(const ntag_t *ntag);
/*ACTUAL_CONSTANTS*/
/*ACTUAL_FUNCTIONS*/
int main(int argc,char**argv){
    CHECK(argc==4);unsigned op=(unsigned)atoi(argv[1]),mode=(unsigned)atoi(argv[2]);
    ntag_t tag;memset(&tag,0xa5,sizeof(tag));tag.type=(op==1||op==3)?NTAG_I2C_PLUS_2K:NTAG_215;
    tag.data[0]=4;tag.data[84]=0x10;tag.data[88]=0x20;tag.read_only=true;
    strcpy((char*)tag.notes,"preserve metadata on rejected random source");ntag_t before=tag;
    if(mode==1)fail_random_call=1;
    if(mode==2)fail_random_call=2;
    if(mode==3)crypto_ok=false;
    if(mode==4)amiibo_keys_loaded=false;
    uint8_t manual[7]={4,1,2,3,4,5,6};volatile ret_code_t result=999;
    if(setjmp(fault)==0){
        if(op<2)result=amiibo_helper_rand_amiibo_uuid(&tag);
        else if(op<4)result=amiibo_helper_set_amiibo_uuid(&tag,manual);
        else if(op==4)result=amiibo_helper_generate_amiibo(0x100,0x200,&tag);
        else { /*STANDARD_CREATE_CALL*/ }
    }
    CHECK(!fatal_errors);
    if(mode==0){
        CHECK(result==NRF_SUCCESS&&pack_calls==(op==5?0u:1u));
        CHECK(random_calls==((op==2||op==3||op==5)?1u:2u));
        if(op<4)CHECK(!memcmp(before.notes,tag.notes,sizeof(tag.notes))&&tag.read_only==before.read_only&&tag.type==before.type);
        else CHECK(tag.type==NTAG_215&&!tag.read_only);
        FILE*f=fopen(argv[3],"wb");CHECK(f);CHECK(fwrite(&tag,1,sizeof(tag),f)==sizeof(tag));fclose(f);
    }else{
        CHECK(result==((mode==1||mode==2)?19u:NRF_ERROR_INVALID_DATA));
        CHECK(!pack_calls);CHECK(!memcmp(&tag,&before,sizeof(tag)));
        if(mode==4)CHECK(!random_calls);
    }
    printf("PASS actual helpers op=%u mode=%u random_calls=%u result=%u original-preserved-on-error\n",op,mode,random_calls,result);
    return 0;
}
'''


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--fw', type=Path, default=HERE.parents[1])
    p.add_argument('--out', type=Path)
    p.add_argument('--expect-original-failures', action='store_true')
    args = p.parse_args()
    temporary_output = tempfile.TemporaryDirectory(prefix='amiibo-review2-') if args.out is None else None
    if temporary_output is not None:
        args.out = Path(temporary_output.name)
    src = args.fw.resolve() / 'application/src'
    args.out.mkdir(parents=True, exist_ok=True)
    helper = (src / 'amiibo_helper.c').read_text()
    store = (src / 'ntag/ntag_store.c').read_text()
    utils = (src / 'utils.c').read_text()
    constants = '\n'.join(line for line in helper.splitlines() if line.startswith('#define '))
    constants += '\n' + '\n'.join(re.findall(r'static const uint8_t .*?\};', helper, re.S))
    start = store.index('const ntag_t default_ntag215 =')
    constants += '\n' + store[start:store.index('};', start) + 2]
    functions = [actual(store, name) for name in ['ntag_store_set_uuid', 'ntag_store_get_uuid',
                                                  'ntag_store_uuid_rand', 'ntag_store_new_rand']]
    functions += [actual(utils, 'int32_to_bytes_le')]
    functions += [actual(helper, name) for name in ['amiibo_helper_get_uuid', 'amiibo_helper_replace_uuid',
        'amiibo_helper_replace_password', 'amiibo_helper_set_defaults', 'amiibo_helper_is_key_loaded',
        'amiibo_helper_sign_new_ntag', 'amiibo_helper_rand_amiibo_uuid', 'amiibo_helper_set_amiibo_uuid',
        'amiibo_helper_generate_amiibo_ntag215', 'amiibo_helper_generate_amiibo',
        'to_little_endian_int32', 'is_valid_amiibo_ntag']]
    # The production definition is non-static; match its forward declaration.
    code = HARNESS.replace('static bool is_valid_amiibo_ntag(', 'bool is_valid_amiibo_ntag(')
    code = code.replace('/*ACTUAL_CONSTANTS*/', constants).replace('/*ACTUAL_FUNCTIONS*/', '\n'.join(functions))
    create_call = 'result=ntag_store_new_rand(&tag);' if 'ret_code_t ntag_store_new_rand' in store else 'ntag_store_new_rand(&tag);result=0;'
    code = code.replace('/*STANDARD_CREATE_CALL*/', create_call)
    cfile = args.out / 'actual_helpers.c';cfile.write_text(code)
    binary = args.out / 'actual_helpers'
    cmd = ['gcc', '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
           '-Wno-unused-function', '-Wno-unused-parameter', '-Wno-pointer-sign',
           '-fno-pie', '-no-pie', '-fsanitize=address,undefined', '-fno-sanitize-recover=all',
           '-fno-omit-frame-pointer', '-I', str(src / 'ntag'), str(cfile), '-o', str(binary)]
    built = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    (args.out / 'build.log').write_text(built.stdout + built.stderr)
    if built.returncode:
        raise RuntimeError(built.stdout + built.stderr)
    cases = []
    for op in range(6):
        modes = [0,1,2,3,4] if op < 2 else [0,1,3,4] if op < 4 else [0,1,2,4] if op == 4 else [0,1]
        for mode in modes:
            output = args.out / f'output_{op}_{mode}.bin'
            ran = subprocess.run([str(binary), str(op), str(mode), str(output)], capture_output=True,
                                 text=True, timeout=15, env=dict(os.environ, ASAN_OPTIONS='detect_leaks=0'))
            negative = (op < 2 and mode == 2) or (op in [2,3] and mode == 1) or (op == 4 and mode in [1,2]) or (op == 5 and mode == 1)
            expected = 71 if args.expect_original_failures and negative else 0
            cases.append({'op': op, 'mode': mode, 'expected': expected, 'returncode': ran.returncode,
                          'passed': ran.returncode == expected, 'stdout': ran.stdout, 'stderr': ran.stderr,
                          'successful_output_sha256': hashlib.sha256(output.read_bytes()).hexdigest()
                            if output.exists() and mode == 0 else None})
    report = {'passed': all(x['passed'] for x in cases), 'negative_control': args.expect_original_failures,
              'cases': cases, 'sanitizers': ['address', 'undefined'], 'leak_sanitizer': False,
              'source_sha256': {name: hashlib.sha256((src / name).read_bytes()).hexdigest()
                   for name in ['amiibo_helper.c','ntag/ntag_store.c','ntag/ntag_def.h','utils.c']},
              'device_access': False,
              'limits': ['Actual source helper/store code with synthetic RNG and crypto boundaries.',
                         'No real keys, tag data, physical NFC, or complete target-build stack measurement.']}
    (args.out / 'RESULTS.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f"{'PASS' if report['passed'] else 'FAIL'} {len(cases)} helper cases; "
          f"{sum(x['returncode']==71 for x in cases)} original failure reproductions")
    if not report['passed']:
        for case in cases:
            if not case['passed']:print(case)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
