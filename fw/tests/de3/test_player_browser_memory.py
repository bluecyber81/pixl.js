"""Actual Player callbacks with real Mlib/TLSF; synthetic VFS/UI, no device."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

FW=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent

def extract(text,signature):
    start=text.index(signature);opening=text.index('{',start);depth=1
    for i in range(opening+1,len(text)):
        depth+=(text[i]=='{')-(text[i]=='}')
        if not depth:return text[start:i+1]
    raise ValueError(signature)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline',type=Path)
    parser.add_argument('--sanitize',action='store_true')
    parser.add_argument('--report',type=Path)
    args=parser.parse_args()
    report={'device_access':False,'sanitize':args.sanitize,'cases':[],'passed':False}
    with tempfile.TemporaryDirectory(prefix='pixl-player-browser-') as td:
        temp=Path(td);(temp/'boards.h').write_text('')
        for name,fw in [('candidate',FW)]+([('baseline',args.baseline)] if args.baseline else []):
            src=fw/'application/src'
            source=src/'app/player/scene/player_scene_file_browser.c';text=source.read_text()
            report[name+'_source_sha256']=hashlib.sha256(source.read_bytes()).hexdigest()
            code=(HERE/'player_browser_memory_host.c.in').read_text()
            code=code.replace('@CALLBACK@',extract(text,'static void player_scene_file_browser_on_selected('))
            code=code.replace('@LOADER@',extract(text,'static void player_scene_file_browser_reload_folders('))
            path=temp/(name+'.c');path.write_text(code);exe=temp/(name+('.exe' if os.name=='nt' else ''))
            cmd=['gcc','-std=c11','-O1','-g','-Wno-pointer-to-int-cast','-I',str(temp),'-I',str(src/'mui'),
                 '-I',str(src/'mod/vfs'),'-I',str(fw/'components/mlib'),'-I',str(fw/'components/tlsf')]
            if args.sanitize or os.environ.get('PIXL_SANITIZE')=='1':
                cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
            subprocess.run(cmd+[str(path),str(fw/'components/tlsf/tlsf.c'),'-o',str(exe)],check=True,timeout=60)
            for mode in (['oom','io'] if name=='baseline' else ['all']):
                r=subprocess.run([str(exe),mode],capture_output=True,text=True,timeout=30)
                expected_failure=name=='baseline'
                assert (r.returncode!=0)==expected_failure,(name,mode,r.stdout,r.stderr)
                if name=='baseline':assert ('Cannot allocate' if mode=='oom' else 'Assertion') in r.stderr,r.stderr
                report['cases'].append({'variant':name,'mode':mode,'expected_failure':expected_failure,'returncode':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
                print(('PASS negative control '+mode if expected_failure else r.stdout.strip()))
    report['passed']=True
    report['limits']=['Synthetic heap pressure and VFS errors; not hardware watermark or storage fault proof.','Only selected path and directory-loader behavior, not all UI or Player timing.']
    if args.report:args.report.write_text(json.dumps(report,indent=2)+'\n')

if __name__=='__main__':main()
