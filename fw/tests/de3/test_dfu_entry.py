"""Actual enter_dfu function: retention bits, SVC errors, and negative controls.

Mocked SVC semantics follow the pinned nRF5 SDK 17.1.0 API. No device access.
This does not prove the bootloader installed on a physical Allmiibo is identical.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

FW = Path(__file__).resolve().parents[2]
SOURCE = FW / 'application/src/utils.c'
SDK_IMAGE = 'solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16'


def extract_function(source, signature):
    start = source.index(signature)
    end = source.index('{', start) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]


PREFIX = r'''
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
typedef uint32_t ret_code_t;
#define NRF_SUCCESS 0u
/* Pinned SDK nrf_bootloader_info.h:168-178; checked against the build image. */
#define BOOTLOADER_DFU_START_MASK 0xF9u
#define BOOTLOADER_DFU_START 0xB1u
static uint8_t reg_value, reg_at_reset;
static bool system_prepare_reset(void){return true;}
static void system_cancel_reset(void){}
static unsigned clr_calls, set_calls, reset_calls, log_calls, call_order;
static uint32_t clr_error, set_error, last_log;
static void record_log(const char *format, unsigned error) {
    (void)format; ++log_calls; last_log=error;
}
#define NRF_LOG_ERROR(...) record_log(__VA_ARGS__)
static uint32_t sd_power_gpregret_clr(uint32_t id, uint32_t mask) {
    if(id != 0) abort();
    ++clr_calls; call_order=call_order*10+1;
    if(clr_error) return clr_error;
    reg_value &= (uint8_t)~mask;
    return NRF_SUCCESS;
}
static uint32_t sd_power_gpregret_set(uint32_t id, uint32_t mask) {
    if(id != 0) abort();
    ++set_calls; call_order=call_order*10+2;
    if(set_error) return set_error;
    reg_value |= (uint8_t)mask;
    return NRF_SUCCESS;
}
static uint32_t sd_nvic_SystemReset(void) {
    ++reset_calls; call_order=call_order*10+3; reg_at_reset=reg_value;
    return 0x1005u; /* The real NVIC reset does not normally return. */
}
'''
SUFFIX = r'''
int main(void) {
    unsigned cases=0, failures=0;
    for(unsigned state=0; state<3; ++state) {
        for(unsigned initial=0; initial<256; ++initial) {
            ++cases; reg_value=(uint8_t)initial;
            clr_calls=set_calls=reset_calls=log_calls=call_order=last_log=0;
            clr_error=state==1 ? 7 : 0; set_error=state==2 ? 8 : 0;
            enter_dfu();
            int ok;
            if(state==0) {
                ok=(reg_at_reset&0xF9u)==0xB1u && (reg_at_reset&0x06u)==(initial&0x06u) &&
                   reg_value==(initial&0x06u) &&
                   clr_calls==2 && set_calls==1 && reset_calls==1 && call_order==1231 &&
                   log_calls==1 && last_log==0x1005u;
            } else if(state==1) {
                ok=reg_value==initial && clr_calls==1 && set_calls==0 && reset_calls==0 &&
                   call_order==1 && log_calls==1 && last_log==7;
            } else {
                ok=reg_value==(initial&0x06u) && clr_calls==1 && set_calls==1 &&
                   reset_calls==0 && call_order==12 && log_calls==1 && last_log==8;
            }
            if(!ok) ++failures;
        }
    }
    printf("{\"cases\":%u,\"initial_register_values\":256,\"states_per_register\":3,\"failures\":%u}\n",cases,failures);
    return failures ? 71 : 0;
}
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--sanitize', action='store_true')
    args = parser.parse_args()
    original_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    body = extract_function(SOURCE.read_text(encoding='utf-8'), 'bool enter_dfu(void)')
    report = {'device_access': False, 'sanitizers': args.sanitize,
              'source_sha256': {'application/src/utils.c': original_hash},
              'sdk_image': SDK_IMAGE,
              'limits': ['Only the actual production entry body is compiled; SVC/reset behavior is mocked.',
                         'GPREGRET SVC failures are defensive tests; the SDK documents NRF_SUCCESS.',
                         'The bool API cancels preparation on failure; no caller-side BLE teardown is needed.',
                         'No installed bootloader identity, real register/timing, BLE, or recovery proof.'],
              'negative_controls': []}
    mutants = {
        'clear_none': body.replace('sd_power_gpregret_clr(0, BOOTLOADER_DFU_START_MASK)',
                                   'sd_power_gpregret_clr(0, 0)'),
        'clear_unrelated_bits': body.replace('sd_power_gpregret_clr(0, BOOTLOADER_DFU_START_MASK)',
                                             'sd_power_gpregret_clr(0, 0xFFu)'),
        'ignore_clear_error': body.replace('if (err != NRF_SUCCESS)', 'if (0)', 1),
    }
    before_set, after_set = body.split('err = sd_power_gpregret_set', 1)
    mutants['ignore_set_error'] = before_set + 'err = sd_power_gpregret_set' + after_set.replace(
        'if (err != NRF_SUCCESS)', 'if (0)', 1)
    assert all(value != body for value in mutants.values())
    with tempfile.TemporaryDirectory(prefix='allmiibo-dfu-entry-') as temporary:
        folder = Path(temporary)
        for label, function in [('candidate', body), *mutants.items()]:
            cfile = folder / (label + '.c')
            exe = folder / (label + '.exe')
            cfile.write_text(PREFIX + function + SUFFIX, encoding='utf-8')
            command = ['gcc', '-std=c11', '-Os', '-g', '-Wall', '-Wextra', '-Werror']
            if args.sanitize:
                command += ['-fsanitize=address,undefined', '-fno-sanitize-recover=all',
                            '-fno-omit-frame-pointer', '-fno-pie', '-no-pie']
            build = subprocess.run(command + [str(cfile), '-o', str(exe)],
                                   capture_output=True, text=True, timeout=60)
            assert build.returncode == 0, build.stdout + build.stderr
            result = subprocess.run([str(exe)], capture_output=True, text=True, timeout=15)
            row = {'name': label, 'exit_code': result.returncode, 'result': json.loads(result.stdout)}
            if label == 'candidate':
                assert result.returncode == 0 and row['result']['cases'] == 768, row
                report['candidate'] = row
            else:
                assert result.returncode == 71 and row['result']['failures'] > 0, row
                report['negative_controls'].append(row)
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == original_hash, 'Production source changed during test'
    report['passed'] = True
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('PASS 768 DFU-entry cases and 4 effective negative controls; no device access')


if __name__ == '__main__':
    main()
