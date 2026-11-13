"""Verify the released LCD application against this build and the bound Z19 public key."""
import hashlib
import json
from pathlib import Path
import re
import zipfile

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, utils


def sha(data):
    return hashlib.sha256(data).hexdigest()


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


def unique_json(data):
    def pairs(values):
        result = {}
        for key, value in values:
            need(key not in result, 'Duplicate JSON key')
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=pairs)


def reject(call, reason):
    try:
        call()
    except (ValueError, InvalidSignature):
        return 1
    raise ValueError('Negative control failed: ' + reason)


def verify_digest(binary, init):
    digest = message(one(init, 8))
    need(digest == {1: [3], 2: [hashlib.sha256(binary).digest()[::-1]]}, 'Image SHA256')


def verify_packet(dat, binary, release, key):
    packet = message(dat)
    need(set(packet) == {2}, 'Signed packet only')
    signed = message(one(packet, 2))
    need(set(signed) == {1, 2, 3} and one(signed, 2) == 0, 'ECDSA signature envelope')
    command = message(one(signed, 1))
    need(set(command) == {1, 2} and one(command, 1) == 1, 'INIT command envelope')
    init_bytes = one(command, 2)
    init = message(init_bytes)
    need({1, 2, 3, 4, 8, 10} <= set(init) <= set(range(1, 11)), 'Unexpected/missing InitCommand fields')
    need(one(init, 1) == release['counter'] and one(init, 2) == release['hardware_version'], 'Counter/hardware version')
    ids = integers(init[3])
    need(sorted(ids) == sorted(int(value, 16) for value in release['softdevice_requirements']), 'FWID requirements')
    need(one(init, 4) == 0, 'Application-only firmware type')
    sizes = [one(init, field) if field in init else 0 for field in (5, 6, 7)]
    expected_sizes = [0, 0, len(binary)]
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
    return {'type': 'application', 'firmware_type': one(init, 4), 'counter': release['counter'], 'sd_req': ids,
            'bytes': len(binary), 'sha256': sha(binary), 'signature_verified': True,
            'sd_size': sizes[0], 'bl_size': sizes[1], 'app_size': sizes[2],
            'boot_validation': 'GENERATED_CRC', 'negative_controls_passed': controls}


def verify_zip(path, binary, release, key):
    stem = 'app_' + str(release['counter'])
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
        need(manifest == {'manifest': {'application': {'bin_file': stem + '.bin', 'dat_file': stem + '.dat'}}},
             'Single-image manifest and unique exact binary/dat names')
        payload = archive.read(stem + '.bin')
        need(payload == binary, 'ZIP payload differs from bound component bytes')
        info = verify_packet(archive.read(stem + '.dat'), payload, release, key)
    return {'name': path.name, 'sha256': sha(path.read_bytes()), 'bytes': path.stat().st_size,
            'images': [info]}


def main():
    root = Path(__file__).resolve().parents[1]
    release = json.loads((root / 'RELEASE_INFO.json').read_bytes())
    build = root / 'build/lcd-de371t1'
    result = json.loads((build / 'BUILD_RESULT.json').read_bytes())
    need(result['mode'] == 'release' and result['status'] == 'passed', 'Fresh release build required')
    firmware_dir = (root / 'fw/releases').resolve()
    ota = (root / release['application_ota_path']).resolve()
    need(ota.parent == firmware_dir and ota.suffix == '.zip', 'Application release ZIP in fw/releases')
    need(sha(ota.read_bytes()) == release['ota_sha256'], 'Reviewed OTA SHA-256')
    binary = (build / 'pixljs.bin').read_bytes()
    need(sha(binary) == release['application_sha256'], 'Released application SHA-256')
    boot = root / 'bootloader-z19'
    binding = unique_json((boot / 'SOURCE_BINDING.json').read_bytes())
    key_path = 'fw/bootloader/src/dfu_public_key.c'
    key_bytes = (boot / key_path).read_bytes()
    need(sha(key_bytes) == binding['files'][key_path], 'Z19 public key source binding')
    need(binding['expectedPaddedBootloaderSha256'] == release['tested_bootloader']['padded_region_sha256'],
         'Z19 boot region bound to this release')
    source = key_bytes.decode('utf-8')
    initializer = re.search(r'pk\[64\]\s*=\s*\{([^}]+)\}', source).group(1)
    public = bytes(int(n, 16) for n in re.findall(r'0x([0-9a-fA-F]{2})', initializer))
    need(len(public) == 64, 'Z19 P-256 public key')
    key = ec.EllipticCurvePublicNumbers(int.from_bytes(public[:32], 'little'),
                                         int.from_bytes(public[32:], 'little'), ec.SECP256R1()).public_key()
    evidence = verify_zip(ota, binary, release, key)
    web_dir = root / 'web/public/firmware'
    offers = unique_json((web_dir / 'releases.json').read_bytes())['packages']
    current = [item for item in offers if item.get('sha256') == release['ota_sha256']]
    need(len(current) == 1, 'Current application must be offered once in Web DFU')
    offer = current[0]
    need(offer['version'] == release['version'] and offer['counter'] == release['counter']
         and offer['file'] == ota.name and offer['bytes'] == ota.stat().st_size and offer['applicationOnly'] is True,
         'Web DFU offer matches the signed LCD application identity')
    need((web_dir / ota.name).read_bytes() == ota.read_bytes(), 'Web and release ZIP bytes differ')
    evidence['identicalWebPackage'] = 'web/public/firmware/' + ota.name
    evidence['publicKeySource'] = 'bootloader-z19/' + key_path
    evidence['publicKeySourceSha256'] = sha(key_bytes)
    (build / 'SIGNED_OTA.json').write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf8')
    print(f"Verified signature, payload and three negative controls for {ota.name}")


if __name__ == '__main__':
    main()
