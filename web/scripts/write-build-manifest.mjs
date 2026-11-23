import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {lcdRelease, lcdReleasePackage} from '../public/dfu/lcd-release-reference.mjs';

const web = fileURLToPath(new URL('../', import.meta.url));
const targets = {root:['dist','/'], pages:['dist-pages','/pixl.js/'], 'test-app670':['dist-test-app670','/pixl.js/test/app670/']};
const mode = process.argv[2];
if (!Object.hasOwn(targets, mode) || process.argv.length !== 3) throw new Error('Expected root, pages or test-app670');
const [folder, base] = targets[mode], output = path.join(web, folder);
const packageBytes = fs.readFileSync(path.join(web, 'package.json'));
const release = JSON.parse(packageBytes);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
if (!fs.statSync(path.join(output, 'index.html')).isFile()) throw new Error('Built UI is missing');
const firmwarePath = 'firmware/' + lcdReleasePackage.file;
const firmware = fs.readFileSync(path.join(output, firmwarePath));
if (firmware.length !== lcdReleasePackage.bytes || digest(firmware) !== lcdReleasePackage.sha256 ||
    lcdReleasePackage.sha256 !== lcdRelease.otaSha256) throw new Error('Built firmware package differs from its exact release binding');
const manifest = {schema:1, application:'allmiibo-dateimanager', version:release.version,
  base, channel:mode === 'test-app670' ? 'isolated-test-path' : 'normal',
  packageManifestSha256:digest(packageBytes), firmware:{id:lcdReleasePackage.id,
    version:lcdReleasePackage.version, counter:lcdReleasePackage.counter,
    path:firmwarePath, bytes:firmware.length, sha256:digest(firmware)}};
fs.writeFileSync(path.join(output, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({mode, version:release.version, firmware:lcdReleasePackage.id, manifest:'release.json'}));
