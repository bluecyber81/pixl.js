#!/usr/bin/env python3
"""Bind the current release's complete OTA ZIP and extracted application to RELEASE_INFO.

This prepares input for the unchanged source-bound bootloader data-path model.
Cryptographic signature verification remains a separate application-job gate.
"""
import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re
from zipfile import ZipFile


def extract_release_application(root, output, report):
    if output.resolve() == report.resolve() or output.exists() or report.exists():
        raise ValueError('Choose separate new output and report paths; preserve existing evidence.')
    metadata_bytes = (root / 'RELEASE_INFO.json').read_bytes()
    release = json.loads(metadata_bytes)
    expected = {}
    for key in ('ota_sha256', 'application_sha256'):
        value = release.get(key)
        if not isinstance(value, str) or not re.fullmatch(r'[0-9a-f]{64}', value):
            raise ValueError('Missing or invalid release digest: ' + key)
        expected[key] = value
    ota_path = release.get('application_ota_path')
    if not isinstance(ota_path, str) or not ota_path:
        raise ValueError('Missing application_ota_path.')
    archive_path = (root / ota_path).resolve()
    if not archive_path.is_relative_to(root.resolve()):
        raise ValueError('The release OTA must belong to this repository.')
    ota = archive_path.read_bytes()
    if sha256(ota).hexdigest() != expected['ota_sha256']:
        raise ValueError('Complete OTA ZIP SHA-256 does not match RELEASE_INFO.json.')
    with ZipFile(BytesIO(ota)) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError('Duplicate OTA archive members.')
        manifest = json.loads(archive.read('manifest.json'))['manifest']
        if set(manifest) != {'application'}:
            raise ValueError('Expected an application-only OTA manifest.')
        payload_name = manifest['application']['bin_file']
        image = archive.read(payload_name)
    if sha256(image).hexdigest() != expected['application_sha256']:
        raise ValueError('Application payload SHA-256 does not match RELEASE_INFO.json.')
    result = dict(passed=True, version=release['version'], counter=release['counter'],
                  otaPath=ota_path, otaSha256=expected['ota_sha256'], otaBytes=len(ota),
                  applicationMember=payload_name, applicationSha256=expected['application_sha256'],
                  applicationBytes=len(image), releaseInfoSha256=sha256(metadata_bytes).hexdigest(),
                  scope='Exact release ZIP and payload hash binding; signature verification is a separate application-job gate.')
    output.parent.mkdir(parents=True, exist_ok=True)
    report.parent.mkdir(parents=True, exist_ok=True)
    with output.open('xb') as target:
        target.write(image)
    with report.open('x', encoding='utf-8') as target:
        target.write(json.dumps(result, indent=2) + '\n')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--report', required=True, type=Path)
    args = parser.parse_args()
    result = extract_release_application(Path(__file__).resolve().parents[1], args.output, args.report)
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()
