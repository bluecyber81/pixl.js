"""Actual key-import/KDF code with synthetic key-shaped bytes only.

No private keys, tag dumps, radio, signing or device access. Host DRBG stub
captures only the seed to prove unchanged KDF preparation; it is not crypto QA.
--baseline FW demonstrates both old import failures without crashing a process.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shlex
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]

def extract(text, signature):
    start = text.index('\n' + signature) + 1
    opening = text.index('{', start)
    depth = 1
    for end in range(opening + 1, len(text)):
        depth += (text[end] == '{') - (text[end] == '}')
        if not depth:
            return text[start:end + 1]
    raise ValueError(signature)

DRBG_HEADER = r'''
#pragma once
#include <stddef.h>
#include <stdint.h>
#define NFC3D_DRBG_MAX_SEED_SIZE 480
void nfc3d_drbg_generate_bytes(const uint8_t*,size_t,const uint8_t*,size_t,uint8_t*,size_t);
'''

HARNESS = r'''
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <errno.h>
#include "nfc3d/amiibo.h"
typedef int ret_code_t;
#define NRF_ERROR_INVALID_DATA 13
#define NRF_SUCCESS 0
static nfc3d_amiibo_keys amiibo_keys;
static bool amiibo_keys_loaded;
@@IMPORT@@
@@CALLER@@
@@LOADED@@
static uint8_t captured[480];
static size_t captured_size, drbg_calls;
void nfc3d_drbg_generate_bytes(const uint8_t*k,size_t kn,const uint8_t*s,size_t sn,uint8_t*out,size_t on){
    (void)k;
    if(kn!=16 || sn>sizeof(captured) || on!=sizeof(nfc3d_keygen_derivedkeys))exit(93);
    memcpy(captured,s,sn);captured_size=sn;++drbg_calls;memset(out,0x7d,on);
}
static void fill_master(nfc3d_keygen_masterkeys*k,size_t nul,size_t magic){
    memset(k,0,sizeof(*k));
    for(size_t i=0;i<sizeof(k->hmacKey);i++)k->hmacKey[i]=(uint8_t)(0x40+i);
    memset(k->typeString,'T',sizeof(k->typeString));k->typeString[nul]=0;
    k->magicBytesSize=(uint8_t)magic;
    for(size_t i=0;i<sizeof(k->magicBytes);i++)k->magicBytes[i]=(uint8_t)(0xa0+i);
    for(size_t i=0;i<sizeof(k->xorPad);i++)k->xorPad[i]=(uint8_t)(0xc0+i);
}
#define CHECK(condition) do { ++checks; if(!(condition)){fprintf(stderr,"check failed at line %d\n",__LINE__);return 1;} } while(0)
int main(int argc,char**argv){
    if(argc!=2)return 2;
    unsigned checks=0,positive_pairs=0;
    nfc3d_amiibo_keys good,bad,out,saved;
    fill_master(&good.data,13,16);fill_master(&good.tag,0,0);
    memset(&out,0x6b,sizeof(out));saved=out;
    if(strcmp(argv[1],"invalid-type")==0){
        bad=good;memset(bad.data.typeString,'X',sizeof(bad.data.typeString));
        CHECK(!nfc3d_amiibo_load_keys(&out,(const uint8_t*)&bad));CHECK(memcmp(&out,&saved,sizeof(out))==0);return 0;
    }
    if(strcmp(argv[1],"invalid-magic-preserves")==0){
        bad=good;bad.tag.magicBytesSize=17;
        CHECK(!nfc3d_amiibo_load_keys(&out,(const uint8_t*)&bad));CHECK(memcmp(&out,&saved,sizeof(out))==0);return 0;
    }
    CHECK(sizeof(nfc3d_keygen_masterkeys)==80 && sizeof(nfc3d_amiibo_keys)==160);
    CHECK(!nfc3d_amiibo_load_keys(NULL,(const uint8_t*)&good) && errno==EINVAL);
    CHECK(!nfc3d_amiibo_load_keys(&out,NULL) && errno==EINVAL);CHECK(memcmp(&out,&saved,sizeof(out))==0);
    CHECK(!nfc3d_amiibo_load_keys(NULL,NULL) && errno==EINVAL);
    CHECK(!amiibo_helper_is_key_loaded());
    bad=good;memset(bad.data.typeString,'X',14);
    CHECK(amiibo_helper_load_keys((const uint8_t*)&bad)==NRF_ERROR_INVALID_DATA);CHECK(!amiibo_helper_is_key_loaded());
    CHECK(amiibo_helper_load_keys((const uint8_t*)&good)==NRF_SUCCESS);CHECK(amiibo_helper_is_key_loaded());
    saved=amiibo_keys;
    for(unsigned which=0;which<2;which++){
        bad=good;nfc3d_keygen_masterkeys*part=which?&bad.tag:&bad.data;
        memset(part->typeString,'X',sizeof(part->typeString));
        /* Adjacent RFU byte is zero: strlen-like unbounded validation is wrong. */
        part->rfu=0;
        CHECK(amiibo_helper_load_keys((const uint8_t*)&bad)==NRF_ERROR_INVALID_DATA);CHECK(errno==EILSEQ);
        CHECK(amiibo_helper_is_key_loaded());CHECK(memcmp(&amiibo_keys,&saved,sizeof(saved))==0);
        for(unsigned magic=17;magic<=255;magic+=238){
            bad=good;part=which?&bad.tag:&bad.data;part->magicBytesSize=(uint8_t)magic;
            CHECK(!nfc3d_amiibo_load_keys(&amiibo_keys,(const uint8_t*)&bad));CHECK(errno==EILSEQ);
            CHECK(memcmp(&amiibo_keys,&saved,sizeof(saved))==0);
        }
    }
    uint8_t seed[64],expected[80];for(size_t i=0;i<sizeof(seed);i++)seed[i]=(uint8_t)i;
    for(size_t nul=0;nul<14;nul++)for(size_t magic=0;magic<=16;magic++){
        fill_master(&good.data,nul,magic);fill_master(&good.tag,13-nul,16-magic);
        CHECK(nfc3d_amiibo_load_keys(&out,(const uint8_t*)&good));CHECK(memcmp(&out,&good,sizeof(out))==0);++positive_pairs;
        for(unsigned which=0;which<2;which++){
            nfc3d_keygen_masterkeys*part=which?&out.tag:&out.data;
            size_t end=0,name_len=(which?13-nul:nul)+1,magic_len=which?16-magic:magic;
            /* Independent bounded construction of expected seed, no memccpy. */
            for(size_t i=0;i<name_len;i++)expected[end++]=(uint8_t)part->typeString[i];
            for(size_t i=0;i<16-magic_len;i++)expected[end++]=seed[i];
            for(size_t i=0;i<magic_len;i++)expected[end++]=(uint8_t)(0xa0+i);
            for(size_t i=16;i<32;i++)expected[end++]=seed[i];
            for(size_t i=0;i<32;i++)expected[end++]=seed[32+i]^(uint8_t)(0xc0+i);
            nfc3d_keygen_derivedkeys derived;size_t old_calls=drbg_calls;
            nfc3d_keygen(part,seed,&derived);
            CHECK(drbg_calls==old_calls+1);CHECK(captured_size==end);CHECK(memcmp(captured,expected,end)==0);
        }
    }
    CHECK(nfc3d_amiibo_load_keys(&out,(const uint8_t*)&out));
    uint8_t unaligned[161];memcpy(unaligned+1,&good,sizeof(good));
    CHECK(nfc3d_amiibo_load_keys(&out,unaligned+1));CHECK(memcmp(&out,&good,sizeof(out))==0);
    uint8_t overlap[161];memcpy(overlap+1,&good,sizeof(good));
    CHECK(nfc3d_amiibo_load_keys((nfc3d_amiibo_keys*)overlap,overlap+1));CHECK(memcmp(overlap,&good,sizeof(good))==0);
    printf("{\"checks\":%u,\"positive_key_pairs\":%u,\"actual_kdf_seed_cases\":%zu}\n",checks,positive_pairs,drbg_calls);
    return 0;
}
'''

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--baseline',type=Path);args=parser.parse_args()
    fw=args.baseline.resolve() if args.baseline else FW
    vendor=fw/'components/amiitool'
    amiibo=vendor/'src/amiibo.c';keygen=vendor/'src/keygen.c';helper=fw/'application/src/amiibo_helper.c'
    body=HARNESS.replace('@@IMPORT@@',extract(amiibo.read_text(encoding='utf-8'),'bool nfc3d_amiibo_load_keys('))
    body=body.replace('@@CALLER@@',extract(helper.read_text(encoding='utf-8'),'ret_code_t amiibo_helper_load_keys('))
    body=body.replace('@@LOADED@@',extract(helper.read_text(encoding='utf-8'),'bool amiibo_helper_is_key_loaded('))
    with tempfile.TemporaryDirectory(prefix='allmiibo-key-import-') as temp:
        directory=Path(temp);(directory/'nfc3d').mkdir();(directory/'nfc3d/drbg.h').write_text(DRBG_HEADER)
        source=directory/'key_import_host.c';source.write_text(body)
        exe=directory/('key_import_host.exe' if os.name=='nt' else 'key_import_host')
        cmd=[os.environ.get('CC','gcc'),'-std=gnu11','-O2','-Wall','-Wextra','-Werror=implicit-function-declaration',
             *shlex.split(os.environ.get('CFLAGS','')),'-I',str(directory),'-I',str(vendor/'include'),str(source),str(keygen),'-o',str(exe)]
        built=subprocess.run(cmd,capture_output=True,text=True)
        if built.returncode:raise RuntimeError(built.stderr)
        cases=['invalid-type','invalid-magic-preserves'] if args.baseline else ['full']
        rows=[]
        for case in cases:
            result=subprocess.run([str(exe),case],capture_output=True,text=True)
            passed=result.returncode!=0 if args.baseline else result.returncode==0
            rows.append({'case':case,'exit_code':result.returncode,'expected_regression_detected' if args.baseline else 'passed':passed,
                         'stdout':result.stdout.strip(),'stderr':result.stderr.strip()})
            if not passed:raise RuntimeError(json.dumps(rows))
    print(json.dumps({'synthetic_only':True,'baseline_negative_controls':bool(args.baseline),'results':rows,
                      'source_sha256':{str(p.relative_to(fw)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [amiibo,keygen,helper]}},indent=2))

if __name__=='__main__':main()
