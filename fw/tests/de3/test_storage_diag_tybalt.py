"""Actual LCD SPIFFS pre-filter observer and DF handler, synthetic NOR only."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

FW = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def function(text, signature):
    start = text.index(signature)
    opening = text.index('{', start)
    depth = 1
    for i in range(opening + 1, len(text)):
        depth += (text[i] == '{') - (text[i] == '}')
        if not depth:
            return text[start:i + 1]
    raise ValueError(signature)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sanitize', action='store_true')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    src = FW / 'application/src'
    driver = (src / 'mod/vfs/vfs_driver_spiffs.c').read_text()
    functions = '\n'.join(function(driver, name) for name in (
        'static s32_t vfs_spiffs_map_error_code(', 'static int32_t vfs_check_namespace(',
        'static s32_t spiffs_block_read(',
        'int32_t vfs_spiffs_open_file(', 'int32_t vfs_spiffs_storage_diagnose('))
    harness = (HERE / 'storage_diag_host.c').read_text().split('int main(', 1)[0]
    harness = harness.replace('/* ACTUAL_VFS_FUNCTIONS */', functions)
    harness = harness.replace('uint32_t hal_spi_flash_read(',
                              'static int direct_fault_at=-1, direct_mutation;\nstatic unsigned direct_fault_count;\nuint32_t hal_spi_flash_read(')
    harness = harness.replace('if (read_fail) return 13;', '''if (read_fail) return 13;
    if (direct_fault_at >= 0 || direct_mutation) {
        unsigned n=direct_fault_count++; memcpy(buf,flash+addr,size);
        if ((int)n==direct_fault_at) { memset(buf,0xa5,size); return 17; }
        if(direct_mutation && n==3) ((spiffs_page_object_ix_header*)buf)->name[7]^=1;
        return 0;
    }''')
    handler = function((src / 'mod/df/df_proto_vfs.c').read_text(), 'void df_proto_handler_vfs_storage_diag(')
    transport_sources = [src / 'mod/ble/ble_df_driver.c', src / 'mod/df/df_core.c']
    transport_includes = '\n'.join('#include "' + p.as_posix() + '"' for p in transport_sources)
    harness += (HERE / 'storage_diag_tybalt_host.c').read_text().replace(
        '/* ACTUAL_HANDLER */', handler.replace('df_core_send_frame(', 'record_send_frame(')).replace(
        '/* ACTUAL_CORE_AND_DRIVER */', transport_includes)
    production = [src / 'mod/vfs/vfs_spiffs_diag.c', src / 'mod/vfs/vfs_spiffs_diag.h',
                  src / 'mod/vfs/vfs_driver_spiffs.c', src / 'mod/df/df_proto_vfs.c',
                  FW / 'components/spiffs/src/spiffs_hydrogen.c']
    report = {'device_access': False, 'sanitize': args.sanitize, 'passed': False,
              'source_hashes': {str(p.relative_to(FW)): hashlib.sha256(p.read_bytes()).hexdigest() for p in production},
              'transport_hashes': {str(p.relative_to(FW)): hashlib.sha256(p.read_bytes()).hexdigest() for p in transport_sources},
              'limits': ['Synthetic NOR and mocked HAL, not physical flash or IRQ proof.',
                         'No test exercises bootloader, SoftDevice or radio.',
                         'Diagnostic selection changes RAM only; query tests verify FS/cache/flash immutability.']}
    with tempfile.TemporaryDirectory(prefix='pixl-tybalt-diag-') as td:
        temp = Path(td)
        (temp / 'boards.h').write_text('#define BOARD_LCD 1\n#define VFS_SPIFFS_ENABLE 1\n')
        (temp / 'hal_spi_flash.h').write_text('#include <stdint.h>\n#include <stddef.h>\nuint32_t hal_spi_flash_read(uint32_t,void*,size_t);\n')
        (temp / 'app_timer.h').write_text('#include <stdint.h>\n#define APP_TIMER_TICKS(ms) (ms)\nuint32_t app_timer_cnt_get(void);\nuint32_t app_timer_cnt_diff_compute(uint32_t,uint32_t);\n')
        (temp / 'nrf_log.h').write_text('#define NRF_LOG_INFO(...) ((void)0)\n')
        (temp / 'nrf_log_ctrl.h').write_text('#define NRF_LOG_FLUSH() ((void)0)\n')
        (temp / 'nrf_pwr_mgmt.h').write_text('')
        (temp / 'host.c').write_text(harness)
        command = ['gcc', '-std=c11', '-O1', '-g', '-DBOARD_LCD', '-include', 'stdint.h', '-I', str(temp),
                   '-I', str(src / 'mod/vfs'), '-I', str(src / 'mod/df'), '-I', str(src / 'mod/ble'), '-I', str(FW / 'components/spiffs/src')]
        if args.sanitize:
            command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
        sources = [temp / 'host.c', src / 'mod/vfs/vfs_spiffs_diag.c', *sorted((FW / 'components/spiffs/src').glob('*.c'))]
        exe = temp / ('test.exe' if os.name == 'nt' else 'test')
        subprocess.run(command + list(map(str, sources)) + ['-o', str(exe)], check=True, timeout=60)
        good = subprocess.run([str(exe)], capture_output=True, text=True, timeout=60)
        report['stdout'] = good.stdout
        assert good.returncode == 0, good.stdout + good.stderr
        print(good.stdout, end='')
        # Remove only the production hook in a temporary file: the same tests
        # must fail, proving they execute the actual pre-filter call.
        hydrogen = production[-1]
        text = hydrogen.read_text()
        hook = 'vfs_spiffs_diag_header_observe(fs, obj_id, pix, &objix_hdr);'
        assert text.count(hook) == 1
        negative = temp / 'without_hook.c'
        negative.write_text(text.replace(hook, '(void)fs;'))
        negative_sources = [negative if p == hydrogen else p for p in sources]
        neg_exe = temp / ('negative.exe' if os.name == 'nt' else 'negative')
        subprocess.run(command + list(map(str, negative_sources)) + ['-o', str(neg_exe)], check=True, timeout=60)
        bad = subprocess.run([str(neg_exe)], capture_output=True, text=True, timeout=60)
        assert bad.returncode != 0 and 'Assertion' in bad.stderr, bad.stdout + bad.stderr
        report['negative_control'] = {'hook_removed': True, 'failed_as_expected': True, 'stderr': bad.stderr.strip()}
        print('PASS negative control: removing real SPIFFS hook fails capture assertion')
        # A physical-packet cap must not reject a logical chunk0 response:
        # actual core/driver segmentation is exercised above for every op.
        gate = 'out.data, sizeof(out.data), &length);'
        assert harness.count(gate) == 1
        (temp / 'host.c').write_text(harness.replace(gate, 'out.data, df_core_max_payload(), &length);'))
        subprocess.run(command + list(map(str, sources)) + ['-o', str(neg_exe)], check=True, timeout=60)
        gated = subprocess.run([str(neg_exe)], capture_output=True, text=True, timeout=60)
        assert gated.returncode != 0 and 'Assertion' in gated.stderr, gated.stdout + gated.stderr
        report['transport_negative_control'] = {'invalid_physical_capacity_gate': True, 'failed_as_expected': True, 'stderr': gated.stderr.strip()}
        print('PASS negative control: physical-MTU gate breaks actual logical-response transport assertion')
        report['passed'] = True
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
