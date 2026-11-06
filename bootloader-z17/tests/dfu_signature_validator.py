"""Independent read-only audit of already generated DFU ZIPs; public key only."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import re
import struct
import zipfile
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, utils

sha = lambda b: hashlib.sha256(b).hexdigest()


def need(condition, reason):
    if not condition:
        raise ValueError(reason)


def vint(data, pos):
    result = 0
    for shift in range(0, 70, 7):
        need(pos < len(data), 'Truncated varint')
        b = data[pos]
        pos += 1
        need(shift != 63 or b <= 1, 'Varint exceeds uint64')
        result |= (b & 127) << shift
        if not (b & 128):
            return result, pos
    raise ValueError('Overlong varint')


def message(data):
    fields = {}
    pos = 0
    while pos < len(data):
        key, pos = vint(data, pos)
        field, wire = key >> 3, key & 7
        need(field > 0, 'Invalid field')
        if wire == 0:
            value, pos = vint(data, pos)
        elif wire == 2:
            size, pos = vint(data, pos)
            need(pos + size <= len(data), 'Truncated bytes')
            value = data[pos:pos+size]
            pos += size
        else:
            raise ValueError('Unexpected wire type')
        fields.setdefault(field, []).append(value)
    return fields


def one(fields, n):
    need(n in fields and len(fields[n]) == 1, f'Singular field {n}')
    return fields[n][0]


def integers(values):
    out = []
    for v in values:
        if isinstance(v, int):
            out.append(v)
        else:
            i = 0
            while i < len(v):
                n, i = vint(v, i)
                out.append(n)
    return out


def hex_bytes(path, start, end_limit, allow_uicr=False):
    memory, upper, eof = {}, 0, False
    for line in path.read_text(encoding='ascii').splitlines():
        if not line:
            continue
        need(line[0] == ':' and not eof, 'Bad Intel HEX structure')
        rec = bytes.fromhex(line[1:])
        need(len(rec) == rec[0] + 5 and sum(rec) % 256 == 0, 'HEX checksum/count')
        off = int.from_bytes(rec[1:3], 'big')
        kind, payload = rec[3], rec[4:-1]
        if kind == 0:
            need(off + len(payload) <= 65536, 'HEX address record overflow')
            for i, v in enumerate(payload):
                address = upper + off + i
                need(address not in memory, 'Duplicate HEX address')
                memory[address] = v
        elif kind in (2, 4):
            need(len(payload) == 2 and off == 0, 'HEX address record')
            upper = int.from_bytes(payload, 'big') << (4 if kind == 2 else 16)
        elif kind == 1:
            need(not payload and off == 0, 'HEX EOF')
            eof = True
        else:
            need(kind in (3, 5) and len(payload) == 4 and off == 0, 'Unsupported HEX record')
    need(eof, 'Missing HEX EOF')
    uicr = {k: v for k, v in memory.items() if k >= 0x10000000}
    expected = {0x10001014+i: v for i, v in enumerate(struct.pack('<II', 0x77000, 0x7e000))}
    need(uicr == (expected if allow_uicr else {}), 'Unexpected UICR')
    flash = {k: v for k, v in memory.items() if k < 0x10000000}
    need(bool(flash) and min(flash) == start and all(start <= a < end_limit for a in flash), 'HEX layout excludes MBR/SoftDevice/settings')
    data = bytes(flash.get(a, 255) for a in range(start, max(flash)+1))
    need(len(data) >= 8 and len(data) % 4 == 0, 'Word alignment/vector width')
    return data


def unique_json(data):
    def pairs(values):
        result = {}
        for key, value in values:
            need(key not in result, 'Duplicate JSON key')
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=pairs)


def read_report(path):
    return unique_json(path.read_text(encoding='utf-8-sig'))


def verify_sources(folder, records):
    need(isinstance(records, dict) and bool(records), 'Missing source hashes')
    for relative, digest in records.items():
        path = folder / relative
        need(not Path(relative).is_absolute() and '..' not in Path(relative).parts and
             path.resolve().is_relative_to(folder.resolve()), 'Source path escape')
        need(path.suffix.lower() not in ('.pem', '.key'), 'Private-key input forbidden')
        need(re.fullmatch(r'[0-9a-f]{64}', digest) and sha(path.read_bytes()) == digest,
             'Source binding: ' + relative)


def vector(binary, origin, limit):
    need(8 <= len(binary) <= limit - origin, 'Component partition bounds')
    stack, reset = struct.unpack_from('<II', binary)
    need(stack == 0x20010000 and reset & 1 and origin <= reset - 1 < origin + len(binary),
         'Component vector table')


def reject(call, reason):
    try:
        call()
    except (ValueError, InvalidSignature):
        return 1
    raise ValueError('Negative control failed: ' + reason)


def verify_digest(binary, init):
    digest = message(one(init, 8))
    need(digest == {1: [3], 2: [hashlib.sha256(binary).digest()[::-1]]}, 'Image SHA256')


def verify_packet(dat, binary, counter, kind, key):
    packet = message(dat)
    need(set(packet) == {2}, 'Signed packet only')
    signed = message(one(packet, 2))
    need(set(signed) == {1, 2, 3} and one(signed, 2) == 0, 'ECDSA signature envelope')
    command = message(one(signed, 1))
    need(set(command) == {1, 2} and one(command, 1) == 1, 'INIT command envelope')
    init_bytes = one(command, 2)
    init = message(init_bytes)
    need({1, 2, 3, 4, 8, 10} <= set(init) <= set(range(1, 11)), 'Unexpected/missing InitCommand fields')
    need(one(init, 1) == counter and one(init, 2) == 52, 'Counter/hardware version')
    ids = integers(init[3])
    need(ids == [0x126], 'Exact S112 7.3.0 FWID requirement')
    need(kind in ('bootloader', 'application'), 'Only single bootloader or application payload supported')
    need(one(init, 4) == (2 if kind == 'bootloader' else 0), 'Firmware type')
    sizes = [one(init, field) if field in init else 0 for field in (5, 6, 7)]
    expected_sizes = [0, len(binary), 0] if kind == 'bootloader' else [0, 0, len(binary)]
    need(sizes == expected_sizes, 'No SoftDevice/mixed image; exact component size')
    need((one(init, 9) if 9 in init else 0) == 0, 'Debug disabled')
    verify_digest(binary, init)
    validations = [message(value) for value in init[10]]
    need(validations == [{1: [1], 2: [b'']}], 'One generated-CRC boot validation')
    signature = one(signed, 3)
    need(isinstance(signature, bytes) and len(signature) == 64, 'ECDSA signature width')
    der = utils.encode_dss_signature(int.from_bytes(signature[:32], 'little'),
                                    int.from_bytes(signature[32:], 'little'))
    key.verify(der, init_bytes, ec.ECDSA(hashes.SHA256()))
    changed_init = bytes([init_bytes[0] ^ 1]) + init_bytes[1:]
    changed_signature = bytes([signature[0] ^ 1]) + signature[1:]
    changed_der = utils.encode_dss_signature(int.from_bytes(changed_signature[:32], 'little'),
                                            int.from_bytes(changed_signature[32:], 'little'))
    changed_binary = bytes([binary[0] ^ 1]) + binary[1:]
    controls = reject(lambda: key.verify(der, changed_init, ec.ECDSA(hashes.SHA256())), 'changed init')
    controls += reject(lambda: key.verify(changed_der, init_bytes, ec.ECDSA(hashes.SHA256())), 'changed signature')
    controls += reject(lambda: verify_digest(changed_binary, init), 'changed image bytes')
    return {'type': kind, 'firmware_type': one(init, 4), 'counter': counter, 'sd_req': ids,
            'bytes': len(binary), 'sha256': sha(binary), 'signature_verified': True,
            'sd_size': sizes[0], 'bl_size': sizes[1], 'app_size': sizes[2],
            'boot_validation': 'GENERATED_CRC', 'negative_controls_passed': controls}


def verify_zip(path, kind, stem, binary, counter, key):
    expected_names = {'manifest.json', stem + '.bin', stem + '.dat'}
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        need(len(names) == len(set(names)) == 3 and set(names) == expected_names,
             'Unique exact ZIP entry names')
        for item in archive.infolist():
            need(not item.flag_bits & 1 and not item.is_dir(), 'No encrypted or directory ZIP entry')
            limit = len(binary) if item.filename.endswith('.bin') else 4096
            need(0 < item.file_size <= limit, 'Bounded ZIP entry size')
        need(archive.testzip() is None, 'ZIP CRC')
        manifest = unique_json(archive.read('manifest.json'))
        need(manifest == {'manifest': {kind: {'bin_file': stem + '.bin', 'dat_file': stem + '.dat'}}},
             'Single-image manifest and unique exact binary/dat names')
        payload = archive.read(stem + '.bin')
        need(payload == binary, 'ZIP payload differs from bound component bytes')
        info = verify_packet(archive.read(stem + '.dat'), payload, counter, kind, key)
    return {'name': path.name, 'sha256': sha(path.read_bytes()), 'bytes': path.stat().st_size,
            'images': [info]}

