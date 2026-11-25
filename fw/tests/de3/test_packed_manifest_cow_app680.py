"""Exercise atomic PFS publication for five operations on an empty and a nearly full flash."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

def main():
    tests = Path(__file__).resolve().parent
    fw = tests.parents[1]
    vfs = fw/'application/src/mod/vfs'
    lfs = fw/'components/littlefs'
    sources = [tests/'packed_manifest_cow_app680.c', tests/'packed_vfs_nor_de344.c',
               vfs/'packed_fs.c', lfs/'lfs.c', lfs/'lfs_util.c']
    with tempfile.TemporaryDirectory() as directory:
        binary = Path(directory)/'test'
        flags = ['-O1','-std=c99','-g','-Wall','-Wextra','-Wno-sign-compare','-Werror',
                 '-DLFS_NO_ASSERT','-DLFS_NO_WARN','-DLFS_NO_DEBUG','-DLFS_NO_ERROR','-DLFS_NO_MALLOC']
        sanitized = os.environ.get('PIXL_SANITIZE') == '1'
        if sanitized:
            flags += ['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-pie','-no-pie']
        subprocess.run(['gcc',*flags,'-I'+str(vfs),'-I'+str(lfs),'-I'+str(tests),
                        *map(str,sources),'-o',str(binary)],check=True)
        run = subprocess.run([str(binary)], stdout=subprocess.PIPE,text=True,check=True,timeout=180)
        rows = [json.loads(line) for line in run.stdout.splitlines()]
        cases = sum(r['old'] + r['new'] for r in rows if 'old' in r)
        assert len(rows)==11 and cases and rows[-1]['outOfSpaceCases']==5
        report = {'test':'App680 manifest atomicity','sanitized':sanitized,'deviceAccess':False,
                  'interruptedCases':cases,'noSpaceCases':rows[-1]['outOfSpaceCases'],'rows':rows}
        print(json.dumps(report))

if __name__ == '__main__':
    main()
