"""Real emulator browser/neighbor C + headers + TLSF; synthetic VFS only."""
from pathlib import Path
from packed_crc_source import packed_type_prefix
import argparse,hashlib,json,os,re,subprocess,tempfile
from test_amiidb_navigation_memory import extract
FW=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
def run(fw,baseline=False,arm=False,sanitize=False):
 with tempfile.TemporaryDirectory(prefix='pixl-emu-memory-') as td:
  td=Path(td);(td/'boards.h').write_text('');(td/'bsp.h').write_text('typedef unsigned bsp_event_t;\n')
  src=fw/'application/src';lst=(src/'mui/view/mui_list_view.c').read_text();browser=(src/'app/amiibo/scene/amiibo_scene_file_browser.c').read_text();detail=(src/'app/amiibo/scene/amiibo_scene_amiibo_detail.c').read_text()
  bodies='\n'.join(extract(lst,f) for f in ['mui_list_view_try_add_item_ext','mui_list_view_clear_items','mui_list_view_set_focus','mui_list_view_get_focus','mui_list_view_sort','mui_list_view_set_selected_cb','mui_list_view_set_user_data'])
  names=['amiibo_scene_amiibo_detail_list_item_cmp'] if baseline else ['app_amiibo_file_neighbor']
  names+=['amiibo_scene_amiibo_detail_reload_files']
  ds='\n'.join(extract(detail,f) for f in names)
  packed=packed_type_prefix((src/'mod/vfs/packed_fs.c').read_text())
  files=[src/'app/amiibo/app_amiibo.h',src/'app/amiibo/app_amiibo.c',src/'app/amiibo/scene/amiibo_scene_file_browser.c',src/'app/amiibo/scene/amiibo_scene_amiibo_detail.c',src/'app/amiibo/view/amiibo_detail_view.h',src/'mui/view/mui_list_view.c',src/'mui/mui_mem.c',src/'mod/cache.h',src/'mod/vfs/packed_fs.c',fw/'components/tlsf/tlsf.c',fw/'components/cwalk/src/cwalk.c',fw/'components/cwalk/include/cwalk.h']
  before={str(p.relative_to(fw)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
  cache='' if baseline else '\n'.join(extract((src/'app/amiibo/app_amiibo.c').read_text(),f) for f in ['app_amiibo_restore_browser_cache','app_amiibo_save_browser_cache'])
  text=(HERE/'amiibo_navigation_memory_host.c.in').read_text().replace('@LIST@',bodies).replace('@BROWSER@',re.sub(r'^#include[^\n]*\n','',browser,flags=re.M)).replace('@DETAIL@',ds).replace('@PACKED@',packed).replace('@CACHE@',cache)
  c=td/'probe.c';c.write_text(text,encoding='utf-8',newline='\n');exe=td/'probe.exe'
  inc=[td,src,src/'mui',src/'mui/view',src/'core',src/'mod',src/'mod/vfs',src/'ntag',src/'app/amiibo',src/'app/amiibo/view',src/'app/amiibo/scene',src/'amiidb',src/'i18n',fw/'components/mlib',fw/'components/u8g2/csrc',fw/'components/tlsf',fw/'components/littlefs',fw/'components/cwalk/include']
  cmd=['gcc','-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-Wno-unused-function','-Wno-unused-parameter','-Wno-type-limits','-Wno-comment','-Wno-unused-value','-Wno-sign-compare','-Wno-missing-field-initializers','-Wno-pointer-to-int-cast','-Wno-pointer-sign','-DTEST_BASELINE='+str(int(baseline))]
  if sanitize:cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
  for d in inc:cmd+=['-I',str(d)]
  cmd += [str(c),str(fw/'components/tlsf/tlsf.c'),str(fw/'components/cwalk/src/cwalk.c'),str(src/'i18n/de_DE.c'),'-o',str(exe)]
  def lp(v):v=str(v).replace('\\','/');return '/mnt/'+v[0].lower()+v[2:] if len(v)>2 and v[1]==':' else v
  if arm:cmd=['wsl','-d','Ubuntu-24.04-Codex-New','--','arm-linux-gnueabihf-gcc']+[lp(v) for v in cmd[1:]]
  r=subprocess.run(cmd,capture_output=True,text=True,timeout=120);assert r.returncode==0,r.stdout+r.stderr
  cmd=['wsl','-d','Ubuntu-24.04-Codex-New','--','qemu-arm','-L','/usr/arm-linux-gnueabihf',lp(exe)] if arm else [str(exe)]
  r=subprocess.run(cmd,capture_output=True,text=True,timeout=240);print(r.stdout);assert r.returncode==0,r.stdout+r.stderr
  assert before=={str(p.relative_to(fw)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
  return {'baseline':baseline,'source_sha256':before,'sources_unchanged':True,'stdout':r.stdout,'returncode':r.returncode}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path);p.add_argument('--report',type=Path);p.add_argument('--arm32',action='store_true');p.add_argument('--sanitize',action='store_true');a=p.parse_args()
 runs=[run(FW,arm=a.arm32,sanitize=a.sanitize)]
 if a.baseline:runs.append(run(a.baseline.resolve(),baseline=True,arm=a.arm32,sanitize=a.sanitize))
 report={'passed':True,'device_access':False,'arm32':a.arm32,'sanitize':a.sanitize,'runs':runs,'test_sha256':{x.name:hashlib.sha256(x.read_bytes()).hexdigest() for x in [Path(__file__),HERE/'amiibo_navigation_memory_host.c.in']},'limits':['Real C browser/neighbor and Mlib/TLSF with real object sizes. Synthetic VFS and peripheral stubs.','Actual header sizes reserve application/UI/packed/event objects; not a whole-device heap trace or NFC/flash timing test.']}
 if a.report:a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
