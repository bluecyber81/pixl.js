"""Real catalog/UI loaders and Mlib/TLSF under bounded heap pressure; no hardware."""
from pathlib import Path
import argparse,hashlib,json,os,re,subprocess,tempfile
FW=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent

def extract(t,name):
 m=re.search(r'^[\w *]+\b'+name+r'\([^;]*?\)\s*\{',t,re.M)
 if not m:raise ValueError(name)
 a=m.start();b=t.index('{',a);depth=1;i=b+1
 while depth:depth+=(t[i]=='{')-(t[i]=='}');i+=1
 return t[a:i]

def main():
 p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path);p.add_argument('--report',type=Path);p.add_argument('--arm32',action='store_true');p.add_argument('--sanitize',action='store_true');a=p.parse_args()
 report={'device_access':False,'arm32':a.arm32,'sanitize':a.sanitize,'runs':[]}
 with tempfile.TemporaryDirectory(prefix='pixl-db-nav-') as td:
  td=Path(td);(td/'boards.h').write_text('');(td/'bsp.h').write_text('typedef unsigned bsp_event_t;\n')
  for name,fw in [('candidate',FW)]+([('baseline',a.baseline.resolve())] if a.baseline else []):
   src=fw/'application/src';lst=(src/'mui/view/mui_list_view.c').read_text();game=(src/'app/amiidb/scene/amiidb_scene_game_list.c').read_text();search=(src/'app/amiidb/scene/amiidb_scene_amiibo_search.c').read_text()
   bodies='\n'.join(extract(lst,f) for f in ['mui_list_view_try_add_item_ext','mui_list_view_add_item','mui_list_view_add_item_ext','mui_list_view_clear_items','mui_list_view_set_focus','mui_list_view_get_focus','mui_list_view_sort','mui_list_view_set_selected_cb','mui_list_view_set_user_data'])
   packed=(src/'mod/vfs/packed_fs.c').read_text();packed=packed[:packed.index('static uint32_t crc(')]
   sources=[src/'app/amiidb/api/amiidb_api_db.c',src/'app/amiidb/api/amiidb_api_db.h',src/'app/amiidb/app_amiidb.h',src/'app/amiidb/scene/amiidb_scene_game_list.c',src/'app/amiidb/scene/amiidb_scene_amiibo_search.c',src/'mui/view/mui_list_view.c',src/'mui/mui_alloc.h',src/'mui/mui_mem.c',src/'mod/vfs/packed_fs.c',src/'amiidb/db_game.c',src/'amiidb/db_amiibo.c',src/'amiidb/db_link.c',fw/'components/tlsf/tlsf.c']
   source_hashes={str(x.relative_to(fw)):hashlib.sha256(x.read_bytes()).hexdigest() for x in sources}
   code=(HERE/'amiidb_navigation_memory_host.c.in').read_text().replace('@LIST@',bodies).replace('@GAME@',re.sub(r'^#include[^\n]*\n','',game,flags=re.M)).replace('@SEARCH@',re.sub(r'^#include[^\n]*\n','',search,flags=re.M)).replace('@PACKED@',packed)
   path=td/(name+'.c');path.write_text(code,encoding='utf-8',newline='\n');exe=td/(name+'.exe')
   inc=[td,src,src/'mui',src/'mui/view',src/'core',src/'mod',src/'mod/vfs',src/'ntag',src/'app/amiidb',src/'app/amiidb/api',src/'app/amiidb/view',src/'app/amiidb/scene',src/'app/amiibo',src/'app/amiibo/view',src/'amiidb',src/'i18n',fw/'components/mlib',fw/'components/u8g2/csrc',fw/'components/tlsf',fw/'components/littlefs']
   cmd=['gcc','-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-Wno-unused-function','-Wno-unused-parameter','-Wno-type-limits','-Wno-comment','-Wno-unused-value','-Wno-sign-compare','-Wno-missing-field-initializers','-Wno-pointer-to-int-cast','-DTEST_BASELINE='+str(int(name=='baseline'))]
   if a.sanitize or os.environ.get('PIXL_SANITIZE')=='1':cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
   for d in inc:cmd+=['-I',str(d)]
   cmd += [str(path),str(fw/'components/tlsf/tlsf.c'),str(src/'i18n/de_DE.c'),'-o',str(exe)]
   def lp(v):v=str(v).replace('\\','/');return '/mnt/'+v[0].lower()+v[2:] if len(v)>2 and v[1]==':' else v
   if a.arm32:cmd=['wsl','-d','Ubuntu-24.04-Codex-New','--','arm-linux-gnueabihf-gcc']+[lp(v) for v in cmd[1:]]
   r=subprocess.run(cmd,capture_output=True,text=True,timeout=120);assert r.returncode==0,r.stdout+r.stderr
   run=['wsl','-d','Ubuntu-24.04-Codex-New','--','qemu-arm','-L','/usr/arm-linux-gnueabihf',lp(exe)] if a.arm32 else [str(exe)]
   if a.arm32:run+=['quick']
   r=subprocess.run(run,capture_output=True,text=True,timeout=240);print(name,r.stdout);assert r.returncode==0,r.stdout+r.stderr
   assert source_hashes == {str(x.relative_to(fw)):hashlib.sha256(x.read_bytes()).hexdigest() for x in sources}, 'sources changed during test'
   report['runs'].append({'variant':name,'stdout':r.stdout,'returncode':r.returncode,'sources_sha256':source_hashes,'sources_unchanged':True})
 report['test_sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),HERE/'amiidb_navigation_memory_host.c.in']};report['passed']=True;report['limits']=['Actual UI loader/list/API functions and catalog with real Mlib/TLSF. Peripheral scene/display/input operations are stubs.','App constructor allocations are reserved at actual header sizes; packed state and event queue are synthetic resident reservations, not a live whole-firmware heap trace.','ARM32 QEMU validates pointer/size layouts but is not Cortex-M4 timing, hardware NFC or stack-watermark proof.']
 if a.report:a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8',newline='\n')
if __name__=='__main__':main()
