"""Deterministic malformed/sequential NFC frames against actual parser/HAL.

Hardware is stubbed. This checks memory and readonly behavior, not RF timing
or game compatibility. No private tag contents are used.
"""
from pathlib import Path
import importlib.util
import os
import subprocess
import tempfile

FW = Path(__file__).resolve().parents[2]
TESTS = FW / 'tests/de2'
spec = importlib.util.spec_from_file_location('nfc_frame_source', TESTS/'test_cache_nfc.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
ntag = (FW/'application/src/ntag/ntag_emu_v2.c').read_text(encoding='utf-8')
hal = (FW/'application/src/hal/hal_nfc_t2t.c').read_text(encoding='utf-8')
source = (TESTS/'ec_nfc_host.c').read_text(encoding='utf-8').split('int main(void) {')[0]
source = source.replace('/* ACTUAL_NFC_FUNCTIONS */',
    helper.function(hal, 'ret_code_t hal_nfc_send(') + '\n' +
    ntag[ntag.index('typedef enum {'):ntag.index('/* One shared snapshot')] + '\n' +
    helper.function(ntag, 'static void nfc_received_process('))
source += r'''
static uint32_t random_state = 0xc3271e45u;
static uint32_t next_random(void) {
    uint32_t x = random_state;
    x ^= x << 13; x ^= x >> 17; x ^= x << 5;
    return random_state = x;
}
int main(void) {
    const uint8_t commands[] = {0x30,0xa2,0x60,0x3c,0x1b,0x3a,0xa6,0xc2,
                                0x55,0x43,0x3b,0xa5,0xa7,0xae};
    unsigned examined=0, protected_checks=0, sent=0, rejected=0;
    for (unsigned type=0; type<2; type++) {
        uint8_t *data = new_tag(type ? NTAG_I2C_PLUS_2K : NTAG_215);
        size_t size = _ntag_data_size(&ntag_emu.ntag);
        uint8_t *before = malloc(size); assert(before);
        for (unsigned sample=0; sample<100000; sample++) {
            size_t length = sample%3 ? next_random()%12 : next_random()%301;
            uint8_t *frame = length ? malloc(length) : NULL;
            for (size_t i=0; i<length; i++) frame[i]=(uint8_t)next_random();
            if (length && sample%4) frame[0]=commands[next_random()%sizeof(commands)];
            ntag_emu.ntag.read_only = sample%7==0;
            ntag_emu.paused = sample%31==0;
            ntag_emu.busy = sample%13==0;
            /* Keep ordinary frame sequences, periodically force sector edge states. */
            if (sample%17==0) ntag_emu.sector=next_random()%256;
            if (sample%37==0) ntag_emu.is_selecting_sector=true;
            memcpy(before,data,size); reset_io();
            nfc_received_process(frame,length,data);
            if (ntag_emu.ntag.read_only || ntag_emu.paused) {
                assert(!memcmp(data,before,size)); protected_checks++;
            }
            if (tx_calls) {
                assert(tx_calls==1 && registers.TXD.AMOUNT>0 && registers.TXD.AMOUNT<=255);
                sent++;
            }
            if (ack==0) rejected++;
            free(frame); examined++;
        }
        free(before); free(data);
    }
    assert(examined==200000 && protected_checks>30000 && sent>10000 && rejected>50000);
    printf("PASS %u deterministic NFC frames; protected=%u sent=%u rejected=%u\n",
           examined,protected_checks,sent,rejected);
    return 0;
}
'''
with tempfile.TemporaryDirectory(prefix='de346-nfc-frames-') as directory:
    folder=Path(directory)
    c=folder/'frames.c'
    exe=folder/('frames.exe' if os.name=='nt' else 'frames')
    c.write_text(source,encoding='utf-8')
    compiler='arm-linux-gnueabihf-gcc' if os.environ.get('PIXL_ARM32')=='1' else os.environ.get('CC','gcc')
    command=[compiler,'-std=c11','-O1','-g','-fshort-enums','-Wall','-Wextra','-Werror',
             '-Wno-pointer-to-int-cast','-Wno-unused-parameter','-Wno-unused-function',
             '-I',str(FW/'application/src/ntag'),str(c),'-o',str(exe)]
    if os.environ.get('PIXL_SANITIZE')=='1':
        command+=['-fsanitize=address,undefined','-fno-omit-frame-pointer']
    if os.environ.get('PIXL_ARM32')=='1': command+=['-static']
    subprocess.run(command,check=True,timeout=60)
    run=['qemu-arm',str(exe)] if os.environ.get('PIXL_ARM32')=='1' else [str(exe)]
    subprocess.run(run,check=True,timeout=90)
