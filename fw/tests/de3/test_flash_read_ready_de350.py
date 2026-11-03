"""Real HAL readiness-hint regressions. Modeled NOR/IRQ responses, no hardware.

The cache changes neither read bytes nor program/erase completion requirements.
An immutable older HAL can be supplied as --baseline for a negative control.
--cross also runs WSL ASan/UBSan and ARM32 QEMU using installed tools only.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from test_hal_reliability import FLASH_MODEL
from test_spi_transactions import STUB

FW = Path(__file__).resolve().parents[2]
HEADERS = ['app_error.h', 'app_util_platform.h', 'app_timer.h', 'boards.h',
           'nrfx_spim.h', 'nrf_delay.h', 'nrf_gpio.h', 'nrf_log.h',
           'nrf_log_ctrl.h', 'nordic_common.h', 'nrf_drv_spi.h', 'nrf_error.h', 'nrfx.h']

CHECKS = r'''
static unsigned checks;
#undef assert
#define assert(x) do {checks++; if(!(x)){fprintf(stderr,"FAIL line %d: %s\n",__LINE__,#x); _Exit(88);}} while(0)
static bool inject_status_error, status_error_injected, flash_asleep;
static bool inject_mutation_window, mutation_before, mutation_after;
static unsigned mutation_command, reads_while_busy;
static unsigned selections;
'''

MAIN = r'''
static void prime(void) {uint8_t b[256]; assert(hal_spi_flash_read(0,b,sizeof b)==0);clean();}
static void needs_status(void) {
    unsigned before=polls; uint8_t b[16];
    assert(hal_spi_flash_read(0,b,sizeof b)==0);assert(polls==before+1);clean();
}
static void clear_fault(void) {fail_at=0;deny_wel=stuck=post_stuck=false;busy_left=post_busy=0;}
static int stream(void) {
    reset(); uint8_t data[256];
    for(unsigned i=0;i<4096;i++) {
        memset(data,0xa5,sizeof data);
        assert(hal_spi_flash_read(i*256,data,sizeof data)==NRF_SUCCESS);
        for(unsigned j=0;j<sizeof data;j++)assert(data[j]==0);
    }
    clean();printf("STREAM reads=4096 bytes=1048576 polls=%u transfers=%u selections=%u checks=%u\n",polls,transfers,selections,checks);fflush(stdout);
    assert(polls==1);assert(transfers==12290);assert(selections==4097);
    return 0;
}
int main(int argc,char**argv) {
    if(argc>1 && strcmp(argv[1],"stream")==0)return stream();
    unsigned cases=0;
    reset();prime();unsigned before=polls;prime();assert(polls==before);cases++;
    /* Fresh init (the normal wake path) must reacquire readiness. */
    assert(hal_spi_flash_init()==0);needs_status();cases++;
    hal_spi_flash_sleep();assert(flash_asleep);
    before=polls;assert(operation(0)==NRF_ERROR_TIMEOUT);assert(polls>before);clean();cases++;
    assert(hal_spi_flash_init()==0&&!flash_asleep);needs_status();cases++;
    /* Successful mutators still wait before WREN, validate WEL and wait after. */
    for(unsigned op=1;op<=2;op++) {
        reset();prime();before=polls;busy_left=2;post_busy=3;
        assert(operation(op)==0);assert(polls==before+8);clean();
        assert(commits+erases==1&&!wel&&!wrdi);before=polls;prime();assert(polls==before);cases++;
        reset();prime();deny_wel=true;assert(operation(op)==NRF_ERROR_INVALID_STATE);
        assert(!commits&&!erases);clear_fault();needs_status();cases++;
        reset();prime();post_stuck=true;assert(operation(op)==NRF_ERROR_TIMEOUT);
        assert(commits+erases==1);clear_fault();needs_status();cases++;
    }
    /* Every low-level transfer can fail, including read payload chunks.
     * A later read must check status again after the failed transaction. */
    for(unsigned op=0;op<5;op++) {
        reset();prime();unsigned start=transfers;assert(operation(op)==0);
        unsigned count=transfers-start;
        for(unsigned n=1;n<=count;n++) {
            reset();prime();fail_at=transfers+n;assert(operation(op)==77);clean();
            clear_fault();needs_status();cases++;
        }
    }
    for(unsigned n=1;n<=3;n++) {
        reset();prime();uint8_t data[256];fail_at=transfers+n;
        assert(hal_spi_flash_read(0,data,sizeof data)==77);clean();
        clear_fault();needs_status();cases++;
    }
    /* Failed deep-power-down and failed wake/init also invalidate. */
    reset();prime();fail_at=transfers+1;hal_spi_flash_sleep();clear_fault();needs_status();cases++;
    reset();prime();fail_at=transfers+1;assert(hal_spi_flash_init()==77);clear_fault();needs_status();cases++;
    /* Unknown/busy readiness and a stopped RTC remain bounded. */
    reset();stuck=true;assert(operation(0)==NRF_ERROR_TIMEOUT);clear_fault();needs_status();cases++;
    reset();stuck=true;tick_step=0;assert(operation(0)==NRF_ERROR_TIMEOUT);
    assert(polls==FLASH_BUSY_POLL_LIMIT);clear_fault();tick_step=1;needs_status();cases++;
    /* An IRQ reader failed after the successful status transaction released
     * CS. The older outer observation must not resurrect the ready hint. */
    reset();inject_status_error=true;assert(operation(0)==0);assert(status_error_injected);
    needs_status();cases++;
    reset();inject_read=true;assert(operation(1)==0);
    assert(injected&&commits==1&&!wrdi);clean();cases++;
    /* Read-only JEDEC queries and invalid arguments do not fabricate BUSY. */
    reset();prime();before=polls;assert(operation(3)==0);prime();assert(polls==before);cases++;
    /* An IRQ immediately before bus acquisition can refresh an earlier
     * invalidation. Another IRQ after commit must still observe BUSY. */
    for(unsigned op=1;op<=2;op++) {
        reset();prime();inject_mutation_window=true;
        mutation_command=op==1?CMD_PP:CMD_ERASE_4K;post_busy=3;
        assert(operation(op)==0);assert(mutation_before&&mutation_after&&!reads_while_busy);clean();cases++;
    }
    /* Sleep/wake commands have the same pre-acquire window. */
    for(unsigned wake=0;wake<2;wake++) {
        reset();prime();inject_mutation_window=true;mutation_command=wake?CMD_RDP:CMD_DP;
        if(wake)assert(hal_spi_flash_init()==0);else hal_spi_flash_sleep();
        assert(mutation_before&&mutation_after&&!reads_while_busy);clean();cases++;
    }
    printf("PASS readiness cases=%u checks=%u; fault recovery, init/sleep/wake, WEL, IRQ epoch, wait caps\n",cases,checks);
    return 0;
}
'''


def model():
    code = FLASH_MODEL.split('int main(void){', 1)[0]
    code = code.replace('selected=true;command=0;payload=false;',
                        'selected=true;command=0;payload=false;selections++;')
    code = code.replace('if(command==CMD_WREN&&!deny_wel)wel=true;',
                        'if(command==CMD_DP)flash_asleep=true;\n'
                        '    if(command==CMD_RDP)flash_asleep=false;\n'
                        '    if(command==CMD_WREN&&!deny_wel)wel=true;')
    code = code.replace('if(stuck||busy_left){', 'if(flash_asleep||stuck||busy_left){')
    code = code.replace('command=transfers=enters=exits=0;',
                        'command=transfers=enters=exits=selections=0;\n'
                        '    inject_status_error=status_error_injected=false;\n'
                        '    inject_mutation_window=mutation_before=mutation_after=false;mutation_command=reads_while_busy=0;')
    enter = 'void app_util_critical_region_enter(uint8_t*n) {*n=masked;masked=true;enters++;}'
    assert enter in code
    code = code.replace(enter, '''void app_util_critical_region_enter(uint8_t*n) {
    if(inject_mutation_window&&!mutation_before&&!in_irq&&!masked&&
       ((wel&&command==CMD_RDSR1)||(!wel&&command==CMD_READ&&(mutation_command==CMD_DP||mutation_command==CMD_RDP)))) {
        mutation_before=true;in_irq=true;uint8_t scratch[4];
        assert(hal_spi_flash_read(0x3000,scratch,sizeof scratch)==0);in_irq=false;
    }
    *n=masked;masked=true;enters++;
}''')
    code = code.replace('unsigned value=0;', '''unsigned value=0;
        if(command==CMD_READ&&(stuck||busy_left||flash_asleep))reads_while_busy++;''')
    marker = 'if(inject_read&&!injected&&!in_irq&&!masked&&command==CMD_WREN){'
    assert marker in code
    code = code.replace(marker, '''if(inject_status_error&&!status_error_injected&&!in_irq&&!masked&&command==CMD_RDSR1){
        status_error_injected=true;in_irq=true;uint8_t scratch[4];
        fail_at=transfers+1;assert(hal_spi_flash_read(0x2000,scratch,sizeof scratch)==77);
        fail_at=0;in_irq=false;
    }
    if(inject_mutation_window&&mutation_before&&!mutation_after&&!in_irq&&!masked&&command==mutation_command){
        mutation_after=true;in_irq=true;uint8_t scratch[4];unsigned old_polls=polls;
        ret_code_t result=hal_spi_flash_read(0x3000,scratch,sizeof scratch);
        assert(result==(mutation_command==CMD_DP?NRF_ERROR_TIMEOUT:NRF_SUCCESS));
        assert(polls>old_polls);assert(!reads_while_busy);in_irq=false;
    }
    ''' + marker)
    return code


def source(fw):
    return '#include "mock_sdk.h"\n' + CHECKS + ''.join(
        '#include "' + (fw / 'application/src/hal' / name).as_posix() + '"\n'
        for name in ['hal_spi_bus.c', 'hal_spi_flash.c']) + model() + MAIN


def run(cmd, expected=0):
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != expected:
        raise RuntimeError(f'{cmd}\nexit {result.returncode}, expected {expected}\n{result.stdout}\n{result.stderr}')
    return {'returncode': result.returncode, 'stdout': result.stdout.strip(), 'stderr': result.stderr.strip()}


def linux_path(path):
    path = Path(path).resolve().as_posix()
    return '/mnt/' + path[0].lower() + path[2:]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--cross', action='store_true')
    args = parser.parse_args()
    cc = shutil.which('gcc')
    if not cc:
        raise RuntimeError('Existing GCC required; no skipped tests')
    with tempfile.TemporaryDirectory(prefix='pixl-ready-') as tmp:
        folder = (args.out or Path(tmp)).resolve()
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'mock_sdk.h').write_text(STUB, encoding='utf-8')
        for header in HEADERS:
            (folder / header).write_text('#include "mock_sdk.h"\n', encoding='utf-8')
        results = {'scope': 'actual HAL C with modeled NOR and application IRQs; no hardware timing', 'runs': {}}
        for label, fw in [('candidate', FW), ('baseline', args.baseline)]:
            if fw is None:
                continue
            fw = fw.resolve()
            c = folder / (label + '.c')
            c.write_text(source(fw), encoding='utf-8')
            exe = folder / (label + ('.exe' if os.name == 'nt' else ''))
            flags = ['-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror', '-Wno-unused-parameter']
            run([cc, *flags, '-I', str(folder), str(c), '-o', str(exe)])
            if label == 'candidate':
                results['runs']['native_faults'] = run([str(exe)])
            results['runs'][label + '_stream'] = run([str(exe), 'stream'], 0 if label == 'candidate' else 88)
        # Negative control: removing epoch comparison resurrects stale readiness.
        hal = FW / 'application/src/hal/hal_spi_flash.c'
        text = hal.read_text(encoding='utf-8')
        anchor = 'm_read_ready = fault_generation == m_io_fault_generation;'
        assert anchor in text
        broken = text.replace(anchor, '(void)fault_generation; m_read_ready = true;')
        (folder / 'broken_epoch_hal.c').write_text(broken, encoding='utf-8')
        c = folder / 'broken_epoch.c'
        c.write_text(source(FW).replace((FW / 'application/src/hal/hal_spi_flash.c').as_posix(),
                                       (folder / 'broken_epoch_hal.c').as_posix()), encoding='utf-8')
        exe = folder / ('broken_epoch.exe' if os.name == 'nt' else 'broken_epoch')
        run([cc, *flags, '-I', str(folder), '-I', str(hal.parent), str(c), '-o', str(exe)])
        results['runs']['negative_irq_epoch'] = run([str(exe)], 88)
        # Negative control for the reviewed pre-acquire IRQ refresh window.
        guard_call = '    hal_spi_flash_command_begin(tx_data[0]);'
        assert text.count(guard_call) == 2
        broken = text.replace(guard_call, '')
        (folder / 'broken_acquire_hal.c').write_text(broken, encoding='utf-8')
        c = folder / 'broken_acquire.c'
        c.write_text(source(FW).replace((FW / 'application/src/hal/hal_spi_flash.c').as_posix(),
                                       (folder / 'broken_acquire_hal.c').as_posix()), encoding='utf-8')
        exe = folder / ('broken_acquire.exe' if os.name == 'nt' else 'broken_acquire')
        run([cc, *flags, '-I', str(folder), '-I', str(hal.parent), str(c), '-o', str(exe)])
        results['runs']['negative_mutation_acquire'] = run([str(exe)], 88)
        if args.cross:
            if os.name != 'nt':
                raise RuntimeError('--cross targets the documented Windows/WSL host')
            wsl = ['wsl.exe', '-d', 'Ubuntu-24.04-Codex-New', '--']
            c = folder / 'candidate_linux.c'
            c.write_text(source(FW).replace(FW.as_posix(), linux_path(FW)), encoding='utf-8')
            for label, compiler, extra, runner in [
                ('asan_ubsan', 'gcc', ['-fsanitize=address,undefined', '-fno-omit-frame-pointer'], []),
                ('arm32_qemu', 'arm-linux-gnueabihf-gcc', ['-static'], ['qemu-arm'])]:
                exe = folder / label
                run(wsl + [compiler, *flags, *extra, '-I', linux_path(folder), linux_path(c), '-o', linux_path(exe)])
                for mode in [[], ['stream']]:
                    key = label + ('_stream' if mode else '_faults')
                    results['runs'][key] = run(wsl + runner + [linux_path(exe), *mode])
        results['sha256'] = {str(p.relative_to(FW)): hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in [hal, FW / 'application/src/hal/hal_spi_bus.c']}
        results['status'] = 'passed'
        (folder / 'RESULTS.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
        print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
