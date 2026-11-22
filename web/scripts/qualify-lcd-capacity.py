"""Bind the existing capacity WASM to an actual LCD build and attributed cross-mount evidence."""
import argparse
import hashlib
import json
import struct
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from unicorn import Uc, UC_ARCH_ARM, UC_HOOK_CODE, UC_MODE_MCLASS, UC_MODE_THUMB
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_LR, UC_ARM_REG_MSP,
                               UC_ARM_REG_PC, UC_ARM_REG_R0, UC_ARM_REG_R1)

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'fw/scripts'))
sys.path.insert(0, str(ROOT / 'fw/tests/de3'))
from check_stack_watermark_elf import tool
from packed_identity import identity
from production_id import fingerprint, source_hashes


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def check_hex(path, base, binary):
    image = bytearray()
    high = 0
    entry = None
    records = 0
    ended = False
    for line in path.read_text().splitlines():
        assert line.startswith(':') and not ended
        row = bytes.fromhex(line[1:])
        assert len(row) == row[0] + 5 and sum(row) % 256 == 0
        addr = int.from_bytes(row[1:3], 'big')
        kind, data = row[3], row[4:-1]
        if kind == 0:
            assert high + addr == base + len(image)
            image.extend(data)
            records += 1
        elif kind == 1:
            assert not data and not addr
            ended = True
        elif kind in (2, 4):
            assert len(data) == 2 and not addr
            high = int.from_bytes(data, 'big') << (4 if kind == 2 else 16)
        elif kind in (3, 5):
            assert len(data) == 4 and not addr and entry is None
            entry = int.from_bytes(data, 'big') if kind == 5 else ((int.from_bytes(data[:2], 'big') << 4) + int.from_bytes(data[2:], 'big'))
        else:
            raise ValueError('Unsupported Intel HEX record')
    assert ended and image == binary and entry == struct.unpack_from('<I', binary, 4)[0]
    return dict(dataRecords=records, flashBytesCompared=len(image), fromAddress=base,
                endAddressExclusive=base + len(image), entrypoint=entry)


def layout_cases(sym, binary, engine_hash, constants):
    cpu = Uc(UC_ARCH_ARM, UC_MODE_MCLASS | UC_MODE_THUMB)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    cpu.mem_map(0, 0x80000)
    cpu.mem_map(0x20000000, 0x10000)
    cpu.mem_write(sym['__isr_vector'], binary)
    data_size = sym['__data_end__'] - sym['__data_start__']
    cpu.mem_write(sym['__data_start__'], bytes(cpu.mem_read(sym['__etext'], data_size)))
    out, sp = sym['__HeapBase'], sym['__StackTop']
    result = []
    def mounted_hook(emulator, _address, _size, _user):
        emulator.reg_write(UC_ARM_REG_R0, int(mounted))
        emulator.reg_write(UC_ARM_REG_PC, emulator.reg_read(UC_ARM_REG_LR))
    cpu.hook_add(UC_HOOK_CODE, mounted_hook, begin=sym['packed_mounted'], end=sym['packed_mounted'])
    for drive, geometry, mounted in [('E', True, True), ('E', True, False), ('I', True, True), ('E', False, True)]:
        cpu.mem_write(sym['geometry_valid'], bytes([int(geometry)]))
        cpu.mem_write(out, bytes([0xa5])*73)
        cpu.reg_write(UC_ARM_REG_MSP, sp)
        cpu.reg_write(UC_ARM_REG_R0, ord(drive))
        cpu.reg_write(UC_ARM_REG_R1, out)
        cpu.reg_write(UC_ARM_REG_LR, 0x101)
        cpu.emu_start(sym['vfs_packed_layout'] | 1, 0x100, count=10000)
        assert cpu.reg_read(UC_ARM_REG_PC) == 0x100 and cpu.reg_read(UC_ARM_REG_MSP) == sp
        code = cpu.reg_read(UC_ARM_REG_R0)
        case = dict(drive=drive, geometry=geometry, mounted=mounted, result=code)
        assert code == (0 if drive == 'E' and geometry else 0xfffffffa)
        assert cpu.mem_read(out+72, 1) == b'\xa5'
        if code == 0:
            c = constants
            expected = struct.pack('<4B4sIIIHHHHI4BI', 1, ord('E'), 3, mounted, b'PFS1',
                c['BLOCK_COUNT']*c['BLOCK_SIZE'], c['BLOCK_SIZE'], c['BLOCK_COUNT'],
                c['CACHE_SIZE'], c['CACHE_SIZE'], c['CACHE_SIZE'], c['META_SIZE'],
                c['SHARD_TARGET'], c['MAX_SHARDS'], c['PATH_MAX'], c['NAME_MAX'], c['MAX_HANDLES'], 7)
            actual = bytes(cpu.mem_read(out,72))
            assert actual == expected + bytes.fromhex(engine_hash), (
                'linked PFS layout mismatch', drive, geometry, mounted,
                'expected engine', engine_hash, 'actual layout72', actual.hex())
            case['layout72Hex'] = bytes(cpu.mem_read(out,72)).hex()
        else:
            assert cpu.mem_read(out,72) == bytes([0xa5])*72
        result.append(case)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT, help='complete source tree used by the firmware build')
    parser.add_argument('--build', type=Path, required=True)
    cross_input = parser.add_mutually_exclusive_group(required=True)
    cross_input.add_argument('--cross', type=Path, help='fresh check-pfs-compatibility.py output directory')
    cross_input.add_argument('--reuse-cross-report', type=Path,
                             help='previous cross-mount JSON, only for the byte-identical App673 engine')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--profile', choices=['de355', 'de389', 'de391', 'de392', 'de393', 'de394', 'de395', 'de396', 'de397', 'de398', 'de399', 'de3100'], default='de355')
    args = parser.parse_args()
    fw = args.source / 'fw'
    record = read(args.build/'BUILD_RESULT.json')
    prod = read(args.build/'production-inputs.json')
    assert record['exit_code'] == 0 and record['board'] == 'LCD'
    if args.profile == 'de394':
        assert record['version'] == '2.22.0-DE3.94' and record['counter'] == 667
    if args.profile == 'de395':
        assert record['version'] == '2.22.0-DE3.95' and record['counter'] == 668
    if args.profile == 'de396':
        assert record['version'] == '2.22.0-DE3.96' and record['counter'] == 669
    if args.profile == 'de397':
        assert record['version'] == '2.22.0-DE3.97' and record['counter'] == 670
    if args.profile == 'de398':
        assert record['version'] == '2.22.0-DE3.98' and record['counter'] == 671
    if args.profile == 'de399':
        assert record['version'] == '2.22.0-DE3.99' and record['counter'] == 672
    if args.profile == 'de3100':
        assert record['version'] == '2.22.0-DE3.100' and record['counter'] == 673
    assert source_hashes(fw) == prod and fingerprint(prod) == record['source_id_sha256']
    artifacts = {name:digest(args.build/name) for name in ('pixljs.bin','pixljs.hex','pixljs.out','pixljs.map')}
    assert artifacts == record['artifacts_sha256']
    manifest, engine = identity(fw/'application/src/mod/vfs', fw/'components/littlefs')
    engine_record = dict(manifest=manifest, engineSha256=engine)
    simulator_profile = {'de394': 'de393', 'de3100': 'de399'}.get(args.profile, args.profile)
    simulator = ROOT/'web/third-party'/('packed-simulator-'+simulator_profile)
    assert engine_record == read(simulator/'ENGINE_IDENTITY.json')
    binding = read(simulator/'SOURCE_BINDING.json')
    assert all(digest(simulator/name) == sha for name,sha in binding['sourceFiles'].items())
    wasm_sha = digest(ROOT/'web/public'/('lfs-capacity-'+simulator_profile+'.wasm'))
    assert wasm_sha == binding['wasmSha256']
    cross_path = args.reuse_cross_report or args.cross/'PFS_CROSS_VERSION.json'
    cross = read(cross_path)
    assert cross['passed'] and cross['syntheticDataOnly'] and cross['engines']['new'] == engine
    assert len(cross['cases']) == 6 and all(case['exitCode'] == 0 for case in cross['cases'])
    if args.reuse_cross_report:
        assert args.profile == 'de3100', 'Reuse requires the explicit identical-engine release profile'
        previous = read(ROOT/'docs/validation/DE3_99_PFS.json')
        assert previous['engine'] == engine_record and previous['wasmSha256'] == wasm_sha
        assert previous['crossMountReportSha256'] == digest(cross_path)
        assert previous['adapterSha256'] == prod['fw/application/src/mod/vfs/vfs_driver_packed.c']
    else:
        assert all(digest(args.cross/case['log']) == case['logSha256'] for case in cross['cases'])
    binary = (args.build/'pixljs.bin').read_bytes()
    assert binary.count(fingerprint(prod).encode() + b'\0') == 1
    elf = args.build/'pixljs.out'
    with TemporaryDirectory() as td:
        extracted = Path(td)/'flash.bin'
        subprocess.run([tool('objcopy'), '-O', 'binary', elf, extracted], check=True)
        assert extracted.read_bytes() == binary
    rows = (line.split() for line in subprocess.check_output([tool('nm'), '-n', elf], text=True).splitlines())
    symbols = {row[2]:int(row[0],16) for row in rows if len(row) == 3}
    report = dict(firmware=record['version'], counter=record['counter'], capacityProfile=args.profile, simulatorProfile=simulator_profile, scope='Linked LCD layout and synthetic cross-mount verification of the identical storage engine',
        engine=engine_record, wasmSha256=wasm_sha, crossMountReportSha256=digest(cross_path), sourceId=fingerprint(prod), sourceFiles=len(prod), buildArtifacts=artifacts,
        adapterSha256=prod['fw/application/src/mod/vfs/vfs_driver_packed.c'], elfLoadBytesCompared=len(binary),
        intelHex=check_hex(args.build/'pixljs.hex',symbols['__isr_vector'],binary),
        capacityCrossMount=dict(cases=len(cross['cases']),files=cross['filesInitially'],folders=cross['directoriesInitially'],synthetic=True),
        armLayoutCases=layout_cases(symbols,binary,engine,manifest['constants']),
        limits=['Mounted state and flash geometry are modeled in the linked ARM layout test.',
                'Live settings CRC, exact version/counter and layout, archive identity and a fresh fit proof are required.',
                'Host simulations do not measure physical free space or device acceptance.'])
    if args.profile in ('de396', 'de397'):
        report['limits'].append('BOARD_LCD/PIXL_TEST_DIAGNOSTICS instrumentation is omitted from the RAM-only simulator; no SDK timing or firmware RAM claim.')
    if args.profile in ('de398', 'de399', 'de3100'):
        report['limits'].append('BOARD_LCD/runtime GC diagnostics are omitted from the RAM-only simulator; no SDK timing or firmware RAM claim.')
    if args.reuse_cross_report:
        report['scope'] = 'Fresh linked App673 ARM layout binding to the unchanged App672 engine and previously executed cross-mount evidence'
        report['crossMountEvidenceMode'] = 'reused-identical-engine'
        report['crossMountOriginFirmware'] = '2.22.0-DE3.99'
        report['previousQualificationPath'] = 'docs/validation/DE3_99_PFS.json'
        report['previousQualificationSha256'] = digest(ROOT/report['previousQualificationPath'])
        report['limits'].append('The six cross-mount cases were executed for App672; they were not rerun or relabeled as fresh App673 tests.')
    args.output.write_text(json.dumps(report,indent=2)+'\n')


if __name__ == '__main__':
    main()
