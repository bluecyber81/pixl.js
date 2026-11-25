"""Package the verified root build with its Python/CMD launcher; no native EXE."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

WEB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WEB))
from release_version import release_version


def sha(data):
    return hashlib.sha256(data).hexdigest()


def package(output, verify=False, transfer_test=False):
    version = release_version(WEB)
    file_version = version.replace('.', '_')
    dist = WEB / 'dist'
    release = json.loads((dist / 'release.json').read_text(encoding='utf-8'))
    package_bytes = (WEB / 'package.json').read_bytes()
    channel = 'test' if transfer_test else 'normal'
    if release.get('application') != 'allmiibo-dateimanager' or release.get('version') != version or \
            release.get('base') != '/' or release.get('channel') != channel or \
            release.get('packageManifestSha256') != sha(package_bytes):
        raise ValueError('The requested root build does not match its release channel or package.json.')
    if transfer_test and (version != '3.66.1' or release.get('label') != 'Transfer Test 4'
                          or release.get('sourceTag') != 'web3.66.1-transfer-test4'):
        raise ValueError('The root build is missing the expected Transfer Test 4 identity.')
    suffix = '_Transfer_Test4' if transfer_test else ''
    names = ['LICENSE', 'package.json', 'release_version.py', 'dateimanager_launcher.py', 'serve_local.py',
             'Start-Dateimanager.cmd', 'Start-Dateimanager-Direkt.cmd', 'Stop-Dateimanager.cmd',
             'Start-Dateimanager.ps1', 'Stop-Dateimanager.ps1', 'LIESMICH_' + file_version + suffix + '.txt']
    files = {}
    for name in names:
        source = WEB / name
        if source.is_symlink() or not source.is_file():
            raise ValueError('Required portable file is missing: ' + name)
        files[name] = source.read_bytes()
    for source in sorted(dist.rglob('*')):
        if source.is_symlink():
            raise ValueError('The production build must not contain symbolic links')
        if source.is_file():
            files['dist/' + source.relative_to(dist).as_posix()] = source.read_bytes()
    manifest = {'schema':1, 'version':version, 'entrypoint':'Start-Dateimanager.cmd',
                'runtime':'Python 3.8 or newer', 'nativeExecutable':False,
                'files':[{'path':name, 'bytes':len(data), 'sha256':sha(data)} for name,data in sorted(files.items())]}
    if transfer_test:
        manifest.update({key:release[key] for key in ('channel', 'label', 'sourceTag')})
    files['PORTABLE-MANIFEST.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    files['SHA256SUMS.txt'] = ''.join(sha(data) + '  ' + name + '\n' for name,data in sorted(files.items())).encode('utf-8')
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    top = 'Allmiibo_Dateimanager_' + file_version + suffix
    archive = output / (top + ('_Windows.zip' if transfer_test else '_Portable.zip'))
    with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zip_file:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(top + '/' + name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            zip_file.writestr(info, data, compresslevel=9)
    report = {'schema':1, 'version':version, 'archive':archive.name, 'bytes':archive.stat().st_size,
              'sha256':sha(archive.read_bytes()), 'files':len(files),
              'portableManifestSha256':sha(files['PORTABLE-MANIFEST.json']),
              'nativeExecutable':False, 'verification':None}
    if verify:
        receipt = output / 'PORTABLE_VERIFICATION.json'
        subprocess.run([sys.executable, '-B', str(WEB/'scripts/verify-portable.py'), str(archive),
                        '--report', str(receipt)], check=True)
        report['verification'] = {'path':receipt.name, 'sha256':sha(receipt.read_bytes())}
    (output/'PORTABLE_PACKAGE.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--verify', action='store_true', help='verify and start the actual extracted package on loopback')
    parser.add_argument('--transfer-test', action='store_true', help='package the labelled Web 3.66.1 Transfer Test 4 root build')
    args = parser.parse_args()
    package(args.output, args.verify, args.transfer_test)
