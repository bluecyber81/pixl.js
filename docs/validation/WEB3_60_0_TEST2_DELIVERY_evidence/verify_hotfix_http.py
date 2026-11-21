from pathlib import Path
import argparse, concurrent.futures, datetime, hashlib, json, re, subprocess, time, urllib.parse, urllib.request

p = argparse.ArgumentParser()
p.add_argument('--pages-commit', required=True)
p.add_argument('--output', required=True)
p.add_argument('--retry-failed')
a = p.parse_args()
root = Path('/workspace/scratch/0af425ec2cbb/app670_pages')
work = Path('/workspace/scratch/0af425ec2cbb/app670_status_hotfix')
manifest = json.loads((work / 'PAGES_PUBLICATION_MANIFEST.json').read_text())
changed = [e['path'] for e in manifest['entries']]
preserved = [
    'test/app670/dfu/lcd-private-reference.mjs',
    'test/app670/firmware/Allmiibo_LCD_DE3_97_670_TEST1_NUR_APP.zip',
    'test/app670/sources/LCD_DE3_97_App670_TEST1_Simulatorquellen.zip',
    'test/app670/lfs-capacity-de397.wasm',
    'index.html', 'dfu/lcd-private-reference.mjs',
    'test/app669/index.html', 'test/app669/dfu/lcd-private-reference.mjs',
]
old_index = subprocess.check_output(['git', '-C', str(root), 'show', manifest['localBase'] + ':test/app670/index.html']).decode()
old_assets = [url.removeprefix('/pixl.js/') for url in re.findall(r'(?:src|href)="([^"]+assets/[^"]+)"', old_index)]
preserved += old_assets
paths = list(dict.fromkeys(changed + preserved))
prior = None
if a.retry_failed:
    prior = json.loads(Path(a.retry_failed).read_text())
    assert prior['pagesCommit'] == a.pages_commit
    paths = [item['path'] for item in prior['files'] if not item['passed']]
    assert paths, 'No failed paths to retry.'
expected = {rel: (root / rel).read_bytes() for rel in paths}
base = 'https://bluecyber81.github.io/pixl.js/'

def check(rel):
    local = expected[rel]
    url = base + urllib.parse.quote(rel, safe='/') + '?verify=' + a.pages_commit
    item = {'path': rel, 'url': url, 'category': 'changed-hotfix-asset' if rel in changed else 'preserved-spot-check', 'expectedBytes': len(local), 'expectedSha256': hashlib.sha256(local).hexdigest(), 'passed': False}
    started = time.monotonic()
    try:
        request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache', 'User-Agent': 'Allmiibo-release-readback/3.60.0-test.2'})
        with urllib.request.urlopen(request, timeout=25) as response:
            data = response.read()
            item.update(status=response.status, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), contentType=response.headers.get('Content-Type'), finalUrl=response.url)
        item['passed'] = item['status'] == 200 and data == local
    except Exception as error:
        item['error'] = str(error)
    item['seconds'] = round(time.monotonic() - started, 3)
    return item

started = datetime.datetime.now(datetime.timezone.utc).isoformat()
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    results = list(pool.map(check, paths))
unchanged = all((root / rel).read_bytes() == data for rel, data in expected.items())
passed = all(item['passed'] for item in results) and unchanged
report = {
    'schema': 1,
    'scope': 'Every changed hotfix Pages asset, plus explicitly listed unchanged firmware/reference/source/WASM and main/App669/previous-hash spot checks. This is not a repeated HTTP scan of every unchanged file.',
    'startedAt': started, 'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'pagesCommit': a.pages_commit, 'webVersion': '3.60.0-test.2', 'baseUrl': base,
    'changedAssetCount': len(changed), 'preservedPaths': sorted(set(preserved)),
    'count': len(results), 'passedCount': sum(item['passed'] for item in results), 'passed': passed,
    'localReferenceUnchanged': unchanged, 'physicalDeviceAccess': False,
    'certificateVerification': 'Python urllib defaults, unchanged', 'maximumConcurrentRequests': 8,
    'retryOf': a.retry_failed, 'files': results,
}
Path(a.output).write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'passed': passed, 'count': len(results), 'passedCount': report['passedCount'], 'report': a.output, 'failures': [{'path': item['path'], 'error': item.get('error'), 'status': item.get('status')} for item in results if not item['passed']]}))
raise SystemExit(0 if passed else 1)
