"""Exercise the normal second DFU phase on the locally built Z19 ARM ELF."""

import argparse
import json
from pathlib import Path
import zlib

import arm_update_model as model


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--softdevice', type=Path, required=True)
    parser.add_argument('--application', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    model.SOFTDEVICE = args.softdevice
    sd = model.sd_image()
    compiled = model.elf_load(args.build / 'bootloader.out',
                              args.build / 'BOOTLOADER_UNSIGNED_ANALYSIS.bin')
    binding = json.loads((Path(__file__).resolve().parents[1] / 'SOURCE_BINDING.json').read_text())
    region_sha = model.SHA(compiled[0].ljust(28672, b'\xff'))
    assert region_sha == binding['expectedPaddedBootloaderSha256']
    application = model.package(args.application, 'application')
    payload = application['payload']
    assert application['counter'] == 635
    rows = []
    for previous_bank in ('App635 present', 'App bank empty after bootloader update'):
        machine = model.Machine(compiled, sd, 19, payload, 0x126)
        machine.put(machine.settings + 8, 635)
        if previous_bank.startswith('App bank empty'):
            for offset in (24, 28, 32):
                machine.put(machine.settings + offset, 0)
            machine.u.mem_write(model.COPY_START, b'\xff' * len(payload))
        result = machine.execute(application['dat'])
        assert result == {'code': 1, 'destination': model.COPY_START,
                          'dataBytes': len(payload), 'bank0Code': 0}
        assert model.COPY_START + len(payload) <= 0x77000
        machine.u.mem_write(model.COPY_START, payload)
        descriptor = 0x20001400
        machine.u.mem_write(descriptor, application['expected_hash'])
        assert machine.call('nrf_dfu_validation_hash_ok', [descriptor, model.COPY_START, len(payload), 1]) == 1
        machine.u.mem_write(descriptor, b'\x01' + model.I(zlib.crc32(payload)).ljust(64, b'\0'))
        assert machine.call('nrf_dfu_validation_boot_validate', [descriptor, model.COPY_START, len(payload)]) == 1
        rows.append({'before': previous_bank, 'signedInitAccepted': True, 'imageHashAccepted': True,
                     'bootCrcAccepted': True, **result})
    args.output.write_text(json.dumps({'passed': True, 'hardwareAccess': False, 'bootCounter': 19,
                                       'bootRegionSha256': region_sha, 'appCounter': 635,
                                       'appPayloadSha256': model.SHA(payload), 'cases': rows,
                                       'limits': 'Actual ELF routines. Flash, radio and handover simulated.'}, indent=2) + '\n')
    print('PASS: signed App635 with S112 7.3.0, existing App635 and empty App bank')


if __name__ == '__main__':
    main()
