"""Actual UI shrink/exit callbacks with real TLSF, exhausted heap and UTF8 oracles."""
from pathlib import Path
import argparse, hashlib, json, os, subprocess, tempfile
from test_amiidb_navigation_memory import extract

FW=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent

def run(fw, arm=False, sanitize=False, case='all'):
    src=fw/'application/src'
    text=src/'mui/view/mui_text_input.c'
    detail=src/'app/amiidb/scene/amiidb_scene_amiibo_detail.c'
    source=text.read_text()
    functions='\n'.join(extract(source,n) for n in ['mui_text_input_on_input',
        'mui_text_input_set_input_text','mui_text_input_set_max_length','mui_text_input_set_focus_key'])
    favorite='\n'.join(extract(detail.read_text(),n) for n in [
        'amiidb_scene_amiibo_detail_fav_list_read_cb','amiidb_scene_amiibo_fav_list_init',
        'amiidb_scene_amiibo_fav_list_update','amiidb_scene_amiibo_detail_on_exit'])
    tracked=[text,detail,src/'mui/view/mui_text_input.h',src/'app/amiidb/app_amiidb.h',
        src/'app/amiidb/api/amiidb_api_fav.h',src/'app/amiidb/view/amiibo_view.h',
        src/'mui/mui_mem.c',src/'mui/mui_conf.h',fw/'components/tlsf/tlsf.c',
        fw/'components/mlib/m-string.h',fw/'components/mlib/m-array.h']
    before={p.relative_to(fw).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in tracked}
    code=(HERE/'ui_temporary_allocations_host.c.in').read_text().replace('@KEYBOARD@',
        source[source.index('#define LIST_ITEM_HEIGHT'):source.index('static void mui_text_input_on_draw')]
        ).replace('@TEXT_FUNCTIONS@',functions).replace('@FAVORITE_FUNCTIONS@',favorite)
    with tempfile.TemporaryDirectory(prefix='pixl-ui-temporary-') as temp:
        td=Path(temp);(td/'boards.h').write_text('');(td/'bsp.h').write_text('typedef unsigned bsp_event_t;\n')
        c=td/'probe.c';c.write_text(code,encoding='utf-8',newline='\n');binary=td/'probe.exe'
        includes=[td,src,src/'mui',src/'mui/view',src/'core',src/'mod',src/'mod/vfs',src/'ntag',
            src/'app/amiidb',src/'app/amiidb/api',src/'app/amiidb/view',src/'app/amiidb/scene',
            src/'amiidb',src/'i18n',fw/'components/mlib',fw/'components/u8g2/csrc',fw/'components/tlsf']
        command=['gcc','-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-Wno-unused-function',
            '-Wno-unused-variable','-Wno-unused-parameter','-Wno-type-limits','-Wno-comment',
            '-Wno-unused-value','-Wno-sign-compare','-Wno-missing-field-initializers','-Wno-pointer-to-int-cast']
        if sanitize:command+=['-fsanitize=address,undefined','-fno-sanitize-recover=all',
            '-fno-omit-frame-pointer','-fno-pie','-no-pie']
        for inc in includes:command+=['-I',str(inc)]
        command += [str(c),str(fw/'components/tlsf/tlsf.c'),'-o',str(binary)]
        def lp(v):
            v=str(v).replace('\\','/');return '/mnt/'+v[0].lower()+v[2:] if len(v)>2 and v[1]==':' else v
        if arm:command=['wsl','-d','Ubuntu-24.04-Codex-New','--','arm-linux-gnueabihf-gcc']+[lp(v) for v in command[1:]]
        compiled=subprocess.run(command,capture_output=True,text=True,timeout=120)
        assert compiled.returncode==0,compiled.stdout+compiled.stderr
        command=['wsl','-d','Ubuntu-24.04-Codex-New','--','qemu-arm','-L','/usr/arm-linux-gnueabihf',lp(binary)] if arm else [str(binary)]
        if case!='all':command.append(case)
        ran=subprocess.run(command,capture_output=True,text=True,timeout=240)
        after={p.relative_to(fw).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in tracked}
        assert before==after,'UI sources changed during test'
        return {'passed':ran.returncode==0,'returncode':ran.returncode,'stdout':ran.stdout,'stderr':ran.stderr,
            'source_sha256':before,'source_sha256_after':after,'sources_unchanged':True}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--arm32',action='store_true');parser.add_argument('--sanitize',action='store_true')
    parser.add_argument('--source',type=Path,default=FW);parser.add_argument('--report',type=Path)
    parser.add_argument('--case',choices=['all','text','favorites'],default='all');a=parser.parse_args()
    result=run(a.source.resolve(),a.arm32,a.sanitize or os.environ.get('PIXL_SANITIZE')=='1',a.case)
    report={'passed':result['passed'],'device_access':False,'arm32':a.arm32,'sanitize':a.sanitize or os.environ.get('PIXL_SANITIZE')=='1',
        'case':a.case,'runs':[result],'test_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in
            [Path(__file__),HERE/'ui_temporary_allocations_host.c.in',HERE/'test_amiidb_navigation_memory.py']},
        'limits':['Real extracted UI and favorite callbacks, actual app/view layouts and Mlib/TLSF allocator.',
            'Filesystem listing, timer, NFC and rendering are stubs; no physical latency or RF claims.',
            'Finite heap exhaustion/ownership tests do not model arbitrary whole-device interrupt load.']}
    if a.report:
        a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(result['stdout']);print(result['stderr']);raise SystemExit(0 if report['passed'] else 1)
