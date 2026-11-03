"""Actual NTAG state getter and lifecycle; no radio/device access."""
from pathlib import Path
import os,re,subprocess,tempfile
HERE=Path(__file__).resolve().parent
FW=HERE.parents[1]
engine=re.sub(r'(?m)^\s*#include[^\n]*\n','',(FW/'application/src/ntag/ntag_emu_v2.c').read_text(encoding='utf-8'))
prefix=(HERE/'nfc_lifecycle_host.c').read_text(encoding='utf-8').split('/* ACTUAL_SOURCE */')[0]
source=prefix+engine+r'''
static unsigned callbacks;
static bool fail_save;
static void saved(ntag_event_type_t type,void *context,ntag_t *tag) {
    (void)context;(void)tag;callbacks++;
    assert(!critical_depth && !ntag_emu_remote_input_safe());
    if(type==NTAG_EVENT_TYPE_WRITTEN && fail_save)ntag_emu_save_failed();
}
static void check_unchanged(bool expected) {
    ntag_emu_t before;memcpy(&before,&ntag_emu,sizeof(before));
    unsigned old_params=parameter_writes,old_start=start_count,old_stop=stop_count,old_tx=tx_length,old_callbacks=callbacks;
    int old_ack=ack;
    assert(ntag_emu_remote_input_safe()==expected);
    assert(!critical_depth && !memcmp(&before,&ntag_emu,sizeof(before)));
    assert(parameter_writes==old_params && start_count==old_start && stop_count==old_stop && tx_length==old_tx);
    assert(callbacks==old_callbacks && ack==old_ack);
}
int main(void) {
    unsigned cases=0;
    for(unsigned paused=0;paused<2;paused++)for(unsigned flags=0;flags<64;flags++) {
        memset(&ntag_emu,0,sizeof(ntag_emu));memset(ntag_emu.ntag.data,0x5a,sizeof(ntag_emu.ntag.data));
        ntag_emu.paused=paused;ntag_emu.field_on=(flags&1)!=0;ntag_emu.dirty=(flags&2)!=0;
        ntag_emu.pending=(flags&4)!=0;ntag_emu.busy=(flags&8)!=0;
        ntag_emu.save_failed=(flags&16)!=0;ntag_emu.delivering_write=(flags&32)!=0;
        check_unchanged(flags==0);cases++;
    }
    memset(&ntag_emu,0,sizeof(ntag_emu));
    ntag_t initial={0};initial.type=NTAG_215;
    assert(ntag_emu_set_tag(&initial));assert(ntag_emu_set_update_cb(saved,NULL));
    check_unchanged(true);cases++;
    nfc_callback(NULL,HAL_NFC_EVENT_FIELD_ON,NULL,0);check_unchanged(false);cases++;
    nfc_callback(NULL,HAL_NFC_EVENT_FIELD_OFF,NULL,0);check_unchanged(false);cases++;
    ntag_emu_process_pending();check_unchanged(true);assert(callbacks==1);cases++;
    const uint8_t write[]={NFC_CMD_WRITE,4,0x5a,0x5a,0x5a,0x5a};
    nfc_callback(NULL,HAL_NFC_EVENT_COMMAND,write,sizeof(write));assert(ack==0xa);
    check_unchanged(false);assert(ntag_emu.ntag.data[16]==0x5a);cases++;
    fail_save=true;nfc_callback(NULL,HAL_NFC_EVENT_FIELD_OFF,NULL,0);ntag_emu_process_pending();
    check_unchanged(false);assert(ntag_emu_save_pending() && ntag_emu.ntag.data[16]==0x5a);cases++;
    assert(!ntag_emu_retry_save());check_unchanged(false);cases++;
    fail_save=false;assert(ntag_emu_retry_save());check_unchanged(true);cases++;
    assert(ntag_emu_set_update_cb(NULL,NULL));assert(ntag_emu.paused);check_unchanged(true);cases++;
    printf("PASS %u remote NFC guard states/lifecycle checks; no getter side effects\n",cases);
    assert(cases==137);
    return 0;
}
'''
with tempfile.TemporaryDirectory(prefix='nfc-remote-guard-') as directory:
    folder=Path(directory);c=folder/'guard.c';exe=folder/'guard.exe'
    c.write_text(source,encoding='utf-8')
    arm=os.environ.get('PIXL_ARM32')=='1';san=os.environ.get('PIXL_SANITIZE')=='1' and not arm
    cmd=['arm-linux-gnueabihf-gcc' if arm else 'gcc','-std=c11','-O1','-g','-fshort-enums',
         '-Wall','-Wextra','-Werror','-Wno-unused-function','-Wno-unused-variable',
         '-Wno-unused-parameter','-I',str(FW/'application/src/ntag'),str(c),'-o',str(exe)]
    if arm:cmd+=['-static']
    if san:cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
    subprocess.run(cmd,check=True,timeout=60)
    subprocess.run((['qemu-arm'] if arm else [])+[str(exe)],check=True,timeout=30)
