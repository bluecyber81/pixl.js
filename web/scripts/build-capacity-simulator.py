"""Reproduce the pinned RAM-only WASM using clang 23.1.4; never deploy it."""
from pathlib import Path
import argparse,datetime,hashlib,json,subprocess
WEB=Path(__file__).resolve().parents[1]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--clang',default='clang');p.add_argument('--profile',choices=['current','legacy'],default='current');args=p.parse_args()
SOURCE=WEB/('third-party/packed-simulator-current' if args.profile=='current' else 'third-party/packed-simulator')
binding=json.loads((SOURCE/'SOURCE_BINDING.json').read_bytes())
for name,digest in binding['sourceFiles'].items():assert sha(SOURCE/name)==digest,name
version=subprocess.check_output([args.clang,'--version'],text=True)
assert 'clang version 23.1.4' in version,version
out=WEB/'test-results'/('capacity-rebuild-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S'))
out.mkdir(parents=True,exist_ok=False)
wasm_name='lfs-capacity-current.wasm' if args.profile=='current' else 'lfs-capacity.wasm'
cmd=[args.clang,'--target=wasm32','-O2','-g0','-nostdlib','-ffreestanding','-fno-builtin',
     *('-D'+name for name in binding['defines']),'-I'+str(SOURCE/'sim/freestanding'),'-I'+str(SOURCE/'core'),'-I'+str(SOURCE/'littlefs'),'-I'+str(SOURCE/'sim'),
     str(SOURCE/'sim/capacity_simulator.c'),str(SOURCE/'sim/minilib.c'),str(SOURCE/'core/packed_fs.c'),str(SOURCE/'littlefs/lfs.c'),str(SOURCE/'littlefs/lfs_util.c'),
     '-Wl,--no-entry','-Wl,--export-memory','-Wl,-z,stack-size=1048576','-Wl,--initial-memory=8388608','-Wl,--max-memory=8388608',
     *('-Wl,--export='+name for name in binding['exports']),'-o',str(out/wasm_name)]
r=subprocess.run(cmd,text=True,capture_output=True,timeout=120)
(out/'build.log').write_text(r.stdout+r.stderr,encoding='utf-8')
assert r.returncode==0,r.stderr
digest=sha(out/wasm_name)
assert digest==binding['wasmSha256'],('Different compiler output; do not deploy',digest)
assert all(sha(SOURCE/name)==value for name,value in binding['sourceFiles'].items())
print(json.dumps({'reproduced':True,'wasmSha256':digest,'output':str(out/wasm_name)}))
