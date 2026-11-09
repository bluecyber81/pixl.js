"""Real favorite scenes, headers and TLSF; synthetic listing/peripheral I/O."""
from pathlib import Path
from packed_crc_source import packed_type_prefix
import argparse,hashlib,json,os,re,subprocess,tempfile
from test_amiidb_navigation_memory import extract
FW=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
def run(fw,baseline=False,arm=False,sanitize=False):
 with tempfile.TemporaryDirectory(prefix='pixl-favorites-memory-') as td:
  td=Path(td);(td/'boards.h').write_text('');(td/'bsp.h').write_text('typedef unsigned bsp_event_t;\n')
  src=fw/'application/src';lst=(src/'mui/view/mui_list_view.c').read_text()
  browser=(src/'app/amiidb/scene/amiidb_scene_fav_list.c').read_text()
  detail=(src/'app/amiidb/scene/amiidb_scene_fav_select.c').read_text()
  bodies='\n'.join(extract(lst,f) for f in ['mui_list_view_item_size','mui_list_view_try_add_item_ext','mui_list_view_add_item_ext','mui_list_view_add_item','mui_list_view_clear_items','mui_list_view_clear_items_with_cb','mui_list_view_set_focus','mui_list_view_get_focus','mui_list_view_sort','mui_list_view_set_selected_cb','mui_list_view_set_user_data'])
  ds=re.sub(r'^#include[^\n]*\n','',detail,flags=re.M)
  packed=packed_type_prefix((src/'mod/vfs/packed_fs.c').read_text())
  files=[src/'app/amiidb/app_amiidb.h',src/'app/amiidb/scene/amiidb_scene_fav_list.c',src/'app/amiidb/scene/amiidb_scene_fav_select.c',src/'mui/view/mui_list_view.c',src/'mui/mui_mem.c',src/'mod/vfs/packed_fs.c',fw/'components/tlsf/tlsf.c']
  if not baseline:files.append(src/'app/amiidb/scene/amiidb_fav_page.h')
  before={str(p.relative_to(fw)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
  text=(HERE/'favorites_navigation_memory_host.c.in').read_text().replace('@LIST@',bodies).replace('@BROWSER@',re.sub(r'^#include[^\n]*\n','',browser,flags=re.M)).replace('@DETAIL@',ds).replace('@PACKED@',packed)
  text=text.replace('@READ_ID@',extract((src/'amiibo_helper.c').read_text(),'to_little_endian_int32'))
  c=td/'probe.c';c.write_text(text,encoding='utf-8',newline='\n');exe=td/'probe.exe'
  inc=[td,src,src/'mui',src/'mui/view',src/'core',src/'mod',src/'mod/vfs',src/'ntag',src/'app/amiidb',src/'app/amiidb/api',src/'app/amiidb/view',src/'app/amiidb/scene',src/'amiidb',src/'i18n',fw/'components/mlib',fw/'components/u8g2/csrc',fw/'components/tlsf',fw/'components/littlefs']
  cmd=['gcc','-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-Wno-unused-function','-Wno-unused-parameter','-Wno-unused-variable','-Wno-type-limits','-Wno-comment','-Wno-unused-value','-Wno-sign-compare','-Wno-missing-field-initializers','-Wno-pointer-to-int-cast','-Wno-pointer-sign','-DTEST_BASELINE='+str(int(baseline))]
  if sanitize:cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
  for d in inc:cmd+=['-I',str(d)]
  cmd += [str(c),str(fw/'components/tlsf/tlsf.c'),str(src/'i18n/de_DE.c'),'-o',str(exe)]
  def lp(v):v=str(v).replace('\\','/');return '/mnt/'+v[0].lower()+v[2:] if len(v)>2 and v[1]==':' else v
  if arm:cmd=['wsl','-d','Ubuntu-24.04-Codex-New','--','arm-linux-gnueabihf-gcc']+[lp(v) for v in cmd[1:]]
  r=subprocess.run(cmd,capture_output=True,text=True,timeout=120);assert r.returncode==0,r.stdout+r.stderr
  cmd=['wsl','-d','Ubuntu-24.04-Codex-New','--','qemu-arm','-L','/usr/arm-linux-gnueabihf',lp(exe)] if arm else [str(exe)]
  r=subprocess.run(cmd,capture_output=True,text=True,timeout=240);print(r.stdout);assert r.returncode==0,r.stdout+r.stderr
  assert before=={str(p.relative_to(fw)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
  return {'baseline':baseline,'source_sha256':before,'sources_unchanged':True,'stdout':r.stdout,'returncode':r.returncode}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path);p.add_argument('--baseline-only',action='store_true');p.add_argument('--report',type=Path);p.add_argument('--arm32',action='store_true');p.add_argument('--sanitize',action='store_true');a=p.parse_args()
 runs=[] if a.baseline_only else [run(FW,arm=a.arm32,sanitize=a.sanitize)]
 if a.baseline:runs.append(run(a.baseline.resolve(),baseline=True,arm=a.arm32,sanitize=a.sanitize))
 report={'passed':True,'device_access':False,'arm32':a.arm32,'sanitize':a.sanitize,'runs':runs,'test_sha256':{x.name:hashlib.sha256(x.read_bytes()).hexdigest() for x in [Path(__file__),HERE/'favorites_navigation_memory_host.c.in']},'limits':['Real favorites scenes and Mlib/TLSF with actual headers; synthetic list callback and peripheral stubs.','Actual header sizes reserve application/UI/packed/event objects; not a whole-device heap trace or NFC/flash timing test.']}
 if a.report:a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
