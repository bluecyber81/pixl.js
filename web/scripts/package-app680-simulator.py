"""Package the App680 simulator, exact build inputs, licenses and qualification results."""
import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT = Path('web/third-party/packed-simulator-de42')
DEST = Path('web/public/sources/LCD_DE4_2_App680_Simulatorquellen.zip')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    return json.loads((ROOT / path).read_bytes())


def main():
    binding = read(SNAPSHOT / 'SOURCE_BINDING.json')
    qualification = read('docs/validation/DE4_2_PFS.json')
    assert binding['engineSha256'] == qualification['engine']['engineSha256']
    wasm = 'web/public/lfs-capacity-de42.wasm'
    assert sha((ROOT / wasm).read_bytes()) == qualification['wasmSha256'] == binding['wasmSha256']
    files = {
        wasm, 'web/scripts/build-capacity-de42.py',
        'web/public/dfu/lcd-app680-reference.mjs',
        'docs/validation/DE4_2_PFS.json', 'docs/validation/DE4_2_CROSS_MOUNT.json',
        'docs/validation/DE4_2_CAPACITY_1081.json'
    }
    assert sha((ROOT / 'docs/validation/DE4_2_CROSS_MOUNT.json').read_bytes()) == qualification['crossMountReportSha256']
    for name, digest in binding['sourceFiles'].items():
        assert sha((ROOT / SNAPSHOT / name).read_bytes()) == digest, name
    files.update(str((SNAPSHOT / name).as_posix()) for name in [
        *binding['sourceFiles'], 'SOURCE_BINDING.json', 'ENGINE_IDENTITY.json',
        'GPL-2.0-LICENSE', 'LITTLEFS-LICENSE.md', 'SOURCE.txt'
    ])
    with zipfile.ZipFile(ROOT / DEST, 'w') as archive:
        for name in sorted(files):
            info = zipfile.ZipInfo(name, (2026,11,26,0,0,0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, (ROOT / name).read_bytes(), compresslevel=9)
    data = (ROOT / DEST).read_bytes()
    summary = dict(path=DEST.as_posix(), bytes=len(data), sha256=sha(data), files=len(files),
                   sourceId=qualification['sourceId'], capacityProfile='de42', simulatorProfile='de42',
                   wasmRebuilt=True)
    (ROOT / 'docs/validation/DE4_2_SIMULATOR_SOURCES.json').write_bytes((json.dumps(summary,indent=2)+'\n').encode())
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
