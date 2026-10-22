"""Actual SPIFFS allocation/read-failure regression; synthetic NOR only."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shlex
import subprocess
import tempfile

HERE=Path(__file__).resolve().parent

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--fw',type=Path,default=HERE.parents[1])
    ap.add_argument('--baseline',type=Path)
    ap.add_argument('--report',type=Path)
    ap.add_argument('--cc',default=os.environ.get('CC','gcc'))
    ap.add_argument('--sanitize',action='store_true')
    args=ap.parse_args();fw=args.fw.resolve()
    if args.report and args.report.exists():raise RuntimeError('Keep existing report unchanged')
    report={'status':'running','device_access':False,'sanitizers':args.sanitize,'runs':[],
            'source_sha256':{str(p.relative_to(fw)):hashlib.sha256(p.read_bytes()).hexdigest()
                              for p in sorted((fw/'components/spiffs/src').glob('*')) if p.is_file()},
            'test_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest()
                          for p in (HERE/'spiffs_allocator_read_failure.c',Path(__file__))},
            'limits':['Synthetic NOR; no hardware/MTU/Tybalt root-cause claim.','Only the allocation callback read-error propagation is changed.']}
    def build(source,exe):
        cmd=shlex.split(args.cc)+['-std=c11','-O1','-g','-include','stdint.h',
             '-I',str(source/'application/src/mod/vfs'),'-I',str(source/'components/spiffs/src')]
        if args.sanitize:cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all',
                              '-fno-omit-frame-pointer','-fno-pie','-no-pie']
        cmd+=[str(HERE/'spiffs_allocator_read_failure.c')]
        cmd+=list(map(str,sorted((source/'components/spiffs/src').glob('*.c'))))
        subprocess.run(cmd+['-o',str(exe)],capture_output=True,text=True,check=True,timeout=90)
    def run(exe,argv,negative=False):
        result=subprocess.run([str(exe),*argv],capture_output=True,text=True,timeout=90)
        valid=(result.returncode==71 and 'result==FAULT' in result.stderr) if negative else (
          result.returncode==0 and 'PASS' in result.stdout and 'runtime error:' not in result.stderr and 'ERROR: AddressSanitizer' not in result.stderr)
        report['runs'].append({'negative_control':negative,'args':argv,'exit_code':result.returncode,
                              'stdout':result.stdout,'stderr':result.stderr,'expected_outcome_confirmed':valid})
    try:
        with tempfile.TemporaryDirectory(prefix='pixl-allocator-') as temp:
            exe=Path(temp)/('current.exe' if os.name=='nt' else 'current');build(fw,exe);run(exe,[])
            if args.baseline:
                old=args.baseline.resolve();report['baseline_nucleus_sha256']=hashlib.sha256((old/'components/spiffs/src/spiffs_nucleus.c').read_bytes()).hexdigest()
                exe=Path(temp)/('old.exe' if os.name=='nt' else 'old');build(old,exe)
                for op in ('allocator','new','same'):run(exe,[op,'0','negative'],True)
        report['status']='passed' if all(x['expected_outcome_confirmed'] for x in report['runs']) else 'failed'
    except Exception as exc:report.update(status='failed',error=str(exc))
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        with args.report.open('x',encoding='utf-8') as stream:json.dump(report,stream,indent=2);stream.write('\n')
    print(json.dumps(report,indent=2) if not args.report else json.dumps({'status':report['status'],'report':str(args.report)}))
    return 0 if report['status']=='passed' else 1

if __name__=='__main__':raise SystemExit(main())
