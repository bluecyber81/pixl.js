"""Publish only the reviewed, CI-passed current main as App675 and Web3.65.0.

No source checkout/build, external commands, third-party packages, PAT, tag move,
asset replacement, credential discovery or mutable branch download is performed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import urllib.error
import urllib.parse
import urllib.request

REPO = 'bluecyber81/pixl.js'
REPO_ID = 1430130451
PREFIX = '/repos/' + REPO
PUBLISH_REF = 'refs/heads/publish/app675-web3650'
LIMIT = 50_000_000
WORKFLOWS = {
    'source': ('.github/workflows/checks.yml', {
        'Web tests and both bundles', 'Windows portable launcher',
        'Portable firmware regression subset'}),
    'firmware': ('.github/workflows/unsigned-firmware.yml', {
        'LCD application build', 'z17 source-bound build and ARM tests',
        'z19 source-bound build and ARM tests',
        'z20 source-bound build and DFU recovery tests',
        'z21 source-bound build and DFU recovery tests'}),
}
ASSETS = {
    'de3.102': {'Allmiibo_LCD_DE3_102_675_NUR_APP.zip'},
    'web3.65.0': {'Allmiibo_Dateimanager_3_65_0_Portable.zip',
                  'Allmiibo_Dateimanager_3_65_0_Quellcode.zip'},
}
MAKE_LATEST = {'de3.102': True, 'web3.65.0': False}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def hex_value(value, length):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{%d}' % length, value)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Github:
    def __init__(self, token):
        self.token = token
        self.open = urllib.request.build_opener(NoRedirect()).open

    def json(self, method, endpoint, data=None, missing=False, upload=False):
        require(endpoint == PREFIX or endpoint.startswith(PREFIX + '/'), 'Unexpected repository endpoint')
        host = 'uploads.github.com' if upload else 'api.github.com'
        headers = {'Authorization': 'Bearer ' + self.token,
                   'Accept': 'application/vnd.github+json',
                   'X-GitHub-Api-Version': '2022-11-28',
                   'User-Agent': 'allmiibo-reviewed-release'}
        payload = data if upload else json.dumps(data).encode() if data is not None else None
        if payload is not None:
            headers['Content-Type'] = 'application/zip' if upload else 'application/json'
        request = urllib.request.Request('https://' + host + endpoint,
                                         data=payload, headers=headers, method=method)
        try:
            with self.open(request, timeout=90) as response:
                raw = response.read(4_000_001)
                require(len(raw) <= 4_000_000, 'Oversized API response')
                return json.loads(raw)
        except urllib.error.HTTPError as error:
            if error.code == 404 and missing:
                return None
            # Never include headers, response bodies or the token in errors.
            raise RuntimeError('GitHub HTTP %d for %s %s; no fallback target or token' %
                               (error.code, method, endpoint)) from None

    def raw(self, commit, path, limit):
        require(hex_value(commit, 40), 'Source is not a complete commit SHA')
        item = PurePosixPath(path)
        require(not item.is_absolute() and '..' not in item.parts and
                str(item) == path and '\\' not in path, 'Unsafe source path')
        url = 'https://raw.githubusercontent.com/' + REPO + '/' + commit + '/' + urllib.parse.quote(path, safe='/')
        # Public immutable input: no token goes to a download endpoint.
        request = urllib.request.Request(url, headers={'User-Agent': 'allmiibo-reviewed-release'})
        with self.open(request, timeout=90) as response:
            data = response.read(limit + 1)
        require(len(data) <= limit, 'Oversized immutable input')
        return data


def pages(api, endpoint, key=None):
    result = []
    for number in range(1, 21):
        batch = api.json('GET', endpoint + ('&' if '?' in endpoint else '?') +
                         'per_page=100&page=' + str(number))
        batch = batch[key] if key else batch
        require(isinstance(batch, list), 'Invalid paginated response')
        result.extend(batch)
        if len(batch) < 100:
            return result
    raise ValueError('Pagination exceeded the bounded release check')


def validate(manifest):
    require(manifest.get('schema') == 1 and manifest.get('ready') is True,
            'Publication manifest is not finalized')
    require(manifest.get('repository') == REPO and hex_value(manifest.get('target_main_sha'), 40),
            'Wrong repository or incomplete target main SHA')
    require(set(manifest['checks']) == set(WORKFLOWS), 'Both CI bindings are required')
    for check in manifest['checks'].values():
        require(type(check['run_id']) is int and check['run_id'] > 0 and
                type(check['attempt']) is int and check['attempt'] > 0 and
                hex_value(check['workflow_sha256'], 64), 'Incomplete CI attempt binding')
    provenance = manifest['provenance']
    for name in ['firmware_production_commit', 'web_source_commit']:
        require(hex_value(provenance[name], 40), 'Incomplete original source provenance')
    for name in ['firmware_source_id', 'application_sha256', 'ota_sha256']:
        require(hex_value(provenance[name], 64), 'Incomplete firmware hash provenance')
    releases = manifest['releases']
    require(len(releases) == 2 and {r['tag'] for r in releases} == set(ASSETS), 'Unexpected release set')
    for release in releases:
        require(release.get('make_latest') is MAKE_LATEST[release['tag']],
                'Latest selection must be App675=true and Web3.65.0=false')
        require(isinstance(release['name'], str) and len(release['name']) <= 100 and
                isinstance(release['notes'], str) and len(release['notes']) <= 10000, 'Invalid release text')
        require(len(release['assets']) == len(ASSETS[release['tag']]) and
                {a['name'] for a in release['assets']} == ASSETS[release['tag']], 'Unexpected asset set')
        for asset in release['assets']:
            require(hex_value(asset['source_commit'], 40) and hex_value(asset['sha256'], 64) and
                    type(asset['bytes']) is int and 0 < asset['bytes'] <= LIMIT,
                    'Unbound or oversized asset')
            require(PurePosixPath(asset['path']).name == asset['name'], 'Asset filename mismatch')


def current_main(api, target):
    repo = api.json('GET', PREFIX)
    require(repo['id'] == REPO_ID and repo['full_name'] == REPO and
            repo['default_branch'] == 'main', 'Repository identity/default branch changed')
    ref = api.json('GET', PREFIX + '/git/ref/heads/main')
    require(ref['object']['type'] == 'commit' and ref['object']['sha'] == target,
            'Current main is not the reviewed target; do not retarget automatically')


def check_runs(api, manifest):
    target = manifest['target_main_sha']
    current_main(api, target)
    for kind, (workflow, required_jobs) in WORKFLOWS.items():
        pin = manifest['checks'][kind]
        require(digest(api.raw(target, workflow, 200000)) == pin['workflow_sha256'],
                'CI workflow does not match reviewed bytes')
        run = api.json('GET', PREFIX + '/actions/runs/' + str(pin['run_id']))
        require(run['repository']['id'] == REPO_ID and run['head_repository']['id'] == REPO_ID and
                run['repository']['full_name'] == REPO and run['head_repository']['full_name'] == REPO,
                'Foreign workflow run/repository')
        require(run['head_sha'] == target and run['head_branch'] == 'main' and
                run['event'] == 'push' and not run['pull_requests'] and
                run['path'] == workflow and run['run_attempt'] == pin['attempt'] and
                run['status'] == 'completed' and run['conclusion'] == 'success',
                'CI is not the exact successful main push attempt')
        jobs = pages(api, PREFIX + '/actions/runs/%d/attempts/%d/jobs' %
                     (pin['run_id'], pin['attempt']), 'jobs')
        names = [job['name'] for job in jobs]
        require(len(names) == len(set(names)) and required_jobs <= set(names), 'Required CI jobs missing/duplicated')
        for job in jobs:
            require(job['head_sha'] == target and job['status'] == 'completed', 'Job commit/status mismatch')
            optional = kind == 'firmware' and job['name'] == 'BL8 corresponding-source build'
            require(job['conclusion'] == 'success' or optional and job['conclusion'] == 'skipped',
                    'CI job not successful: ' + job['name'])


def bound_assets(api, manifest):
    target, provenance = manifest['target_main_sha'], manifest['provenance']
    package = json.loads(api.raw(target, 'web/package.json', 100000))
    firmware = json.loads(api.raw(target, 'RELEASE_INFO.json', 1000000))
    require(package['version'] == '3.65.0' and firmware['version'] == '2.22.0-DE3.102' and
            firmware['counter'] == 675 and firmware['web_version'] == '3.65.0', 'Main product versions differ')
    for name in ['application_sha256', 'application_bytes', 'ota_sha256', 'ota_bytes']:
        require(firmware[name] == provenance[name], 'Frozen firmware identity differs: ' + name)
    require(firmware['production_source_id_sha256'] == provenance['firmware_source_id'],
            'Frozen firmware SourceID differs')
    output = {}
    for release in manifest['releases']:
        for asset in release['assets']:
            data = api.raw(asset['source_commit'], asset['path'], asset['bytes'])
            require(len(data) == asset['bytes'] and digest(data) == asset['sha256'],
                    'Asset bytes/hash mismatch: ' + asset['name'])
            if release['tag'] == 'de3.102':
                require(asset['source_commit'] == target and asset['path'] == firmware['application_ota_path'] and
                        asset['sha256'] == provenance['ota_sha256'] and asset['bytes'] == provenance['ota_bytes'],
                        'Firmware asset is not the exact CI-checked main package')
            output[asset['name']] = data
    return output


def tag_target(api, tag):
    ref = api.json('GET', PREFIX + '/git/ref/tags/' + tag, missing=True)
    if ref is None:
        return None
    item = ref['object']
    for _ in range(5):
        if item['type'] == 'commit':
            return item['sha']
        require(item['type'] == 'tag' and hex_value(item['sha'], 40), 'Invalid existing tag object')
        item = api.json('GET', PREFIX + '/git/tags/' + item['sha'])['object']
    raise ValueError('Existing tag nesting exceeds bound')


def marker(manifest):
    return '<!-- allmiibo-reviewed-publication:' + digest(json.dumps(manifest, sort_keys=True,
                ensure_ascii=False, separators=(',', ':')).encode()) + ' -->'


def release_body(manifest, release):
    target, p = manifest['target_main_sha'], manifest['provenance']
    lines = [release['notes'], '', 'Geprüfter gemeinsamer Quellstand: `' + target + '`.',
             '[Quellcode](https://github.com/' + REPO + '/tree/' + target + ')', '',
             'Original-Firmwareproduktion: `' + p['firmware_production_commit'] + '`.',
             'Original-Webquelle: `' + p['web_source_commit'] + '`.',
             'Firmware-SourceID: `' + p['firmware_source_id'] + '`.', '',
             '| Datei | Bytes | SHA-256 |', '| --- | ---: | --- |']
    lines.extend('| ' + a['name'] + ' | ' + str(a['bytes']) + ' | `' + a['sha256'] + '` |' for a in release['assets'])
    lines.extend(['', 'CI:'] + ['- [' + key + '](https://github.com/' + REPO + '/actions/runs/' +
                  str(value['run_id']) + '/attempts/' + str(value['attempt']) + ')'
                  for key, value in manifest['checks'].items()] + ['', marker(manifest)])
    return '\n'.join(lines)


def matching_asset(actual, expected):
    require(actual['name'] == expected['name'] and actual['state'] == 'uploaded' and
            actual['size'] == expected['bytes'] and actual.get('digest') == 'sha256:' + expected['sha256'],
            'Existing/uploaded asset differs; it will not be replaced: ' + expected['name'])


def inventory(api, manifest):
    releases = pages(api, PREFIX + '/releases')
    result = {}
    for wanted in manifest['releases']:
        tag = wanted['tag']
        actual_target = tag_target(api, tag)
        require(actual_target in (None, manifest['target_main_sha']), 'Existing tag points elsewhere: ' + tag)
        matches = [r for r in releases if r['tag_name'] == tag]
        require(len(matches) <= 1, 'Multiple releases for the target tag')
        current = matches[0] if matches else None
        if current:
            require(current['name'] == wanted['name'] and current['body'] == release_body(manifest, wanted) and
                    current['prerelease'] is False and
                    (actual_target == manifest['target_main_sha'] or
                     current['draft'] and current['target_commitish'] == manifest['target_main_sha']),
                    'Existing release has a different owner/manifest/target; no overwrite')
            found = pages(api, PREFIX + '/releases/' + str(current['id']) + '/assets')
            require(len(found) == len({a['name'] for a in found}) and
                    {a['name'] for a in found} <= ASSETS[tag], 'Unexpected/duplicate existing release assets')
            for actual in found:
                matching_asset(actual, next(a for a in wanted['assets'] if a['name'] == actual['name']))
            require(current['draft'] or len(found) == len(wanted['assets']), 'Published release is incomplete; no modification')
            current = {**current, 'checked_assets': found}
        result[tag] = current
    return result


def execute(api, manifest, publish=False):
    validate(manifest)
    check_runs(api, manifest)
    assets = bound_assets(api, manifest)
    existing = inventory(api, manifest)
    if not publish:
        return {'verified': True, 'target': manifest['target_main_sha'], 'assets': sorted(assets)}
    result = []
    for wanted in manifest['releases']:
        current = existing[wanted['tag']]
        if current and not current['draft']:
            result.append({'tag': wanted['tag'], 'status': 'already-identical'})
            continue
        check_runs(api, manifest)
        if current is None:
            current = api.json('POST', PREFIX + '/releases', {
                'tag_name': wanted['tag'], 'target_commitish': manifest['target_main_sha'],
                'name': wanted['name'], 'body': release_body(manifest, wanted),
                'draft': True, 'prerelease': False, 'generate_release_notes': False,
                # Drafts cannot be Latest; the fixed choice is applied only
                # when the complete, reverified release becomes public.
                'make_latest': 'false'})
            current['checked_assets'] = []
        upload_path = PREFIX + '/releases/' + str(current['id']) + '/assets'
        require(current['upload_url'].split('{', 1)[0] == 'https://uploads.github.com' + upload_path,
                'Unexpected release upload endpoint')
        names = {a['name'] for a in current['checked_assets']}
        for asset in wanted['assets']:
            if asset['name'] not in names:
                uploaded = api.json('POST', upload_path + '?name=' + urllib.parse.quote(asset['name'], safe=''),
                                    assets[asset['name']], upload=True)
                matching_asset(uploaded, asset)
        # Refresh all assets and all gate conditions before the public transition.
        refreshed = inventory(api, manifest)[wanted['tag']]
        require(refreshed and len(refreshed['checked_assets']) == len(wanted['assets']), 'Incomplete release draft')
        check_runs(api, manifest)
        published = api.json('PATCH', PREFIX + '/releases/' + str(current['id']),
                             {'draft': False, 'make_latest': str(MAKE_LATEST[wanted['tag']]).lower()})
        require(published['draft'] is False and tag_target(api, wanted['tag']) == manifest['target_main_sha'],
                'Published release/tag validation failed')
        result.append({'tag': wanted['tag'], 'status': 'published'})
    return {'verified': True, 'target': manifest['target_main_sha'], 'releases': result}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['verify', 'publish'])
    parser.add_argument('manifest', type=Path)
    args = parser.parse_args()
    require(os.environ.get('GITHUB_REPOSITORY') == REPO and
            os.environ.get('GITHUB_EVENT_NAME') == 'push' and
            os.environ.get('GITHUB_REF') == PUBLISH_REF and
            hex_value(os.environ.get('GITHUB_SHA'), 40), 'Not the reviewed publication workflow context')
    token = os.environ.get('GITHUB_TOKEN')
    require(bool(token), 'The normal job GITHUB_TOKEN is required')
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    print(json.dumps(execute(Github(token), manifest, args.mode == 'publish'), indent=2))
