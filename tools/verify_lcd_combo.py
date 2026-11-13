"""Verify the published DE3.72 LCD combo using project sources and a public key.

Place this script alongside tools/check_release_ota.py. Run python tools/verify_lcd_combo.py
from an extracted matching source release. Requires Python and cryptography.
"""
import argparse
import json
from pathlib import Path
import re
from zipfile import ZipFile

from check_release_ota import ec, hashes, integers, message, need, one, reject, sha, unique_json, utils, verify_digest, verify_packet


def read_bounded(archive, limits):
    infos = archive.infolist()
    need(len(infos) == len(limits) and {x.filename for x in infos} == set(limits), 'Unexpected or duplicate ZIP entries')
    for info in infos:
        need(not info.flag_bits & 1 and not info.is_dir() and 0 < info.file_size <= limits[info.filename], 'Invalid ZIP entry size or flags')
    need(archive.testzip() is None, 'Bad ZIP CRC')
    return {name: archive.read(name) for name in limits}


def public_key(repo):
    boot = repo / 'bootloader-z19'
    key_file = 'fw/bootloader/src/dfu_public_key.c'
    source = (boot / key_file).read_bytes()
    binding = unique_json((boot / 'SOURCE_BINDING.json').read_bytes())
    need(sha(source) == binding['files'][key_file], 'Z19 public key source mismatch')
    initializer = re.search(r'pk\[64\]\s*=\s*\{([^}]+)\}', source.decode())[1]
    raw = bytes(int(x, 16) for x in re.findall(r'0x([0-9a-fA-F]{2})', initializer))
    need(sha(raw) == '9ee942fb8b5fa84aa3287f02451c7f2bf2168f5df2c97af253172d2e90f03a83', 'Z19 public key mismatch')
    return ec.EllipticCurvePublicNumbers(int.from_bytes(raw[:32], 'little'), int.from_bytes(raw[32:], 'little'), ec.SECP256R1()).public_key()


def verify_system(dat, image, public):
    packet = message(dat)
    need(set(packet) == {2}, 'Require a signed packet')
    envelope = message(one(packet, 2))
    need(set(envelope) == {1, 2, 3} and one(envelope, 2) == 0, 'Require ECDSA P-256 signature')
    command = message(one(envelope, 1))
    need(set(command) == {1, 2} and one(command, 1) == 1, 'Require INIT')
    raw = one(command, 2)
    init = message(raw)
    need(set(init) == set(range(1, 11)), 'Missing or unknown init fields')
    need([one(init, k) for k in (1, 2, 4, 5, 6, 7, 9)] == [19, 52, 3, 98068, 26772, 0, 0], 'System target or size mismatch')
    need(integers(init[3]) == [0x103, 0x126], 'Wrong SoftDevice prerequisites')
    need([message(x) for x in init[10]] == [{1:[1], 2:[b'']}] * 2, 'Require both generated-CRC boot validations')
    verify_digest(image, init)
    sig = one(envelope, 3)
    need(len(sig) == 64, 'Signature width')
    der = utils.encode_dss_signature(int.from_bytes(sig[:32], 'little'), int.from_bytes(sig[32:], 'little'))
    public.verify(der, raw, ec.ECDSA(hashes.SHA256()))
    reject(lambda: public.verify(der, raw[:-1] + bytes([raw[-1] ^ 1]), ec.ECDSA(hashes.SHA256())), 'Changed init')
    reject(lambda: verify_digest(image[:-1] + bytes([image[-1] ^ 1]), init), 'Changed system bytes')
    sd, boot = image[:98068], image[98068:]
    need(sha(sd) == '176e583106ce74c71c621e0ad14f9cecdcd83dcd6ac097df3c970223e7a0aff2', 'Unexpected S112 data')
    need(sha(boot) == '5c3eca5391d40677d95d5c256bfcbeb5e0ffdb3e9368408a27e45100738590af', 'Unexpected Z19 data')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--combo', type=Path)
    parser.add_argument('--app-only', type=Path)
    args = parser.parse_args()
    repo = args.root
    combo = args.combo or repo / 'fw/releases/Allmiibo_LCD_S112_7_3_0_Z19_DE3_72_645_KOMPLETT.zip'
    app = args.app_only or repo / 'fw/releases/Allmiibo_LCD_DE3_72_645_NUR_APP.zip'
    need(combo.stat().st_size == 341565 and sha(combo.read_bytes()) == '37a4d51639a4502fdab170eb6a985ce80d6f09109fea0f9e6ff10b4f28410b82', 'Unexpected combo ZIP')
    need(app.stat().st_size == 249275 and sha(app.read_bytes()) == 'e002d6c7952be898bdaafc691e9e92b40ad1c34681b93f5029b85358a3a57adc', 'Unexpected app-only ZIP')
    limits = {'app_645.bin':363340,'app_645.dat':512,'manifest.json':4096}
    with ZipFile(app) as archive: single = read_bounded(archive, limits)
    with ZipFile(combo) as archive: combined = read_bounded(archive, {**limits,'sd_bl.bin':124840,'sd_bl.dat':512})
    app_record = {'bin_file':'app_645.bin','dat_file':'app_645.dat'}
    system_record = {'bin_file':'sd_bl.bin','dat_file':'sd_bl.dat','info_read_only_metadata':{'sd_size':98068,'bl_size':26772}}
    need(unique_json(single['manifest.json']) == {'manifest':{'application':app_record}}, 'Wrong app manifest')
    need(unique_json(combined['manifest.json']) == {'manifest':{'application':app_record,'softdevice_bootloader':system_record}}, 'Wrong system manifest')
    need(all(single[n] == combined[n] for n in app_record.values()), 'App-only component differs')
    key = public_key(repo)
    image = combined['app_645.bin']
    need(sha(image)=='000651a423e35821e529815a87930137f2d56277941b1b900fccb699d51ecb88', 'Wrong release image')
    verify_packet(combined['app_645.dat'], image, {'counter':645,'hardware_version':52,'softdevice_requirements':['0x103','0x126']}, key)
    verify_system(combined['sd_bl.dat'], combined['sd_bl.bin'], key)
    print(json.dumps({'verified':True,'applicationCounter':645,'bootloaderCounter':19,'softDevice':'S112 7.3.0','systemAndAppSignatures':2,'comboSha256':sha(combo.read_bytes())}))


if __name__ == '__main__':
    main()
