"""Verify known Allmiibo LCD two-phase packages (DE3.72, DE3.80 and DE3.81) using project sources and a public key.

Place this script alongside tools/check_release_ota.py. Run python tools/verify_lcd_combo.py
from an extracted matching source release. Requires Python and cryptography.
"""
import argparse
from dataclasses import dataclass
from io import BytesIO
import json
from pathlib import Path
import re
from zipfile import ZipFile

from check_release_ota import ec, hashes, integers, message, need, one, reject, sha, unique_json, utils, verify_digest, verify_packet


@dataclass(frozen=True)
class Release:
    version: str
    application: int
    bootloader: int
    combo_bytes: int
    combo_sha256: str
    app_zip_bytes: int
    app_zip_sha256: str
    app_bytes: int
    app_sha256: str
    boot_bytes: int
    boot_sha256: str


RELEASES = {
    'de3.72': Release(
        version='DE3_72', application=645, bootloader=19,
        combo_bytes=341565, combo_sha256='37a4d51639a4502fdab170eb6a985ce80d6f09109fea0f9e6ff10b4f28410b82',
        app_zip_bytes=249275, app_zip_sha256='e002d6c7952be898bdaafc691e9e92b40ad1c34681b93f5029b85358a3a57adc',
        app_bytes=363340, app_sha256='000651a423e35821e529815a87930137f2d56277941b1b900fccb699d51ecb88',
        boot_bytes=26772, boot_sha256='5c3eca5391d40677d95d5c256bfcbeb5e0ffdb3e9368408a27e45100738590af'),
    'de3.80': Release(
        version='DE3_80', application=653, bootloader=20,
        combo_bytes=341464, combo_sha256='638ad4876af5a034059b786de9ca64b3c4846952f9af04e6317fffd857959ead',
        app_zip_bytes=259943, app_zip_sha256='caea5f63c47d47b18fdd6484ecc8adc7d0bd0dcd392f83db290185e4f0c73342',
        app_bytes=362652, app_sha256='34bb85efbf2fc1e5429ce09361aa2b39831d252f9fad80de425c6a992b78cfb8',
        boot_bytes=26916, boot_sha256='64274549a10e77f602381f405cfbd59848928d87f45dc6f0c2fd10de773b3bac'),
    'de3.81': Release(
        version='DE3_81', application=654, bootloader=21,
        combo_bytes=342335, combo_sha256='4ba60821ea685f00ade27162c0df462aa9c382980a96e9967f9b0cc682a8de09',
        app_zip_bytes=249923, app_zip_sha256='6a7aa822329e5e703e120234e0161f7d0f49576255aba38e601bd8f5fadc5719',
        app_bytes=362892, app_sha256='632c29cb9408bcd390d887db36f81b350b2d514b4252f00e674ceb972293e918',
        boot_bytes=26932, boot_sha256='bca730da5b5c8c4201e6a1f36f3484661b783fff3923a4414ad33f6d082e876c'),
}
SD_BYTES = 98068
SD_SHA256 = '176e583106ce74c71c621e0ad14f9cecdcd83dcd6ac097df3c970223e7a0aff2'


def package_bytes(path, max_bytes):
    with path.open('rb') as source:
        data = source.read(max_bytes + 1)
    need(len(data) <= max_bytes, f'Oversize package: {path}')
    return data


def read_bounded(archive, limits):
    infos = archive.infolist()
    need(len(infos) == len(limits) and {x.filename for x in infos} == set(limits), 'Unexpected or duplicate ZIP entries')
    for info in infos:
        need(not info.flag_bits & 1 and not info.is_dir() and 0 < info.file_size <= limits[info.filename], 'Invalid ZIP entry size or flags')
    need(archive.testzip() is None, 'Bad ZIP CRC')
    return {name: archive.read(name) for name in limits}


def public_key(repo, counter=19):
    boot = repo / f'bootloader-z{counter}'
    key_file = 'fw/bootloader/src/dfu_public_key.c'
    # Z20 and Z21 share the signing key source with the checked-in Z19 base. The
    # selected release binding authenticates either copy before use.
    path = boot / key_file
    if counter in (20, 21) and not path.exists():
        path = repo / 'bootloader-z19' / key_file
    source = path.read_bytes()
    binding = unique_json((boot / 'SOURCE_BINDING.json').read_bytes())
    need(sha(source) == binding['files'][key_file], f'Z{counter} public key source mismatch')
    initializer = re.search(r'pk\[64\]\s*=\s*\{([^}]+)\}', source.decode())[1]
    raw = bytes(int(x, 16) for x in re.findall(r'0x([0-9a-fA-F]{2})', initializer))
    need(sha(raw) == '9ee942fb8b5fa84aa3287f02451c7f2bf2168f5df2c97af253172d2e90f03a83', f'Z{counter} public key mismatch')
    return ec.EllipticCurvePublicNumbers(int.from_bytes(raw[:32], 'little'), int.from_bytes(raw[32:], 'little'), ec.SECP256R1()).public_key()


def verify_system(dat, image, public, release=RELEASES['de3.72']):
    packet = message(dat)
    need(set(packet) == {2}, 'Require a signed packet')
    envelope = message(one(packet, 2))
    need(set(envelope) == {1, 2, 3} and one(envelope, 2) == 0, 'Require ECDSA P-256 signature')
    command = message(one(envelope, 1))
    need(set(command) == {1, 2} and one(command, 1) == 1, 'Require INIT')
    raw = one(command, 2)
    init = message(raw)
    need(set(init) == set(range(1, 11)), 'Missing or unknown init fields')
    need([one(init, k) for k in (1, 2, 4, 5, 6, 7, 9)] == [release.bootloader, 52, 3, SD_BYTES, release.boot_bytes, 0, 0], 'System target or size mismatch')
    need(integers(init[3]) == [0x103, 0x126], 'Wrong SoftDevice prerequisites')
    need([message(x) for x in init[10]] == [{1:[1], 2:[b'']}] * 2, 'Require both generated-CRC boot validations')
    verify_digest(image, init)
    sig = one(envelope, 3)
    need(len(sig) == 64, 'Signature width')
    der = utils.encode_dss_signature(int.from_bytes(sig[:32], 'little'), int.from_bytes(sig[32:], 'little'))
    public.verify(der, raw, ec.ECDSA(hashes.SHA256()))
    reject(lambda: public.verify(der, raw[:-1] + bytes([raw[-1] ^ 1]), ec.ECDSA(hashes.SHA256())), 'Changed init')
    reject(lambda: verify_digest(image[:-1] + bytes([image[-1] ^ 1]), init), 'Changed system bytes')
    sd, boot = image[:SD_BYTES], image[SD_BYTES:]
    need(len(image) == SD_BYTES + release.boot_bytes and sha(sd) == SD_SHA256, 'Unexpected S112 data or system size')
    need(sha(boot) == release.boot_sha256, 'Unexpected bootloader bytes')


def verify(repo, profile=None, combo_path=None, app_path=None):
    # A renamed download works too. All later checks use these same bounded bytes.
    data = package_bytes(combo_path, max(r.combo_bytes for r in RELEASES.values())) if combo_path else None
    if profile is None and data is not None:
        digest = sha(data)
        matches = [key for key, row in RELEASES.items() if row.combo_sha256 == digest]
        need(len(matches) == 1, 'Unknown combo ZIP')
        profile = matches[0]
    release = RELEASES[profile or 'de3.72']
    assets = repo / 'fw/releases'
    stem = f'{release.version}_{release.application}'
    if data is None:
        combo_path = assets / f'Allmiibo_LCD_S112_7_3_0_Z{release.bootloader}_{stem}_KOMPLETT.zip'
        data = package_bytes(combo_path, release.combo_bytes)
    need(len(data) == release.combo_bytes and sha(data) == release.combo_sha256, 'Unexpected combo ZIP')
    app_path = app_path or assets / f'Allmiibo_LCD_{stem}_NUR_APP.zip'
    app = package_bytes(app_path, release.app_zip_bytes)
    need(len(app) == release.app_zip_bytes and sha(app) == release.app_zip_sha256, 'Unexpected app-only ZIP')

    app_bin = f'app_{release.application}.bin'
    app_dat = f'app_{release.application}.dat'
    limits = {app_bin: release.app_bytes, app_dat: 512, 'manifest.json': 4096}
    with ZipFile(BytesIO(app)) as archive:
        single = read_bounded(archive, limits)
    with ZipFile(BytesIO(data)) as archive:
        combined = read_bounded(archive, {**limits, 'sd_bl.bin': SD_BYTES + release.boot_bytes, 'sd_bl.dat': 512})
    app_record = {'bin_file': app_bin, 'dat_file': app_dat}
    system_record = {'bin_file': 'sd_bl.bin', 'dat_file': 'sd_bl.dat',
                     'info_read_only_metadata': {'sd_size': SD_BYTES, 'bl_size': release.boot_bytes}}
    need(unique_json(single['manifest.json']) == {'manifest': {'application': app_record}}, 'Wrong app manifest')
    need(unique_json(combined['manifest.json']) == {'manifest': {'application': app_record, 'softdevice_bootloader': system_record}}, 'Wrong system manifest')
    need(all(single[n] == combined[n] for n in app_record.values()), 'App-only component differs')
    key = public_key(repo, release.bootloader)
    image = combined[app_bin]
    need(len(image) == release.app_bytes and sha(image) == release.app_sha256, 'Wrong release image')
    params = {'counter': release.application, 'hardware_version': 52, 'softdevice_requirements': ['0x103', '0x126']}
    verify_packet(combined[app_dat], image, params, key)
    verify_system(combined['sd_bl.dat'], combined['sd_bl.bin'], key, release)
    return {'verified': True, 'applicationCounter': release.application, 'bootloaderCounter': release.bootloader,
            'softDevice': 'S112 7.3.0', 'systemAndAppSignatures': 2, 'comboSha256': release.combo_sha256,
            'comboFilename': combo_path.name, 'appSha256': release.app_sha256, 'systemSha256': sha(combined['sd_bl.bin'])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--combo', type=Path)
    parser.add_argument('--app-only', type=Path)
    parser.add_argument('--profile', type=str.lower, choices=RELEASES,
                        help='Defaults to DE3.72; an explicit --combo is recognized by its SHA-256.')
    args = parser.parse_args()
    print(json.dumps(verify(args.root, args.profile, args.combo, args.app_only)))


if __name__ == '__main__':
    main()
