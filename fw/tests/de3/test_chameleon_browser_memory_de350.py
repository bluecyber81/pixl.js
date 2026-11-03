"""Actual card import browser C, Mlib/TLSF and bounded VFS outcomes."""
from pathlib import Path
from packed_crc_source import packed_type_prefix
import argparse, hashlib, json, os, re, subprocess, tempfile
from test_amiidb_navigation_memory import extract

FW=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent

def run(fw, baseline=False, arm=False, sanitize=False):
    with tempfile.TemporaryDirectory(prefix='pixl-card-browser-') as td:
        td=Path(td)
        (td/'boards.h').write_text('')
        (td/'bsp.h').write_text('typedef unsigned bsp_event_t;\n')
        (td/'app_timer.h').write_text('typedef void *app_timer_id_t;\n')
        src=fw/'application/src'
        list_source=src/'mui/view/mui_list_view.c'
        browser=src/'app/chameleon/scene/chameleon_scene_menu_card_data_file_load.c'
        headers=[src/'app/chameleon/app_chameleon.h',src/'mui/mui_mem.c',src/'mui/mui_alloc.h',
                 src/'mod/vfs/packed_fs.c',fw/'components/tlsf/tlsf.c']
        inputs=[list_source,browser,*headers]
        before={str(p.relative_to(fw)):hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
        bodies='\n'.join(extract(list_source.read_text(),f) for f in [
            'mui_list_view_try_add_item_ext','mui_list_view_add_item_ext','mui_list_view_add_item',
            'mui_list_view_clear_items','mui_list_view_set_focus','mui_list_view_sort','mui_list_view_set_selected_cb'])
        packed=packed_type_prefix((src/'mod/vfs/packed_fs.c').read_text())
        text=(HERE/'chameleon_browser_memory_de350.c.in').read_text().replace('@LIST@',bodies).replace(
             '@BROWSER@',re.sub(r'^#include[^\n]*\n','',browser.read_text(),flags=re.M)).replace('@PACKED@',packed)
        c=td/'probe.c';c.write_text(text,encoding='utf-8',newline='\n');exe=td/'probe.exe'
        inc=[td,src,src/'mui',src/'mui/view',src/'core',src/'mod',src/'mod/vfs',src/'ntag',
             src/'app/chameleon',src/'app/chameleon/view',src/'amiidb',src/'i18n',fw/'components/mlib',
             fw/'components/u8g2/csrc',fw/'components/tlsf',fw/'components/littlefs']
        cmd=['gcc','-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-Wno-unused-function',
             '-Wno-unused-parameter','-Wno-type-limits','-Wno-comment','-Wno-unused-value',
             '-Wno-sign-compare','-Wno-missing-field-initializers','-Wno-pointer-to-int-cast',
             '-Wno-pointer-sign','-DTEST_BASELINE='+str(int(baseline))]
        if sanitize:cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
        for d in inc:cmd+=['-I',str(d)]
        cmd += [str(c),str(fw/'components/tlsf/tlsf.c'),str(src/'i18n/de_DE.c'),'-o',str(exe)]
        def lp(v):
            v=str(v).replace('\\','/')
            return '/mnt/'+v[0].lower()+v[2:] if len(v)>2 and v[1]==':' else v
        if arm:cmd=['wsl','-d','Ubuntu-24.04-Codex-New','--','arm-linux-gnueabihf-gcc']+[lp(v) for v in cmd[1:]]
        elif sanitize and os.name=='nt':cmd=['wsl','-d','Ubuntu-24.04-Codex-New','--','gcc']+[lp(v) for v in cmd[1:]]
        r=subprocess.run(cmd,capture_output=True,text=True,timeout=120)
        assert r.returncode==0,r.stdout+r.stderr
        if arm:cmd=['wsl','-d','Ubuntu-24.04-Codex-New','--','qemu-arm','-L','/usr/arm-linux-gnueabihf',lp(exe)]
        elif sanitize and os.name=='nt':cmd=['wsl','-d','Ubuntu-24.04-Codex-New','--',lp(exe)]
        else:cmd=[str(exe)]
        r=subprocess.run(cmd,capture_output=True,text=True,timeout=240)
        print(r.stdout)
        assert r.returncode==0,r.stdout+r.stderr
        assert before=={str(p.relative_to(fw)):hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
        return dict(baseline=baseline,arm32=arm,sanitized=sanitize,source_sha256=before,sources_unchanged=True,stdout=r.stdout)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path);p.add_argument('--report',type=Path)
    p.add_argument('--arm32',action='store_true');p.add_argument('--sanitize',action='store_true');a=p.parse_args()
    runs=[run(FW,arm=a.arm32,sanitize=a.sanitize)]
    if a.baseline:runs.append(run(a.baseline.resolve(),baseline=True,arm=a.arm32,sanitize=a.sanitize))
    report=dict(passed=True,device_access=False,runs=runs,limits=[
        'Actual UI C/Mlib/TLSF and application/header sizes with deterministic VFS. Not a physical NFC or startup-speed test.',
        'ARM32 QEMU tests ABI and memory bounds; it is not Cortex-M4 timing.'])
    if a.report:a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n')
