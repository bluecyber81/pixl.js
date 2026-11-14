// Historical mobile bookmarks under GitHub Pages. Canonical binary URLs are release assets.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../dist-pages/', import.meta.url));
const files = JSON.parse(await readFile(new URL('./legacy-downloads.json', import.meta.url), 'utf8'));
const archiveCommit = 'e76ef8c8c52a93c72f3465c264109600c2c43b05';
const repo = 'bluecyber81/pixl.js';
const allowed = new Set();
for (const row of files) {
    const match = /^downloads\/(web\d+\.\d+\.\d+)\/(Allmiibo_[a-zA-Z0-9_]+\.zip)$/.exec(row.path);
    if (!match || !Number.isSafeInteger(row.bytes) || row.bytes <= 0 || !/^[a-f0-9]{64}$/.test(row.sha256)) {
        throw new Error('Invalid legacy download entry: ' + row.path);
    }
    const [, tag, name] = match;
    const target = row.path + '/index.html';
    if (allowed.has(target)) throw new Error('Duplicate legacy bookmark: ' + row.path);
    allowed.add(target);
    const link = 'https://github.com/' + repo + '/releases/download/' + tag + '/' + name;
    const raw = 'https://raw.githubusercontent.com/' + repo + '/' + archiveCommit + '/' + row.path;
    const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name} · Allmiibo</title><meta http-equiv="refresh" content="0;url=${link}">
<style>body{font:1rem/1.6 system-ui,sans-serif;color:#173d49;background:#f4faf8;margin:0;padding:2rem 1.25rem}main{max-width:42rem;margin:5vh auto}h1,code{overflow-wrap:anywhere}a{display:inline-block;padding:.65rem 1rem;background:#075866;border-radius:.5rem;color:white;margin:0 .4rem .4rem 0}a+a{background:#e0eeeb;color:#123a42}small{display:block}</style></head>
<body><main><h1>${name}</h1><p>Der Download startet automatisch. Falls er ausbleibt, wähle einen der beiden Links.</p>
<p lang="en">Your download starts automatically. If it does not start, choose either link below.</p>
<p><a href="${link}">ZIP herunterladen · Download ZIP</a><a href="${raw}">Alternativer Download · Mirror</a></p>
<small>${row.bytes} Bytes · SHA-256</small><code>${row.sha256}</code></main></body></html>\n`;
    const directory = path.join(output, row.path);
    await mkdir(directory, {recursive:true});
    await writeFile(path.join(directory, 'index.html'), html);
}
// Fail a release that would put ZIPs or other unexpected files back into this mirror.
async function verify(folder) {
    for (const entry of await readdir(path.join(output, folder), {withFileTypes:true})) {
        const name = folder + '/' + entry.name;
        if (entry.isDirectory()) await verify(name);
        else if (!entry.isFile() || !allowed.delete(name)) throw new Error('Unexpected download file: ' + name);
    }
}
await verify('downloads');
if (allowed.size) throw new Error('Missing legacy download pages');
console.log(files.length + ' historical ZIP bookmarks prepared.');
