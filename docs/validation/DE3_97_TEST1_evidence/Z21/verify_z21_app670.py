"""Run the actual unchanged Z21 ARM validators on the signed App670 package.

Uses the repository's existing Unicorn models. Hardware, flash and radio are
simulated. The crypto implementations execute from the reproduced bootloader.
"""
from pathlib import Path
import argparse
import hashlib
import json
import struct
import sys
import zipfile
import zlib

SHA = lambda data: hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--boot-build', type=Path, required=True)
    parser.add_argument('--application', type=Path, required=True)
    parser.add_argument('--previous-application', type=Path, required=True)
    parser.add_argument('--softdevice', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    REPO, BUILD, OUT = args.source_root.resolve(), args.boot_build.resolve(), args.out.resolve()
    PACKAGE, PREVIOUS = args.application.resolve(), args.previous_application.resolve()
    OUT.mkdir(parents=True, exist_ok=True)
    for name in ('Z21_APP670_CRYPTO.json', 'Z21_APP670_INIT_ACCEPTANCE.json'):
        if (OUT / name).exists():
            raise ValueError('Preserve previous evidence; choose a new output directory.')
    sys.path.insert(0, str(REPO / 'bootloader-z19/tests'))
    import elf_crypto_regression as crypto
    import arm_update_model as update
    compiled = crypto.elf_load(BUILD / 'bootloader.out', BUILD / 'BOOTLOADER_UNSIGNED_ANALYSIS.bin')
    boot_payload, images, symbols, binding = compiled
    region_hash = SHA(boot_payload.ljust(28672, b'\xff'))
    expected = json.loads((REPO / 'bootloader-z21/SOURCE_BINDING.json').read_text())
    assert region_hash == expected['expectedPaddedBootloaderSha256']
    assert region_hash == 'd3f9da7c477ce56a38d4458585222bffca793fddf614f54937012e4819d717fb'
    app = update.package(PACKAGE, 'application')
    previous = update.package(PREVIOUS, 'application')
    assert app['counter'] == 670 and previous['counter'] == 669
    payload = app['payload']
    assert SHA(payload) == '2e0db2e1303730d1042bb88619c0f6364f2824d59e306b69fb244b6fc8cbe9b9'
    signature, init = crypto.signed_input(app['dat'])
    rows = []

    def run(name, fn, args, value, writes, required=()):
        machine = crypto.Machine(images, symbols)
        for addr, data in writes:
            machine.u.mem_write(addr, data)
        result = machine.call(fn, args)
        assert result['return_value'] == value, (name, result)
        assert set(required).issubset(result['executed_functions']), (name, result)
        rows.append({'name': name, 'expected': value, 'passed': True, **result})

    sig_addr, data_addr, descriptor, app_addr = 0x20002000, 0x20000, 0x20002300, 0x19000
    assert app_addr + len(payload) < 0x77000
    sig_args = [0, sig_addr, 64, data_addr, len(init)]
    cryptos = ('sha256_transform', 'uECC_verify')
    run('signed init', 'nrf_dfu_validation_signature_check', sig_args, 1,
        [(sig_addr, signature), (data_addr, init)], cryptos)
    run('changed signature', 'nrf_dfu_validation_signature_check', sig_args, 5,
        [(sig_addr, bytes([signature[0] ^ 1]) + signature[1:]), (data_addr, init)], cryptos)
    run('changed init', 'nrf_dfu_validation_signature_check', sig_args, 5,
        [(sig_addr, signature), (data_addr, bytes([init[0] ^ 1]) + init[1:])], cryptos)
    changed = bytes([payload[0] ^ 1]) + payload[1:]
    for name, content, value in [('full BIN hash', payload, 1), ('changed BIN hash', changed, 0)]:
        run(name, 'nrf_dfu_validation_hash_ok', [descriptor, app_addr, len(payload), 1], value,
            [(descriptor, app['expected_hash']), (app_addr, content)], ('sha256_transform',))
    validation = b'\x01' + struct.pack('<I', zlib.crc32(payload)).ljust(64, b'\0')
    for name, content, value in [('boot CRC', payload, 1), ('changed BIN boot CRC', changed, 0)]:
        run(name, 'nrf_dfu_validation_boot_validate', [descriptor, app_addr, len(payload)], value,
            [(descriptor, validation), (app_addr, content)])
    (OUT / 'Z21_APP670_CRYPTO.json').write_text(json.dumps({
        'passed': True, 'signedZipSha256': SHA(PACKAGE.read_bytes()),
        'paddedBootloaderSha256': region_hash, 'bootloaderElfBinding': binding,
        'applicationBinSha256': SHA(payload), 'counter': 670, 'bytes': len(payload),
        'cases': rows, 'physicalDeviceAccess': False,
        'limits': 'Actual linked ARM crypto/CRC with simulated memory, no RF/device transfer.'}, indent=2) + '\n')
    print('PASS: seven actual Z21 ARM signature/hash/CRC cases', flush=True)

    # Existing signed system-phase bytes; Nordic DFU omits the MBR page.
    # This init/bank model executes no MBR or SoftDevice code. The omitted MBR
    # page remains erased; seed the exact S112 payload at its 0x1000 address.
    with zipfile.ZipFile(args.softdevice) as z:
        assert z.testzip() is None
        system = z.read('sd_bl.bin')
    assert len(system) == 125000
    assert SHA(system) == 'aba8a0bedb8ad8cef3a00cdb865bdaaa8d7af0ed7daef4888c1ec6e4192694d0'
    assert SHA(system[98068:].ljust(28672, b'\xff')) == region_hash
    sd = b'\xff' * 4096 + system[:98068]
    sd = sd.ljust(update.COPY_START, b'\xff')
    assert len(sd) == update.COPY_START
    assert struct.unpack_from('<H', sd, 0x300c)[0] == 0x126
    system_binding = {
        'input': str(args.softdevice.resolve()),
        'packageSha256': SHA(args.softdevice.read_bytes()),
        'signedSystemPhaseSha256': SHA(system),
        'softdevicePayloadSha256': SHA(system[:98068]),
        'softdeviceBytes': 98068, 'softdeviceLoadAddress': 4096,
        'softdeviceFwid': 294,
        'mbrPage': 'Erased in simulation; neither MBR nor SoftDevice code is executed.'}
    acceptance = []
    for state in ('App669 present', 'empty application bank'):
        machine = update.Machine(compiled, sd, 21, previous['payload'], 0x126)
        machine.put(machine.settings + 8, 669)
        if state == 'empty application bank':
            for offset in (24, 28, 32):
                machine.put(machine.settings + offset, 0)
            machine.u.mem_write(update.COPY_START, b'\xff' * len(payload))
        result = machine.execute(app['dat'])
        assert result == {'code': 1, 'destination': update.COPY_START, 'dataBytes': len(payload), 'bank0Code': 0}, result
        acceptance.append({'before': state, 'signedInitAccepted': True, **result})
    (OUT / 'Z21_APP670_INIT_ACCEPTANCE.json').write_text(json.dumps({
        'passed': True, 'bootCounter': 21, 'appCounter': 670, 'previousAppCounter': 669,
        'softDeviceFwid': 294, 'bootRegionSha256': region_hash, 'applicationSha256': SHA(payload),
        'previousApplicationSha256': SHA(previous['payload']), 'cases': acceptance,
        'systemInputBinding': system_binding,
        'physicalDeviceAccess': False, 'limits': 'Actual ELF init-execute and bank selection; flash, radio and handover simulated.'}, indent=2) + '\n')
    print('PASS: signed App670 accepted with App669 present and empty bank on Z21/S1127.3.0', flush=True)


if __name__ == '__main__':
    main()
