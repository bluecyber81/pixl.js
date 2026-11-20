"""Check the linked Cortex-M4 SHA-256 and Nordic HMAC backend independently.

Runs the actual application code against hashlib/hmac and public known answers.
Only RAM/NVIC and the CPU are emulated; no device, radio or NFC test is implied.
"""
import argparse
import hashlib
import hmac
import json
from pathlib import Path
import struct
from subprocess import check_output

from unicorn import Uc, UC_ARCH_ARM, UC_MODE_MCLASS, UC_MODE_THUMB
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_LR, UC_ARM_REG_MSP,
                               UC_ARM_REG_PC, UC_ARM_REG_R0, UC_ARM_REG_R1,
                               UC_ARM_REG_R2, UC_ARM_REG_R3)
from check_stack_watermark_elf import tool


def verify(elf, binary):
    records = [line.split() for line in check_output([tool('nm'), '-n', elf], text=True).splitlines()]
    symbols = {line[2]: int(line[0], 16) for line in records if len(line) == 3}
    cpu = Uc(UC_ARCH_ARM, UC_MODE_MCLASS | UC_MODE_THUMB)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    cpu.mem_map(0, 0x80000)
    cpu.mem_map(0x20000000, 0x10000)
    cpu.mem_map(0xe000e000, 0x1000)
    cpu.mem_write(symbols['__isr_vector'], binary.read_bytes())
    data = cpu.mem_read(symbols['__etext'], symbols['__data_end__'] - symbols['__data_start__'])
    cpu.mem_write(symbols['__data_start__'], bytes(data))
    # The UI allocator is never started. Keep buffers inside its reserved pool.
    base = symbols['m_mem']
    ctx, key_at, out, size_at, buf = (base + n for n in (0x20, 0x300, 0x400, 0x448, 0x601))
    sp = symbols['__StackTop'] - 64
    assert buf + 4097 < sp - 8192

    def call(name, *args):
        for reg, value in zip((UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3), args):
            cpu.reg_write(reg, value)
        if len(args) > 4:
            cpu.mem_write(sp, struct.pack('<' + 'I' * (len(args) - 4), *args[4:]))
        cpu.reg_write(UC_ARM_REG_MSP, sp)
        cpu.reg_write(UC_ARM_REG_LR, 0x101)
        cpu.emu_start(symbols[name] | 1, 0x100, count=2_000_000)
        assert cpu.reg_read(UC_ARM_REG_PC) == 0x100, name
        assert cpu.reg_read(UC_ARM_REG_MSP) == sp, name
        return cpu.reg_read(UC_ARM_REG_R0)

    def reset_buffers(payload):
        cpu.mem_write(ctx - 4, b'CTX<' + bytes(512) + b'>CTX')
        cpu.mem_write(out - 4, b'OUT<' + b'\xa5' * 32 + b'>OUT')
        cpu.mem_write(buf - 1, b'\xb6' + payload + b'\xc7')

    def verify_buffers(payload, expected):
        assert bytes(cpu.mem_read(out - 4, 40)) == b'OUT<' + expected + b'>OUT'
        assert bytes(cpu.mem_read(ctx - 4, 4)) == b'CTX<'
        assert bytes(cpu.mem_read(ctx + 512, 4)) == b'>CTX'
        assert bytes(cpu.mem_read(buf - 1, len(payload) + 2)) == b'\xb6' + payload + b'\xc7'

    # Include SHA padding boundaries and the application's normal 540-byte file.
    payloads = [b'', b'abc'] + [bytes((i * 29 + 17) % 256 for i in range(n))
                                for n in (1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 540, 2048, 4096)]
    assert hashlib.sha256(b'abc').hexdigest() == 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    sha_cases = 0
    for payload in payloads:
        expected = hashlib.sha256(payload).digest()
        for streamed in (False, True):
            reset_buffers(payload)
            if streamed:
                call('mbedtls_sha256_init', ctx)
                assert call('mbedtls_sha256_starts_ret', ctx, 0) == 0
                for start in range(0, len(payload), 13):
                    assert call('mbedtls_sha256_update_ret', ctx, buf + start,
                                min(13, len(payload) - start)) == 0
                assert call('mbedtls_sha256_finish_ret', ctx, out) == 0
                call('mbedtls_sha256_free', ctx)
            else:
                assert call('mbedtls_sha256_ret', buf, len(payload), out, 0) == 0
            verify_buffers(payload, expected)
            sha_cases += 1

    # RFC 4231 test cases 1 and 6, plus short/long keys and multi-block payloads.
    vectors = [
        (b'\x0b' * 20, b'Hi There', 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'),
        (b'\xaa' * 131, b'Test Using Larger Than Block-Size Key - Hash Key First',
         '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54'),
    ]
    vectors += [(bytes((i * 11 + 3) % 256 for i in range(k)),
                 bytes((i * 17 + 5) % 256 for i in range(n)), None)
                for k, n in ((1, 1), (16, 63), (32, 64), (64, 65), (65, 540), (131, 4096))]
    assert call('nrf_crypto_init') == 0
    info = symbols['g_nrf_crypto_hmac_sha256_info']
    hmac_cases = 0
    for key, payload, known in vectors:
        expected = hmac.new(key, payload, hashlib.sha256).digest()
        if known:
            assert expected.hex() == known
        for streamed in (False, True):
            reset_buffers(payload)
            cpu.mem_write(key_at, key)
            cpu.mem_write(size_at, struct.pack('<I', 32))
            if streamed:
                assert call('nrf_crypto_hmac_init', ctx, info, key_at, len(key)) == 0
                for start in range(0, len(payload), 13):
                    assert call('nrf_crypto_hmac_update', ctx, buf + start,
                                min(13, len(payload) - start)) == 0
                # A too-small result buffer must fail without writing; retry is safe.
                cpu.mem_write(size_at, struct.pack('<I', 31))
                assert call('nrf_crypto_hmac_finalize', ctx, out, size_at) != 0
                assert bytes(cpu.mem_read(out - 4, 40)) == b'OUT<' + b'\xa5' * 32 + b'>OUT'
                cpu.mem_write(size_at, struct.pack('<I', 32))
                assert call('nrf_crypto_hmac_finalize', ctx, out, size_at) == 0
            else:
                assert call('nrf_crypto_hmac_calculate', ctx, info, out, size_at,
                            key_at, len(key), buf, len(payload)) == 0
            assert struct.unpack('<I', cpu.mem_read(size_at, 4))[0] == 32
            assert bytes(cpu.mem_read(key_at, len(key))) == key
            verify_buffers(payload, expected)
            hmac_cases += 1
    result = {'sha256Cases': sha_cases, 'hmacSha256Cases': hmac_cases,
              'hmacShortBufferAndRetryCases': len(vectors), 'hardware': False,
              'applicationBinSha256': hashlib.sha256(binary.read_bytes()).hexdigest(),
              'passed': True}
    print(f'PASS linked Cortex-M4 SHA-256 {sha_cases} / Nordic HMAC-SHA-256 {hmac_cases}; '
          f'{len(vectors)} short-buffer retries; independent digests, guards and inputs intact')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('elf', type=Path)
    parser.add_argument('binary', type=Path)
    parser.add_argument('--json', type=Path)
    args = parser.parse_args()
    result = verify(args.elf, args.binary)
    if args.json:
        args.json.write_text(json.dumps(result, indent=2) + '\n')
