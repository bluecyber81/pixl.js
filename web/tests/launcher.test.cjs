const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const web = path.resolve(__dirname, '..');
const healthPath = '/.well-known/allmiibo-dateimanager';
const windows = process.platform === 'win32';
const pythonCandidates = [process.env.ALLMIIBO_TEST_PYTHON,
  windows && path.join(os.homedir(), 'Documents/Codex/Tools/Agent-Tools/.venv/Scripts/python.exe'),
  windows && path.join(os.homedir(), 'scoop/apps/python/current/python.exe')].filter(Boolean);
const python = pythonCandidates.find(p => fs.existsSync(p)) || (windows ? 'python' : 'python3');
const ps = windows ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe') : null;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function fixture() {
  const parent = path.resolve(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(parent, 'allmiibo-launcher-test-'));
  for (const file of ['serve_local.py', 'Start-Dateimanager.ps1', 'Stop-Dateimanager.ps1', 'Start-Dateimanager.cmd', 'Stop-Dateimanager.cmd']) {
    fs.copyFileSync(path.join(web, file), path.join(dir, file));
  }
  fs.mkdirSync(path.join(dir, 'dist/empty'), { recursive: true });
  fs.cpSync(path.join(web, 'public'), path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist/index.html'), '<title>New arbitrary UI title</title>fixture only');
  return { dir, cleanup() {
    // Delete only the exact temporary test tree, never a project or user folder.
    const resolved = fs.realpathSync(dir);
    assert.equal(path.dirname(resolved), fs.realpathSync(parent));
    assert.ok(path.basename(resolved).startsWith('allmiibo-launcher-test-'));
    fs.rmSync(resolved, { recursive: true });
  } };
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function request(port, target = healthPath, method = 'GET', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: target, method, headers, timeout: 1500 }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('Local test request timed out')));
    req.on('error', reject); req.end();
  });
}
async function waitHealth(port) {
  for (let attempt = 0; attempt < 60; ++attempt) {
    try { const response = await request(port); if (response.status === 200) return JSON.parse(response.body); } catch {}
    await delay(50);
  }
  throw new Error('Owned local test server was not ready');
}
async function waitClosed(port) {
  for (let attempt = 0; attempt < 80; ++attempt) {
    try { await request(port); } catch { return; }
    await delay(50);
  }
  throw new Error('Owned server did not close its own listener');
}
async function stopHttp(port, token, headers = {}) {
  return request(port, healthPath + '/shutdown', 'POST', { 'X-Allmiibo-Token': token, ...headers });
}
function powershell(dir, script, port) {
  // Windows detached children can retain their parent's pipe handles after the
  // launching shell exits. Capture to bounded test-owned files, not open pipes.
  const label = crypto.randomBytes(8).toString('hex');
  const stdout = path.join(dir, `test-${label}-stdout.log`), stderr = path.join(dir, `test-${label}-stderr.log`);
  const out = fs.openSync(stdout, 'w'), err = fs.openSync(stderr, 'w');
  let result;
  try {
    result = spawnSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, script), '-Port', String(port), ...(script.startsWith('Start') ? ['-NoBrowser'] : [])], { stdio: ['ignore', out, err], windowsHide: true, timeout: 30000 });
  } finally { fs.closeSync(out); fs.closeSync(err); }
  return { ...result, stdout: fs.readFileSync(stdout, 'utf8'), stderr: fs.readFileSync(stderr, 'utf8') };
}
function state(dir, port) { return JSON.parse(fs.readFileSync(path.join(dir, `server-state-${port}.json`), 'utf8').replace(/^\uFEFF/, '')); }
function succeeded(result) { assert.ifError(result.error); assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error)); }

test('local server identity, routes and authenticated self-stop reject wrong token, Origin and Host', async () => {
  const f = fixture(), port = await freePort(), token = crypto.randomBytes(16).toString('hex');
  const child = spawn(python, [path.join(f.dir, 'serve_local.py'), '--port', String(port), '--directory', path.join(f.dir, 'dist'), '--instance-token', token], { stdio: 'ignore', windowsHide: true });
  const exited = new Promise(resolve => child.once('exit', resolve));
  try {
    const health = await waitHealth(port);
    assert.deepEqual(health, { application: 'allmiibo-dateimanager', version: '3.39.0', instance: crypto.createHash('sha256').update(token).digest('hex') });
    assert.ok(!JSON.stringify(health).includes(token));
    const head = await request(port, healthPath, 'HEAD');
    assert.equal(head.status, 200); assert.equal(head.body, ''); assert.ok(Number(head.headers['content-length']) > 0);
    const index = await request(port, '/');
    assert.equal(index.status, 200); assert.match(index.body, /New arbitrary UI title/);
    assert.equal(index.headers['x-content-type-options'], 'nosniff');
    const dfu = await request(port, '/dfu/web.html');
    assert.equal(dfu.status, 200); assert.match(dfu.body, /Allmiibo DFU 3\.39\.0/);
    assert.match(dfu.headers['content-type'], /text\/html/);
    const base = new URL(`http://127.0.0.1:${port}/dfu/web.html`);
    assert.match(dfu.body, /<a\b[^>]*href="\.\.\/"/);
    const back = await request(port, new URL('../', base).pathname);
    assert.equal(back.status, 200); assert.equal(back.body, index.body);
    for (const match of dfu.body.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)) {
      const asset = new URL(match[1], base);
      assert.equal(asset.origin, base.origin, match[1]);
      const response = await request(port, asset.pathname + asset.search);
      assert.equal(response.status, 200, match[1]);
      const file = path.join(f.dir, 'dist', decodeURIComponent(asset.pathname.slice(1)));
      assert.ok(fs.statSync(file).isFile(), match[1]);
      assert.equal(response.body, fs.readFileSync(file, 'utf8'));
      if (match[1].endsWith('.js')) assert.match(response.headers['content-type'], /javascript/);
    }
    assert.equal((await request(port, '/a/00000000-12345678')).status, 200);
    assert.equal((await request(port, '/a/invalid')).status, 404);
    assert.equal((await request(port, '/empty/')).status, 404);
    assert.equal((await request(port, healthPath, 'GET', { Host: 'foreign.invalid' })).status, 403);
    assert.equal((await stopHttp(port, '0'.repeat(32))).status, 403);
    assert.equal((await stopHttp(port, token, { Origin: 'https://foreign.invalid' })).status, 403);
    assert.equal((await stopHttp(port, token, { Origin: 'null' })).status, 403);
    assert.equal((await stopHttp(port, token, { Host: `localhost:${port}` })).status, 403);
    assert.equal((await request(port, healthPath + '/shutdown')).status, 404);
    assert.equal((await waitHealth(port)).instance, health.instance);
    assert.equal((await stopHttp(port, token, { Origin: `http://127.0.0.1:${port}` })).status, 200);
    await waitClosed(port); await exited;
  } finally {
    if (child.exitCode === null) { await stopHttp(port, token).catch(() => {}); await exited; }
    f.cleanup();
  }
});

test('Windows launchers keep two ports independent, reject altered tokens and preserve legacy state', { skip: !windows }, async () => {
  const f = fixture(), first = await freePort(), second = await freePort();
  const legacy = '{"legacy":"must remain untouched"}';
  fs.writeFileSync(path.join(f.dir, 'server-state.json'), legacy);
  const owned = [];
  try {
    owned.push(first); succeeded(powershell(f.dir, 'Start-Dateimanager.ps1', first));
    owned.push(second); succeeded(powershell(f.dir, 'Start-Dateimanager.ps1', second));
    const a = state(f.dir, first), b = state(f.dir, second);
    assert.notEqual(a.instance, b.instance); assert.equal(a.port, first); assert.equal(b.port, second);
    assert.equal((await waitHealth(first)).instance, a.instance);
    assert.equal((await waitHealth(second)).instance, b.instance);
    assert.ok(fs.existsSync(path.join(f.dir, `server-${first}.log`)));
    assert.ok(fs.existsSync(path.join(f.dir, `server-${second}.log`)));
    const wrong = { ...a, token: '0'.repeat(32) };
    fs.writeFileSync(path.join(f.dir, `server-state-${first}.json`), JSON.stringify(wrong));
    assert.notEqual(powershell(f.dir, 'Stop-Dateimanager.ps1', first).status, 0);
    assert.notEqual(powershell(f.dir, 'Start-Dateimanager.ps1', first).status, 0);
    assert.equal((await waitHealth(first)).instance, a.instance);
    fs.writeFileSync(path.join(f.dir, `server-state-${first}.json`), JSON.stringify(a));
    const beforeRestart = fs.readFileSync(path.join(f.dir, `server-state-${first}.json`));
    succeeded(powershell(f.dir, 'Start-Dateimanager.ps1', first));
    assert.deepEqual(fs.readFileSync(path.join(f.dir, `server-state-${first}.json`)), beforeRestart);
    assert.equal((await waitHealth(first)).instance, a.instance);
    // Missing or damaged ownership data must not adopt or stop a live listener.
    fs.unlinkSync(path.join(f.dir, `server-state-${first}.json`));
    assert.notEqual(powershell(f.dir, 'Start-Dateimanager.ps1', first).status, 0);
    assert.equal((await waitHealth(first)).instance, a.instance);
    fs.writeFileSync(path.join(f.dir, `server-state-${first}.json`), '{broken');
    assert.notEqual(powershell(f.dir, 'Start-Dateimanager.ps1', first).status, 0);
    assert.equal((await waitHealth(first)).instance, a.instance);
    fs.writeFileSync(path.join(f.dir, `server-state-${first}.json`), beforeRestart);
    succeeded(powershell(f.dir, 'Stop-Dateimanager.ps1', first)); await waitClosed(first);
    assert.equal((await waitHealth(second)).instance, b.instance);
    succeeded(powershell(f.dir, 'Stop-Dateimanager.ps1', second)); await waitClosed(second);
    succeeded(powershell(f.dir, 'Stop-Dateimanager.ps1', second));
    assert.equal(fs.readFileSync(path.join(f.dir, 'server-state.json'), 'utf8'), legacy);
    assert.ok(!fs.existsSync(path.join(f.dir, `server-state-${first}.json`)));
    assert.ok(!fs.existsSync(path.join(f.dir, `server-state-${second}.json`)));
  } finally {
    for (const port of owned) {
      const file = path.join(f.dir, `server-state-${port}.json`);
      if (fs.existsSync(file)) { await stopHttp(port, state(f.dir, port).token).catch(() => {}); await waitClosed(port); }
    }
    f.cleanup();
  }
});

test('Windows failed state persistence asks only the newly started server to stop itself', { skip: !windows }, async () => {
  const f = fixture(), port = await freePort();
  try {
    const script = path.join(f.dir, 'Start-Dateimanager.ps1').replace(/'/g, "''");
    const result = spawnSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `function Set-Content { throw 'Injected state-write failure' }; & '${script}' -Port ${port} -NoBrowser`], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Injected state-write failure/);
    await waitClosed(port);
    assert.ok(!fs.existsSync(path.join(f.dir, `server-state-${port}.json`)));
  } finally { f.cleanup(); }
});

test('launcher wrappers forward arguments and have no PID-based termination', () => {
  for (const name of ['Start', 'Stop']) {
    assert.match(fs.readFileSync(path.join(web, `${name}-Dateimanager.cmd`), 'utf8'), /%\*/);
    const source = fs.readFileSync(path.join(web, `${name}-Dateimanager.ps1`), 'utf8');
    assert.doesNotMatch(source, /Stop-Process|taskkill|Get-CimInstance|Win32_Process/i);
    assert.match(source, /server-state-\$Port\.json/);
  }
  assert.match(fs.readFileSync(path.join(web, 'Start-Dateimanager.ps1'), 'utf8'), /Start-Process[^\n]+-WindowStyle Hidden/);
});
