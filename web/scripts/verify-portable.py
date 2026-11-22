"""Verify the actual portable archive and its normal controller on loopback."""
import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path, PurePosixPath
import socket
import subprocess
import sys
import tempfile
import zipfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verify(archive, report):
    with tempfile.TemporaryDirectory(prefix='Allmiibo Portable ä & space ! ') as temp:
        folder = Path(temp)
        with zipfile.ZipFile(archive) as bundle:
            names = bundle.namelist()
            roots = {PurePosixPath(name).parts[0] for name in names}
            if len(roots) != 1 or len(set(names)) != len(names) or any(
                    PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts or '\\' in name or
                    (bundle.getinfo(name).external_attr >> 16) & 0o170000 not in (0, 0o100000) for name in names):
                raise ValueError('Unexpected portable archive layout')
            if sum(item.file_size for item in bundle.infolist()) > 256 * 1024 * 1024:
                raise ValueError('Unexpected portable archive size')
            bundle.extractall(folder)
        root = folder / roots.pop()
        manifest = json.loads((root/'PORTABLE-MANIFEST.json').read_text(encoding='utf-8'))
        expected = {row['path'] for row in manifest['files']} | {'PORTABLE-MANIFEST.json', 'SHA256SUMS.txt'}
        actual = {file.relative_to(root).as_posix() for file in root.rglob('*') if file.is_file()}
        if actual != expected:
            raise ValueError('Portable manifest file set differs')
        for row in manifest['files']:
            data = (root/row['path']).read_bytes()
            if len(data) != row['bytes'] or sha(data) != row['sha256']:
                raise ValueError('Portable content mismatch: ' + row['path'])
        version = json.loads((root/'package.json').read_text(encoding='utf-8'))['version']
        release = json.loads((root/'dist/release.json').read_text(encoding='utf-8'))
        if version != manifest['version'] or version != release['version']:
            raise ValueError('Portable version differs from built UI')
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        environment = dict(os.environ)
        environment.update(PYTHONDONTWRITEBYTECODE='1', PYTHONIOENCODING='utf-8')
        def controller(action):
            return subprocess.run([sys.executable, str(root/'dateimanager_launcher.py'), action,
                                   '-Port', str(port), '-NoBrowser'], cwd=folder,
                                  capture_output=True, text=True, encoding='utf-8', env=environment, timeout=15)
        def request(path):
            connection = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
            try:
                connection.request('GET', path)
                response = connection.getresponse()
                data = response.read()
                if response.status != 200:
                    raise RuntimeError('Packaged server HTTP ' + str(response.status))
                return data
            finally:
                connection.close()
        started = controller('start')
        if started.returncode:
            raise RuntimeError(started.stderr)
        try:
            health = json.loads(request('/.well-known/allmiibo-dateimanager'))
            if health.get('application') != 'allmiibo-dateimanager' or health.get('version') != version:
                raise ValueError('Packaged server health version differs')
            paths = ['index.html', 'release.json', release['firmware']['path']]
            downloads = []
            for path in paths:
                data = request('/' + path)
                if data != (root/'dist'/path).read_bytes():
                    raise ValueError('Packaged server changed content: ' + path)
                downloads.append({'path':path, 'bytes':len(data), 'sha256':sha(data)})
            repeated = controller('start')
            if repeated.returncode or 'laeuft bereits' not in repeated.stdout:
                raise RuntimeError('Packaged controller did not reuse its own server')
        finally:
            stopped = controller('stop')
            if stopped.returncode:
                raise RuntimeError(stopped.stderr)
        if (root/('server-state-' + str(port) + '.json')).exists():
            raise ValueError('Packaged controller left its server state')
        result = {'schema':1, 'passed':True, 'version':version, 'archiveSha256':sha(archive.read_bytes()),
                  'verifiedFiles':len(manifest['files']), 'normalControllerStartReuseStop':True,
                  'downloads':downloads, 'platform':sys.platform, 'nativeWindowsExecuted':os.name == 'nt',
                  'limits':['Loopback HTTP and the real Python controller only; no device or Bluetooth transfer.',
                            'CMD/PowerShell native execution is covered separately by the Windows CI job.']}
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
        print(json.dumps({'passed':True, 'version':version, 'verifiedFiles':len(manifest['files'])}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    verify(args.archive.resolve(), args.report.resolve())
