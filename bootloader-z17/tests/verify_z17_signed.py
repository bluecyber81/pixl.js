"""Independent public-key-only audit of the optional Android BL17 + App634 ZIP."""
from pathlib import Path
import argparse, hashlib, json, re, zipfile
from cryptography.hazmat.primitives.asymmetric import ec
from dfu_signature_validator import verify_packet, unique_json, vector

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--zip',type=Path,required=True)
p.add_argument('--app',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
p.add_argument('--rollback-reference',type=Path,help='Exact Z15 payload for the separately labelled counter18 return package.')
a=p.parse_args()
root=Path(__file__).resolve().parents[1]
boot=(a.rollback_reference or root/'_build/BOOTLOADER_UNSIGNED_ANALYSIS.bin').read_bytes()
app=a.app.read_bytes()
expected_boot='bbbda3519466621ebe5a56ce45b76ad4c6a9d7935eddd0b21b18d3eca48b00fc' if a.rollback_reference else '5219e8abaab8cd8bd335116f6438dbb85ffe5d6b36467abef266e78b56e2e7cd'
assert hashlib.sha256(boot).hexdigest()==expected_boot
boot_stem='bl18_z15_code' if a.rollback_reference else 'bl17'
boot_counter=18 if a.rollback_reference else 17
assert hashlib.sha256(app).hexdigest()=='597d61e301d663f30abfd63512c5d44faba7cfe5345a2b216d715003704aa9ca'
vector(boot,0x77000,0x7e000);vector(app,0x19000,0x77000)
pub=(root/'fw/bootloader/src/dfu_public_key.c').read_text()
raw=bytes(int(v,16) for v in re.findall(r'0x([0-9a-fA-F]{2})',re.search(r'pk\[64\]\s*=\s*\{([^}]+)\}',pub).group(1)))
assert hashlib.sha256(raw).hexdigest()=='9ee942fb8b5fa84aa3287f02451c7f2bf2168f5df2c97af253172d2e90f03a83'
key=ec.EllipticCurvePublicNumbers(int.from_bytes(raw[:32],'little'),int.from_bytes(raw[32:],'little'),ec.SECP256R1()).public_key()
with zipfile.ZipFile(a.zip) as z:
    names=z.namelist();assert len(names)==len(set(names))==5
    assert set(names)=={'manifest.json',boot_stem+'.bin',boot_stem+'.dat','app634.bin','app634.dat'}
    assert z.testzip() is None and all(not i.flag_bits&1 and not i.is_dir() for i in z.infolist())
    manifest=unique_json(z.read('manifest.json'))
    expected={'manifest':{'bootloader':{'bin_file':boot_stem+'.bin','dat_file':boot_stem+'.dat'},
                          'application':{'bin_file':'app634.bin','dat_file':'app634.dat'}}}
    assert manifest==expected
    rows=[]
    for kind,stem,binary,counter in [('bootloader',boot_stem,boot,boot_counter),('application','app634',app,634)]:
        assert z.read(stem+'.bin')==binary
        dat=z.read(stem+'.dat');assert 0<len(dat)<=512
        rows.append(verify_packet(dat,binary,counter,kind,key))
a.output.write_text(json.dumps({'passed':True,'hardwareTested':False,'archive':a.zip.name,
    'archiveSha256':hashlib.sha256(a.zip.read_bytes()).hexdigest(),'bytes':a.zip.stat().st_size,
    'images':rows,'softdeviceIncluded':False,'expectedAndroidPhases':['bootloader','application'],
    'rollbackToZ15Code':bool(a.rollback_reference),
    'publicKeySha256':hashlib.sha256(raw).hexdigest()},indent=2)+'\n')
print('PASS: exact two-part manifest, independent ECDSA, image hashes, versions, S112730-only and six negative controls.')
