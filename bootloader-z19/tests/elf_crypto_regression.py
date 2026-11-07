"""Reuse the existing 69 fixed crypto checks on a newly built, ELF-bound image.

Actual ARM Thumb/M-class instructions execute, including linked Micro-ECC and
SHA256. No crypto function is substituted. The original signed DATs are test
inputs only: this does not sign or certify the newly built firmware.
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import struct
import time
import zipfile
import zlib
import unicorn

from unicorn import Uc, UC_ARCH_ARM, UC_MODE_THUMB, UC_MODE_MCLASS
from unicorn import UC_HOOK_BLOCK, UC_HOOK_MEM_WRITE, UC_PROT_READ, UC_PROT_EXEC
from unicorn.arm_const import UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3
from unicorn.arm_const import UC_ARM_REG_SP, UC_ARM_REG_LR, UC_ARM_REG_PC, UC_ARM_REG_XPSR

ROOT = Path(__file__).resolve().parent
SESSION = ROOT.parent
DEFAULT_ELF = ROOT / 'work/build/lto/fw/_build/bootloader.out'
DEFAULT_BIN = ROOT / 'work/build/lto/fw/_build/LTO_UNSIGNED_ANALYSIS_ONLY.bin'
DEFAULT_FIXTURES = ROOT / 'work/crypto/fixtures'
STACK_BOTTOM, STACK_TOP = 0x2000F000, 0x20010000
RETURN_ADDR, SIG_ADDR, DATA_ADDR, VALID_ADDR = 0x10000, 0x20002000, 0x20000, 0x20002300


def sha(data):
    return hashlib.sha256(data).hexdigest()


def elf_load(elf_path, bin_path):
    data, payload = elf_path.read_bytes(), bin_path.read_bytes()
    if len(data) < 52:
        raise ValueError('Truncated ELF header')
    h = struct.unpack_from('<16sHHIIIIIHHHHHH', data)
    if h[0][:7] != b'\x7fELF\x01\x01\x01' or h[1:3] != (2, 40):
        raise ValueError('Expected little-endian executable ARM ELF32')
    phoff, shoff = h[5:7]
    phentsize, phnum, shentsize, shnum, shstrndx = h[9:14]
    if phentsize != 32 or shentsize != 40:
        raise ValueError('Unexpected ELF table layout')
    if phoff + phnum * phentsize > len(data) or shoff + shnum * shentsize > len(data):
        raise ValueError('Truncated ELF tables')
    sections = [struct.unpack_from('<10I', data, shoff + i * shentsize) for i in range(shnum)]
    programs = [struct.unpack_from('<8I', data, phoff + i * phentsize) for i in range(phnum)]
    symbols, symbol_values = {}, {}
    for sec in sections:
        if sec[1] != 2:
            continue
        if sec[9] != 16:
            raise ValueError('Unexpected ELF symbol layout')
        names_sec = sections[sec[6]]
        names = data[names_sec[4]:names_sec[4] + names_sec[5]]
        for at in range(sec[4], sec[4] + sec[5], 16):
            n, value, size, info, other, index = struct.unpack_from('<IIIBBH', data, at)
            if n and index:
                name = names[n:names.index(0, n)].decode('ascii')
                symbols[name] = value
                symbol_values.setdefault(name, set()).add(value)
    required = ('nrf_dfu_validation_signature_check', 'nrf_dfu_validation_hash_ok',
                'nrf_dfu_validation_boot_validate', 'uECC_verify', 'sha256_transform')
    for name in required:
        if len(symbol_values.get(name, set())) != 1:
            raise ValueError('Missing or ambiguous exact function symbol: ' + name)
    if symbols['__StackLimit'] != STACK_BOTTOM or symbols['__StackTop'] != STACK_TOP:
        raise ValueError('Unexpected reserved stack region')
    physical = {}
    boot_base, boot_end = 0x77000, 0x7e000
    for sec in sections:
        if not (sec[2] & 2) or sec[1] == 8 or not sec[5]:
            continue
        vaddr, offset, filesz = sec[3:6]
        loads = [p for p in programs if p[0] == 1 and offset >= p[1]
                 and offset + filesz <= p[1] + p[4]
                 and vaddr - p[2] == offset - p[1]]
        if len(loads) != 1 or offset + filesz > len(data):
            raise ValueError('Allocated section is not bound to one PT_LOAD segment')
        paddr = loads[0][3] + offset - loads[0][1]
        if boot_base <= paddr < boot_end:
            if paddr + filesz > boot_end:
                raise ValueError('ELF load exceeds boot region')
            for i, byte in enumerate(data[offset:offset + filesz]):
                address = paddr + i
                if address in physical and physical[address] != byte:
                    raise ValueError('Conflicting physical ELF load data')
                physical[address] = byte
    if not physical or min(physical) != boot_base:
        raise ValueError('Missing physical boot payload')
    reconstructed = bytes(physical.get(a, 255) for a in range(boot_base, max(physical) + 1))
    if reconstructed != payload:
        raise ValueError('ELF physical boot payload differs from supplied test BIN')
    images = []
    section_records = []
    name_sec = sections[shstrndx]
    names = data[name_sec[4]:name_sec[4] + name_sec[5]]
    for sec in sections:
        if not (sec[2] & 2) or not sec[5]:
            continue
        addr, size = sec[3], sec[5]
        name = names[sec[0]:names.index(0, sec[0])].decode('ascii')
        if sec[1] == 8:
            if not (0x20000000 <= addr and addr + size <= STACK_TOP):
                continue
            content = bytes(size)
        else:
            if sec[4] + size > len(data):
                raise ValueError('Truncated allocated ELF section')
            content = data[sec[4]:sec[4] + size]
        if not any(lo <= addr and addr + size <= hi for lo, hi in
                   ((0, 0x80000), (0x20000000, STACK_TOP), (0x10001000, 0x10002000))):
            raise ValueError('Allocated ELF section outside modeled memory: ' + name)
        images.append((addr, content))
        section_records.append({'name': name, 'vma': hex(addr), 'bytes': size, 'zeroed': sec[1] == 8})
    meta = {
        'elf_path': str(elf_path), 'elf_sha256': sha(data),
        'bin_path': str(bin_path), 'bin_sha256': sha(payload),
        'physical_boot_payload_matches': True, 'boot_payload_bytes': len(payload),
        'initial_data_lma': hex(symbols['__etext']),
        'ram_data_start': hex(symbols['__data_start__']),
        'ram_initialized_end': hex(symbols['__stop_fs_data']),
        'bss_start': hex(symbols['__bss_start__']), 'bss_end': hex(symbols['__bss_end__']),
        'stack_limit': hex(symbols['__StackLimit']), 'stack_top': hex(symbols['__StackTop']),
        'loaded_sections': section_records,
        'exact_function_symbols': {name: hex(symbols[name]) for name in required},
    }
    return payload, images, symbols, meta


def varint(data, pos):
    value = 0
    for shift in range(0, 70, 7):
        b = data[pos]
        pos += 1
        value |= (b & 127) << shift
        if not b & 128:
            return value, pos
    raise ValueError('Invalid protobuf')


def proto(data):
    out, pos = {}, 0
    while pos < len(data):
        tag, pos = varint(data, pos)
        key, wire = tag >> 3, tag & 7
        if wire == 0:
            value, pos = varint(data, pos)
        elif wire == 2:
            size, pos = varint(data, pos)
            value, pos = data[pos:pos + size], pos + size
            if len(value) != size:
                raise ValueError('Truncated protobuf')
        else:
            raise ValueError('Unexpected wire type')
        if key in out:
            raise ValueError('Unexpected duplicate envelope field')
        out[key] = value
    return out


def signed_input(dat):
    signed = proto(proto(dat)[2])
    return signed[3], proto(signed[1])[2]


class Machine:
    def __init__(self, images, symbols):
        self.symbols = symbols
        self.u = Uc(UC_ARCH_ARM, UC_MODE_THUMB | UC_MODE_MCLASS)
        self.u.mem_map(0, 0x80000)
        self.u.mem_map(0x20000000, 0x10000)
        self.u.mem_map(0x10001000, 0x1000)
        for addr, content in images:
            self.u.mem_write(addr, content)
        self.u.mem_write(RETURN_ADDR, b'\x00\xbe')
        self.blocks = 0
        self.min_sp = STACK_TOP
        self.min_write = STACK_TOP
        self.function_hits = set()
        tracked = ('uECC_verify', 'nrf_crypto_ecdsa_verify', 'sha256_transform',
                   'nrf_crypto_hash_calculate', 'crypto_init.part.0')
        self.tracked = {symbols[x] & ~1: x for x in tracked if x in symbols}
        self.u.hook_add(UC_HOOK_BLOCK, self.on_block)
        self.u.hook_add(UC_HOOK_MEM_WRITE, self.on_stack_write,
                        begin=0x2000C000, end=STACK_TOP - 1)

    def on_block(self, u, address, size, user):
        self.blocks += 1
        self.min_sp = min(self.min_sp, u.reg_read(UC_ARM_REG_SP))
        if address in self.tracked:
            self.function_hits.add(self.tracked[address])

    def on_stack_write(self, u, access, address, size, value, user):
        self.min_write = min(self.min_write, address)

    def call(self, name, args):
        self.blocks = 0
        self.min_sp = self.min_write = STACK_TOP
        self.function_hits.clear()
        self.u.mem_write(STACK_BOTTOM - 256, b'\x7b' * 256)
        self.u.mem_write(STACK_BOTTOM, b'\xa5' * (STACK_TOP - STACK_BOTTOM))
        self.u.mem_protect(0, 0x80000, UC_PROT_READ | UC_PROT_EXEC)
        sp = STACK_TOP - 8
        self.u.mem_write(sp, struct.pack('<II', args[4] if len(args) > 4 else 0, 0))
        for reg, value in zip((UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3), args):
            self.u.reg_write(reg, value)
        self.u.reg_write(UC_ARM_REG_SP, sp)
        self.u.reg_write(UC_ARM_REG_LR, RETURN_ADDR | 1)
        self.u.reg_write(UC_ARM_REG_XPSR, 0x01000000)
        start = time.monotonic()
        self.u.emu_start(self.symbols[name] | 1, RETURN_ADDR, timeout=30_000_000, count=30_000_000)
        if self.u.reg_read(UC_ARM_REG_PC) != RETURN_ADDR:
            raise RuntimeError('Function failed to return within execution limit')
        used = STACK_TOP - self.min_write
        result = dict(return_value=self.u.reg_read(UC_ARM_REG_R0),
                      blocks=self.blocks, seconds=round(time.monotonic() - start, 4),
                      stack_written_span_bytes=used,
                      stack_block_entry_span_bytes=STACK_TOP - self.min_sp,
                      stack_pointer_restored=self.u.reg_read(UC_ARM_REG_SP) == sp,
                      lower_256_byte_guard_intact=bytes(self.u.mem_read(STACK_BOTTOM - 256, 256)) == b'\x7b' * 256,
                      executed_functions=sorted(self.function_hits))
        if used > 4096 or self.min_sp < STACK_BOTTOM or not result['stack_pointer_restored'] or not result['lower_256_byte_guard_intact']:
            raise AssertionError('Stack safety assertion failed: ' + str(result))
        return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--elf', type=Path, default=DEFAULT_ELF)
    parser.add_argument('--bin', type=Path, default=DEFAULT_BIN)
    parser.add_argument('--fixtures', type=Path, default=DEFAULT_FIXTURES)
    parser.add_argument('--output', type=Path, default=ROOT / 'evidence/crypto_machine_lto.json')
    args = parser.parse_args()
    bin_bytes, images, symbols, binding = elf_load(args.elf, args.bin)
    cases = []

    def run(label, function, values, expected, writes, machine=None):
        m = machine or Machine(images, symbols)
        # Host loading of fixture inputs does not execute target instructions.
        for addr, content in writes:
            m.u.mem_write(addr, content)
        result = m.call(function, values)
        result.update(name=label, expected=expected, passed=result['return_value'] == expected)
        cases.append(result)
        if not result['passed']:
            raise AssertionError(label + ': ' + str(result))
        return m

    dats = [('BL8 counter 9', (args.fixtures / 'bl8_counter9.dat').read_bytes()),
            ('SD+BL8 counter 11', (args.fixtures / 'sdbl_counter11.dat').read_bytes()),
            ('Supplied bootloader counter 13', (args.fixtures / 'bl13.dat').read_bytes()),
            ('Supplied App DE3.59 counter 631', (args.fixtures / 'app_631.dat').read_bytes())]
    signature_inputs = []
    for label, dat in dats:
        sig, data = signed_input(dat)
        signature_inputs.append(dict(name=label, dat_sha256=sha(dat), signed_data_sha256=sha(data)))
        m = run(label + ': valid signature', 'nrf_dfu_validation_signature_check',
                [0, SIG_ADDR, 64, DATA_ADDR, len(data)], 1, [(SIG_ADDR, sig), (DATA_ADDR, data)])
        run(label + ': repeated initialized crypto', 'nrf_dfu_validation_signature_check',
            [0, SIG_ADDR, 64, DATA_ADDR, len(data)], 1, [], m)
    sig, data = signed_input(dats[0][1])
    for at in (0, 31, 32, 63):
        changed = bytearray(sig)
        changed[at] ^= 1
        run('Signature bit changed at byte ' + str(at), 'nrf_dfu_validation_signature_check',
            [0, SIG_ADDR, 64, DATA_ADDR, len(data)], 5, [(SIG_ADDR, bytes(changed)), (DATA_ADDR, data)])
    for at in (0, len(data) - 1):
        changed = bytearray(data)
        changed[at] ^= 1
        run('Signed Init bit changed at byte ' + str(at), 'nrf_dfu_validation_signature_check',
            [0, SIG_ADDR, 64, DATA_ADDR, len(data)], 5, [(SIG_ADDR, sig), (DATA_ADDR, bytes(changed))])
    for label, signature, length, typ, ptr, expected in [
        ('zero r', b'\0' * 32 + sig[32:], 64, 0, SIG_ADDR, 5),
        ('zero s', sig[:32] + b'\0' * 32, 64, 0, SIG_ADDR, 5),
        ('short signature', sig, 63, 0, SIG_ADDR, 10),
        ('long signature', sig + b'\0', 65, 0, SIG_ADDR, 10),
        ('missing signature', sig, 64, 0, 0, 19),
        ('unsupported signature type', sig, 64, 1, SIG_ADDR, 22),
    ]:
        run(label, 'nrf_dfu_validation_signature_check',
            [typ, ptr, length, DATA_ADDR, len(data)], expected, [(SIG_ADDR, signature), (DATA_ADDR, data)])
    print('Signature function cases passed: ' + str(len(cases)), flush=True)
    firmware = bin_bytes
    for size in (0, 1, 55, 56, 63, 64, 65, 127, 128, 129, 4096, len(firmware)):
        content = firmware[:size]
        digest = hashlib.sha256(content).digest()
        for little in (False, True):
            expected_hash = digest[::-1] if little else digest
            run('SHA256 length %d, little=%s' % (size, little), 'nrf_dfu_validation_hash_ok',
                [SIG_ADDR, DATA_ADDR, size, int(little)], 1,
                [(SIG_ADDR, expected_hash), (DATA_ADDR, content)])
        changed_hash = bytes([digest[0] ^ 1]) + digest[1:]
        run('SHA256 rejects mismatch at length %d' % size, 'nrf_dfu_validation_hash_ok',
            [SIG_ADDR, DATA_ADDR, size, 0], 0, [(SIG_ADDR, changed_hash), (DATA_ADDR, content)])
    for label, typ, check_bytes, content, expected in [
        ('Boot CRC correct', 1, struct.pack('<I', zlib.crc32(firmware)), firmware, 1),
        ('Boot CRC wrong', 1, struct.pack('<I', zlib.crc32(firmware) ^ 1), firmware, 0),
        ('Boot SHA256 correct', 2, hashlib.sha256(firmware).digest(), firmware, 1),
        ('Boot SHA256 wrong', 2, b'\0' * 32, firmware, 0),
        ('Boot ECDSA signed fixture', 3, sig, data, 1),
        ('Boot ECDSA corrupt fixture', 3, bytes([sig[0] ^ 1]) + sig[1:], data, 0),
        ('Boot unknown validation type', 255, b'\0' * 64, firmware, 0),
        ('Boot NO_VALIDATION explicit policy', 0, b'\0' * 64, firmware, 1),
    ]:
        record = bytes([typ]) + check_bytes.ljust(64, b'\0')
        run(label, 'nrf_dfu_validation_boot_validate', [VALID_ADDR, DATA_ADDR, len(content)], expected,
            [(VALID_ADDR, record), (DATA_ADDR, content)])
    app_content = (args.fixtures / 'app_631.bin').read_bytes()
    app_digest = hashlib.sha256(app_content).digest()
    app_address = 0x19000
    if app_address + len(app_content) >= 0x77000:
        raise ValueError('App fixture would overlap supplied boot code')
    for label, digest, little, expected in [
        ('App full image SHA256 big-endian', app_digest, 0, 1),
        ('App full image SHA256 little-endian', app_digest[::-1], 1, 1),
        ('App full image SHA256 rejects mismatch', bytes([app_digest[0] ^ 1]) + app_digest[1:], 0, 0),
    ]:
        run(label, 'nrf_dfu_validation_hash_ok',
            [SIG_ADDR, app_address, len(app_content), little], expected,
            [(SIG_ADDR, digest), (app_address, app_content)])
    for correct in (True, False):
        check = zlib.crc32(app_content) ^ (0 if correct else 1)
        record = bytes([1]) + struct.pack('<I', check).ljust(64, b'\0')
        run('App full image boot CRC, correct=' + str(correct), 'nrf_dfu_validation_boot_validate',
            [VALID_ADDR, app_address, len(app_content)], int(correct),
            [(VALID_ADDR, record), (app_address, app_content)])
    if not any('uECC_verify' in c['executed_functions'] for c in cases):
        raise AssertionError('Actual linked uECC code was not observed')
    if not any('sha256_transform' in c['executed_functions'] for c in cases):
        raise AssertionError('Actual SHA256 code was not observed')
    report = dict(created_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  status='passed', script_sha256=sha(Path(__file__).read_bytes()),
                  bin_path=str(args.bin), bin_sha256=sha(bin_bytes),
                  elf_binding=binding,
                  emulated_function_addresses={n: hex(a) for n, a in symbols.items()
                    if n in ('nrf_dfu_validation_signature_check', 'nrf_dfu_validation_hash_ok',
                             'nrf_dfu_validation_boot_validate', 'uECC_verify', 'sha256_transform')},
                  bootloader_payload_sha256=sha(firmware), signature_inputs=signature_inputs,
                  tests=len(cases), passed=sum(c['passed'] for c in cases),
                  test_stack_budget_bytes=4096, cases=cases,
                  maximum_observed_stack_written_span_bytes=max(c['stack_written_span_bytes'] for c in cases),
                  maximum_observed_block_entry_stack_span_bytes=max(c['stack_block_entry_span_bytes'] for c in cases),
                  limitations=[
                    'ELF physical flash payload equals the separate test BIN; initialized sections loaded at VMA and RAM NOBITS zeroed.',
                    f'Unicorn {unicorn.__version__} ARM Thumb M-class function calls, not full reset/SoftDevice/nRF52 MMIO/radio/IRQ behavior.',
                    'Actual linked Micro-ECC and SHA256 instructions execute; no crypto stubs.',
                    'Stack observations cover these calls, not callers, interrupt nesting or all worst cases; the 4096-byte reservation is independently read from this ELF.',
                    'Host elapsed seconds are not nRF52 timing measurements.',
                    'Existing valid DAT signatures are fixtures and do not sign the newly built BIN or approve old counters in the full DFU state machine.',
                    'Boot ECDSA fixture is a previously supplied signed Init payload; no new firmware signing performed.'])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ('status', 'tests', 'passed', 'maximum_observed_stack_written_span_bytes',
                                            'maximum_observed_block_entry_stack_span_bytes')}, indent=2))


if __name__ == '__main__':
    main()
