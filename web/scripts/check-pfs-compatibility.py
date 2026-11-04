"""Read/write a synthetic PFS1 image with both exact DE354 and DE355 cores."""
from pathlib import Path
import argparse, hashlib, json, subprocess

WEB = Path(__file__).resolve().parents[1]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--gcc', default='gcc')
args = parser.parse_args()
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=False)
fixture = WEB/'tests/fixtures/capacity-collection-1208.json'
rows = read(fixture)
assert len(rows) == 1208 and sum(row['kind'] == 0 for row in rows) == 1131
rows.sort(key=lambda r: (-r['kind'],len(r['path'].split('/')),r['path']))
assert all(not any(x in r['path'] for x in '\t\r\n') and len(r['path'].encode('utf8'))<64 for r in rows)
(out/'synthetic-rows.tsv').write_text(''.join(f"{r['kind']} {r['size']}\t{r['path']}\t{r['rawMeta128Hex']}\n" for r in rows), encoding='utf8', newline='\n')
compiler = subprocess.check_output([args.gcc,'--version'],text=True)
profiles = {'old':'packed-simulator-current','new':'packed-simulator-de355'}
sources = {'harness':sha(WEB/'tests/fixtures/pfs-compat-host.c'),'fixture':sha(fixture)}
identities, builds = {}, []
for label, name in profiles.items():
    folder = WEB/'third-party'/name
    bound = read(folder/'SOURCE_BINDING.json')
    assert all(sha(folder/n) == v for n,v in bound['sourceFiles'].items())
    identities[label] = read(folder/'ENGINE_IDENTITY.json')
    for n,v in bound['sourceFiles'].items(): sources[name+'/'+n] = v
    command = [args.gcc,'-std=c11','-O2','-Wall','-Wextra','-Werror',
        *('-D'+name for name in bound['defines']),'-I'+str(folder/'core'),'-I'+str(folder/'littlefs'),
        str(WEB/'tests/fixtures/pfs-compat-host.c'),str(folder/'core/packed_fs.c'),
        str(folder/'littlefs/lfs.c'),str(folder/'littlefs/lfs_util.c'),'-o',str(out/(label+'.exe'))]
    result = subprocess.run(command,capture_output=True,text=True,timeout=120)
    log = out/(label+'-build.log');log.write_text(result.stdout+result.stderr,encoding='utf8')
    builds.append({'profile':label,'command':command,'exitCode':result.returncode,'log':log.name,'sha256':sha(log)})
    assert result.returncode == 0, result.stderr
assert identities['old']['manifest']['constants'] == identities['new']['manifest']['constants']
assert identities['old']['manifest']['format'] == identities['new']['manifest']['format'] == 'PFS1'
assert identities['old']['engineSha256'] != identities['new']['engineSha256']
cases=[]
image=out/'synthetic-disk.bin'
for label,action,phase in [('old','create',0),('new','verify',0),('new','modify',1),('old','verify',1),('old','modify',2),('new','verify',2)]:
    before=sha(image) if image.exists() else None
    command=[str(out/(label+'.exe')),action,str(out/'synthetic-rows.tsv'),str(image),str(phase)]
    result=subprocess.run(command,capture_output=True,text=True,timeout=180)
    log=out/f'{len(cases)+1}-{label}-{action}.log';log.write_text(result.stdout+result.stderr,encoding='utf8')
    assert result.returncode==0,result.stderr
    report=json.loads(result.stdout);assert report['passed'] is True
    after=sha(image)
    if action=='verify': assert before==after and report['readonly'] is True and report['programs']==report['erases']==0
    else: assert before!=after and report['programs']>0
    cases.append({'engine':label,'action':action,'phase':phase,'command':command,'exitCode':result.returncode,
                  'log':log.name,'logSha256':sha(log),'imageBeforeSha256':before,'imageAfterSha256':after,'result':report})
after_sources = {'harness':sha(WEB/'tests/fixtures/pfs-compat-host.c'),'fixture':sha(fixture)}
for label,name in profiles.items():
    folder=WEB/'third-party'/name
    after_sources.update({name+'/'+n:sha(folder/n) for n in read(folder/'SOURCE_BINDING.json')['sourceFiles']})
assert after_sources==sources
report={'schema':1,'version':'3.36.0','passed':True,'deviceAccess':False,'syntheticDataOnly':True,
    'compiler':compiler,'format':'PFS1','layoutConstantsUnchanged':True,
    'engines':{k:v['engineSha256'] for k,v in identities.items()},'sourcesBefore':sources,'sourcesAfter':after_sources,
    'builds':builds,'cases':cases,'filesInitially':1131,'directoriesInitially':77,
    'verification':'Every active path, kind, size, content byte, raw128 byte, import identity and complete namespace at each phase, including remount.',
    'mutations':['replace existing content and raw128','rename existing file','remove existing file','add8193-byte file','add empty file','old-engine replacement after new-engine writes'],
    'limits':['Host synthetic flash only. Not a device readback, timing benchmark or proof against every power interruption.',
              'Read-only stages perform no flash programming/erase. Writable phases exercise normal APIs and GC, not injected flash failures.']}
(out/'PFS_CROSS_VERSION.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps({'passed':True,'cases':len(cases),'report':str(out/'PFS_CROSS_VERSION.json')}))
