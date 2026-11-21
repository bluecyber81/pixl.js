"""Compare real CRC functions with a supplied baseline on Cortex-M4.

Compiles only the production table/functions with the pinned compiler flags.
Counts executed instructions, not cycles or physical elapsed time. Profile
hooks are explicit ABI stubs; both inputs use the same stubs. No device access.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile

from unicorn import Uc, UC_ARCH_ARM, UC_MODE_THUMB, UC_MODE_MCLASS, UC_HOOK_CODE
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_MSP,
                              UC_ARM_REG_LR, UC_ARM_REG_PC, UC_ARM_REG_R0,
                              UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3)
from packed_crc_source import crc_declarations
from root_host import SRC


def sha(data):
    return hashlib.sha256(data).hexdigest()


def oracle(seed, data):
    for value in data:
        seed ^= value
        for _ in range(8):
            seed = (seed >> 1) ^ (0xedb88320 if seed & 1 else 0)
    return seed


def measure(source, folder, tools, profiling):
    production = crc_declarations(source, 'crc', 'crc_pair')
    production = production.replace('static uint32_t crc(', 'uint32_t crc(')
    production = production.replace('static uint32_t crc_pair(', 'uint32_t crc_pair(')
    prefix = '#include <stdint.h>\n#include <stddef.h>\n'
    if profiling:
        prefix += ('#define BOARD_LCD 1\n#define PIXL_TEST_DIAGNOSTICS 1\n'
                   '#define MOUNT_PROFILE_CRC 2\n'
                   'extern uint32_t runtime_diag_profile_begin(void);\n'
                   'extern void runtime_diag_profile_end(unsigned,uint32_t);\n')
    folder.mkdir()
    code, stub, obj, elf, binary = (folder / n for n in
                                  ('crc.c', 'hooks.c', 'crc.o', 'crc.elf', 'crc.bin'))
    code.write_text(prefix + production)
    stub.write_text('unsigned runtime_diag_profile_begin(void){return 1;}\n'
                    'void runtime_diag_profile_end(unsigned a,unsigned b){(void)a;(void)b;}\n')
    flags = ['-Os', '-mcpu=cortex-m4', '-mthumb', '-mabi=aapcs',
             '-mfloat-abi=hard', '-mfpu=fpv4-sp-d16', '-ffunction-sections',
             '-fdata-sections', '-fno-strict-aliasing', '-fno-builtin',
             '-fshort-enums', '-fstack-usage']
    subprocess.run([tools['gcc'], *flags, '-c', str(code), '-o', str(obj)], check=True)
    subprocess.run([tools['gcc'], *flags, '-nostdlib', '-Wl,-Ttext=0x1000,-e,crc',
                    str(obj), str(stub), '-o', str(elf)], check=True)
    subprocess.run([tools['objcopy'], '-O', 'binary', str(elf), str(binary)], check=True)
    symbols = {}
    for line in subprocess.check_output([tools['nm'], '-S', str(elf)], text=True).splitlines():
        fields = line.split()
        if len(fields) == 4:
            symbols[fields[3]] = (int(fields[0], 16), int(fields[1], 16))
    frames = {}
    for line in code.with_suffix('.su').read_text().splitlines():
        location, size, kind = line.split('\t')
        frames[location.rsplit(':', 1)[-1]] = {'bytes': int(size), 'kind': kind}
    cpu = Uc(UC_ARCH_ARM, UC_MODE_THUMB | UC_MODE_MCLASS)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    cpu.mem_map(0x1000, 0x10000)
    cpu.mem_map(0x20000000, 0x10000)
    cpu.mem_write(0x1000, binary.read_bytes())
    count = [0]
    cpu.hook_add(UC_HOOK_CODE, lambda *_: count.__setitem__(0, count[0] + 1))
    data = bytes((i * 73 + (i >> 8) * 17) & 255 for i in range(4120))
    cpu.mem_write(0x20000100, data)
    lengths = (0, 1, 2, 3, 4, 8, 12, 16, 31, 63, 127, 128, 255, 256, 257, 540, 572, 4097)
    rows = []
    for function in ('crc', 'crc_pair'):
        for n in lengths:
            for offset in (0, 1, 3):
                first, second = 0x13579bdf ^ n, 0x2468ace0 ^ offset
                ptr = 0x20000100 + offset if n else 0
                cpu.mem_write(0x20000000, b'\xa7' * 32)
                cpu.mem_write(0x20000010, struct.pack('<I', second))
                args = (first, ptr, n, 0) if function == 'crc' else (first, 0x20000010, ptr, n)
                for register, value in zip((UC_ARM_REG_R0, UC_ARM_REG_R1,
                                            UC_ARM_REG_R2, UC_ARM_REG_R3), args):
                    cpu.reg_write(register, value)
                cpu.reg_write(UC_ARM_REG_MSP, 0x2000f000)
                cpu.reg_write(UC_ARM_REG_LR, 0xf001)
                count[0] = 0
                cpu.emu_start(symbols[function][0] | 1, 0xf000, count=1000000)
                assert cpu.reg_read(UC_ARM_REG_PC) == 0xf000
                assert cpu.reg_read(UC_ARM_REG_MSP) == 0x2000f000
                assert cpu.reg_read(UC_ARM_REG_R0) == oracle(first, data[offset:offset+n])
                expected_second = oracle(second, data[offset:offset+n]) if function == 'crc_pair' else second
                assert bytes(cpu.mem_read(0x20000000, 32)) == b'\xa7' * 16 + struct.pack('<I', expected_second) + b'\xa7' * 12
                assert bytes(cpu.mem_read(0x20000100, len(data))) == data
                rows.append({'function': function, 'length': n, 'alignment': offset,
                             'instructions': count[0]})
    return {'functions_bytes': {name: symbols[name][1] for name in ('crc', 'crc_pair')},
            'table_bytes': symbols['table'][1], 'stack_frames': frames,
            'rows': rows, 'flags': flags, 'source_lf_sha256': sha(source.encode())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-source', type=Path, required=True)
    parser.add_argument('--tool-directory', type=Path)
    parser.add_argument('--json', type=Path)
    args = parser.parse_args()
    tools = {}
    for name in ('gcc', 'nm', 'objcopy'):
        executable = 'arm-none-eabi-' + name
        tools[name] = str(args.tool_directory / executable) if args.tool_directory else shutil.which(executable)
        assert tools[name], executable + ' unavailable'
    current_path = SRC / 'mod/vfs/packed_fs.c'
    current, baseline = current_path.read_text(), args.baseline_source.read_text()
    report = {'schema': 1, 'device_access': False, 'current_source': str(current_path),
              'baseline_source': str(args.baseline_source),
              'current_source_raw_sha256': sha(current_path.read_bytes()),
              'baseline_source_raw_sha256': sha(args.baseline_source.read_bytes()),
              'compiler': subprocess.check_output([tools['gcc'], '--version'], text=True).splitlines()[0],
              'compiler_sha256': sha(Path(tools['gcc']).read_bytes()), 'modes': [],
              'limits': 'Real extracted CRC code on Cortex-M4 emulation; no cycle/cache/flash/interrupt timing. Profiling hooks are identical ABI stubs. Final linked firmware size requires its own budget check.'}
    with tempfile.TemporaryDirectory(prefix='packed-crc-arm-de397-') as temp:
        for profiling in (False, True):
            old = measure(baseline, Path(temp) / ('old' + str(profiling)), tools, profiling)
            new = measure(current, Path(temp) / ('new' + str(profiling)), tools, profiling)
            assert old['table_bytes'] == new['table_bytes'] == 1024
            assert old['stack_frames'] == new['stack_frames']
            savings = []
            for before, after in zip(old['rows'], new['rows']):
                assert all(before[k] == after[k] for k in ('function', 'length', 'alignment'))
                assert after['instructions'] <= before['instructions'], (before, after)
                savings.append(before['instructions'] - after['instructions'])
            assert any(savings)
            assert sum(new['functions_bytes'].values()) <= sum(old['functions_bytes'].values())
            report['modes'].append({'profiling': profiling, 'baseline': old, 'candidate': new,
                                    'cases': len(savings), 'all_cases_no_instruction_increase': True,
                                    'instruction_savings_total': sum(savings)})
    report['passed'] = True
    if args.json:
        args.json.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'passed': True, 'cases': sum(m['cases'] for m in report['modes']),
                      'functions_bytes': [{'profiling': m['profiling'],
                        'baseline': m['baseline']['functions_bytes'],
                        'candidate': m['candidate']['functions_bytes']} for m in report['modes']]}))


if __name__ == '__main__':
    main()
