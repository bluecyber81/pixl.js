import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {lcdRelease, lcdReleasePackage} from '../public/dfu/lcd-release-reference.mjs';
import {lcdTest680,lcdTest680Package} from '../public/dfu/lcd-app680-reference.mjs';
import {lcdTest679,lcdTest679Package} from '../public/dfu/lcd-app679-reference.mjs';
import {buildTarget} from './build-targets.mjs';
import {transferTestLabel, transferTestTag, transferBaseTag} from '../src/lib/project-downloads.js';

const web = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2];
if (process.argv.length !== 3) throw new Error('Expected one build target');
const [folder, base] = buildTarget(mode), output = path.join(web, folder);
const transferTest = mode === 'test-transfer6' || process.env.VITE_BUILD_LABEL === transferTestLabel;
const packageBytes = fs.readFileSync(path.join(web, 'package.json'));
const release = JSON.parse(packageBytes);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
if (!fs.statSync(path.join(output, 'index.html')).isFile()) throw new Error('Built UI is missing');
// Vite's public/ pages bypass HTML transformation. Mark the standalone
// updater too, so a direct bookmark identifies the transfer test.
if (transferTest) {
  for (const relative of ['index.html', 'dfu/web.html']) {
    const file = path.join(output, relative);
    const html = fs.readFileSync(file, 'utf8');
    if (html.includes(' · ' + transferTestLabel + '</title>')) continue;
    const title = /(<title>[^<]+)(<\/title>)/;
    if (!title.test(html)) throw new Error('Missing page title: ' + relative);
    let marked = html.replace(title, '$1 · ' + transferTestLabel + '$2');
    if (relative === 'dfu/web.html') {
      const eyebrow = '<p class="eyebrow">';
      if (!marked.includes(eyebrow)) throw new Error('Missing visible DFU version');
      marked = marked.replace(eyebrow, eyebrow + transferTestLabel + ' · ');
      for (const name of ['secure-dfu.js', 'page.js']) {
        const ref = name + '?v=' + release.version + '"';
        if (!marked.includes(ref)) throw new Error('Missing updater client reference: ' + name);
        const hash = digest(fs.readFileSync(path.join(output, 'dfu', name))).slice(0, 16);
        marked = marked.replace(ref, name + '?v=' + release.version + '-' + hash + '"');
      }
    }
    fs.writeFileSync(file, marked);
  }
}
const firmwarePath = 'firmware/' + lcdReleasePackage.file;
const firmware = fs.readFileSync(path.join(output, firmwarePath));
if (firmware.length !== lcdReleasePackage.bytes || digest(firmware) !== lcdReleasePackage.sha256 ||
    lcdReleasePackage.sha256 !== lcdRelease.otaSha256) throw new Error('Built firmware package differs from its exact release binding');
const manifest = {schema:1, application:'allmiibo-dateimanager', version:release.version,
  base, channel:mode.startsWith('test-') ? 'isolated-test-path' : transferTest ? 'test' : 'normal',
  ...(transferTest ? {label:transferTestLabel, sourceTag:transferTestTag, sourceTagStatus:'planned-local', sourceBaseTag:transferBaseTag} : {}),
  packageManifestSha256:digest(packageBytes), firmware:{id:lcdReleasePackage.id,
    version:lcdReleasePackage.version, counter:lcdReleasePackage.counter,
    path:firmwarePath, bytes:firmware.length, sha256:digest(firmware)}};
if (transferTest) {
  const candidates = [[lcdTest680Package, lcdTest680], [lcdTest679Package, lcdTest679]];
  const [current, previous] = candidates.map(([entry, reference]) => {
    const file = 'firmware/' + entry.file;
    const candidate = fs.readFileSync(path.join(output,file));
    if (candidate.length !== entry.bytes || digest(candidate) !== entry.sha256 || reference.otaSha256 !== entry.sha256)
      throw new Error('Bundled test firmware differs from its signed reference: ' + entry.file);
    return {id:entry.id, version:entry.version, counter:entry.counter, path:file, bytes:candidate.length, sha256:entry.sha256,
      board:'LCD', applicationOnly:true, hardwareAcceptance:reference.hardwareAcceptance};
  });
  manifest.testFirmware = current;
  manifest.previousTestFirmware = previous;
}
fs.writeFileSync(path.join(output, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({mode, version:release.version, firmware:lcdReleasePackage.id, manifest:'release.json'}));
