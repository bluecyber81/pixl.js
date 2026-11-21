"""Reproduce only the App670 WASM with the exact official WASI SDK 34 toolchain."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys

WEB = Path(__file__).resolve().parents[1]
SOURCE = WEB / 'third-party/packed-simulator-de397'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sdk', type=Path, required=True, help='extracted official wasi-sdk-34.0-x86_64-linux directory')
parser.add_argument('--output', type=Path, required=True, help='new evidence directory')
args = parser.parse_args()
binding = json.loads((SOURCE / 'SOURCE_BINDING.json').read_text())
identity = json.loads((SOURCE / 'ENGINE_IDENTITY.json').read_text())
assert binding['engineSha256'] == identity['engineSha256']
assert hashlib.sha256(json.dumps(identity['manifest'], sort_keys=True, separators=(',', ':')).encode()).hexdigest() == identity['engineSha256']
assert all(sha(SOURCE / name) == value for name, value in binding['sourceFiles'].items()), 'source binding changed'
for name, value in identity['manifest']['files'].items():
    assert binding['sourceFiles'][('core/' if name.startswith('packed_') else 'littlefs/') + name] == value
compiler = args.sdk.resolve() / 'bin/clang'
linker = args.sdk.resolve() / 'bin/wasm-ld'
pin = binding['toolchain']
assert sha(compiler) == pin['clangSha256'], 'unqualified compiler binary'
assert sha(linker) == pin['linkerSha256'], 'unqualified linker binary'
assert subprocess.check_output([compiler, '--version'], text=True).splitlines()[0] == binding['compiler']
assert subprocess.check_output([linker, '--version'], text=True).strip() == pin['linkerVersion']
assert pin['noDefaultConfig'] is True
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=False)
wasm = out / 'lfs-capacity-de397.wasm'
cmd = [str(compiler), '--no-default-config', '--target=wasm32', '-O2', '-g0', '-nostdlib', '-ffreestanding', '-fno-builtin',
       *('-D' + name for name in binding['defines']),
       *('-I' + str(SOURCE / name) for name in ['sim/freestanding', 'core', 'littlefs', 'sim']),
       *(str(SOURCE / name) for name in ['sim/capacity_simulator.c', 'sim/minilib.c', 'core/packed_fs.c', 'littlefs/lfs.c', 'littlefs/lfs_util.c']),
       '-Wl,--no-entry', '-Wl,--export-memory', '-Wl,-z,stack-size=1048576', '-Wl,--initial-memory=8388608', '-Wl,--max-memory=8388608',
       *('-Wl,--export=' + name for name in binding['exports']), '-o', str(wasm)]
result = subprocess.run(cmd, text=True, capture_output=True, timeout=120)
(out / 'build.log').write_text(result.stdout + result.stderr)
assert result.returncode == 0, result.stderr
assert sha(wasm) == binding['wasmSha256'], 'different compiler output; do not distribute'
assert sha(WEB / 'public/lfs-capacity-de397.wasm') == sha(wasm), 'shipped binary differs'
assert all(sha(SOURCE / name) == value for name, value in binding['sourceFiles'].items()), 'sources changed during build'
report = dict(reproduced=True, profile='de397', engineSha256=identity['engineSha256'], wasmSha256=sha(wasm), bytes=wasm.stat().st_size,
              compiler=binding['compiler'], toolchain=pin, command=cmd, sourceFiles=binding['sourceFiles'], output=str(wasm))
(out / 'REPRODUCIBLE_WASM.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(reproduced=True, wasmSha256=sha(wasm), bytes=wasm.stat().st_size, output=str(wasm))))
