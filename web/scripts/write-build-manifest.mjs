import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {lcdReleasePackage as previousPackage, lcdRelease as previousRelease} from '../public/dfu/lcd-release-reference.mjs';

import {lcdTest683, lcdTest683Package} from '../public/dfu/lcd-app683-reference.mjs';
import {lcdTest679, lcdTest679Package} from '../public/dfu/lcd-app679-reference.mjs';
import {lcdFinal680 as lcdRelease, lcdFinal680Package as lcdReleasePackage} from '../public/dfu/lcd-app680-reference.mjs';

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
  base, sourceTag:'web' + release.version, channel:mode === 'test-app670' ? 'isolated-test-path' : 'prerelease',
  packageManifestSha256:digest(packageBytes), firmware:{id:lcdReleasePackage.id,
    version:lcdReleasePackage.version, counter:lcdReleasePackage.counter,
    path:firmwarePath, bytes:firmware.length, sha256:digest(firmware)}};
manifest.optionalLcdFirmware = [[previousPackage,previousRelease],[lcdTest679Package,lcdTest679],[lcdTest683Package,lcdTest683]].map(([entry,reference]) => {
    const pathName = 'firmware/' + entry.file;
    const bytes = fs.readFileSync(path.join(output,pathName));
    if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256 || entry.sha256 !== reference.otaSha256)
        throw new Error('Optional LCD firmware package differs from the signed reference: ' + entry.file);
    return {id:entry.id, version:entry.version, counter:entry.counter, channel:entry.channel,
        path:pathName, bytes:entry.bytes, sha256:entry.sha256, sourceTag:reference.releaseTag,
        ...(reference === lcdTest683 ? {distribution:'prerelease', sourceCommit:reference.sourceCommit,
            sourceId:reference.sourceId, engineSha256:reference.engineSha256, simulatorSha256:reference.wasmSha256,
            deviceAcceptance:reference.hardwareAcceptance} : {})};
});
fs.writeFileSync(path.join(output, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({mode, version:release.version, firmware:lcdReleasePackage.id, manifest:'release.json'}));
