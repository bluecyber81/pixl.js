"""Real Cards UI/Mlib/TLSF: bounded cache, revisions, failures and IO counts.

VFS revision and external entries are deterministic host adapters. Actual
production revision/mutation plumbing is independently covered by core tests.
"""
from pathlib import Path
from packed_crc_source import packed_type_prefix
import argparse,hashlib,json,os,re,subprocess,tempfile
from test_amiidb_navigation_memory import extract
HERE=Path(__file__).resolve().parent
FW=HERE.parents[1]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def lp(v):
 v=str(v).replace('\\','/')
 return '/mnt/'+v[0].lower()+v[2:] if len(v)>2 and v[1]==':' else v
def run(fw,cache,kind):
 with tempfile.TemporaryDirectory(prefix='pixl-card-cache-') as td:
  td=Path(td);src=fw/'application/src';ls=src/'mui/view/mui_list_view.c';browser=src/'app/chameleon/scene/chameleon_scene_menu_card_data_file_load.c'
  inputs=[ls,browser,src/'app/chameleon/app_chameleon.h',src/'mui/mui_mem.c',src/'mui/mui_alloc.h',src/'mod/vfs/packed_fs.c',fw/'components/tlsf/tlsf.c']
  before={str(p.relative_to(fw)):sha(p) for p in inputs}
  (td/'boards.h').write_text('#define VFS_PACKED_LFS_ENABLE 1\n' if cache else '')
  (td/'bsp.h').write_text('typedef unsigned bsp_event_t;\n');(td/'app_timer.h').write_text('typedef void*app_timer_id_t;\n')
  bodies='\n'.join(extract(ls.read_text(),f) for f in ['mui_list_view_try_add_item_ext','mui_list_view_add_item_ext','mui_list_view_add_item','mui_list_view_clear_items','mui_list_view_set_focus','mui_list_view_sort','mui_list_view_set_selected_cb'])
  text=(HERE/'chameleon_browser_memory_de350.c.in').read_text().split('int main(void){')[0]
  text=text.replace('static unsigned count,iter,fail_read,read_size;','static unsigned count,iter,fail_read,read_size;\nstatic uint64_t revision=1;static unsigned mutate_after,min_free;\nstatic void observe_memory(void){mui_mem_monitor_t m;mui_mem_monitor(&m);if(m.free_size<min_free)min_free=m.free_size;}')
  text=text.replace('reads++;if(fail_read','observe_memory();reads++;if(mutate_after&&iter==mutate_after){revision++;mutate_after=0;}if(fail_read')
  text=text.replace('(void)p;memset(out,0x31,n);','(void)p;observe_memory();memset(out,0x31,n);')
  text=text.replace('static unsigned checkpage(app_chameleon_t*a,unsigned offset){','static unsigned checkpage(app_chameleon_t*a,unsigned offset){observe_memory();')
  text=text.replace('vfs_driver_t*vfs_get_default_driver(void){return &driver;}','vfs_driver_t*vfs_get_default_driver(void){return &driver;}\nvfs_driver_t*vfs_get_driver(vfs_drive_t d){return d==VFS_DRIVE_EXT?&driver:NULL;}\nuint64_t vfs_packed_revision(void){return revision;}')
  text=text.replace('mui_mem_init();oom=', 'mui_mem_init();revision=1;mutate_after=0;min_free=UINT32_MAX;oom=')
  text=text.replace('static void end(app_chameleon_t*a){mui_list_view_clear_items(a->p_list_view);','static void end(app_chameleon_t*a){chameleon_scene_menu_card_data_file_load_on_exit(a);')
  text=text.replace('make(24,false);chameleon_scene_menu_card_data_file_load_reload(a);','make(24,false);revision++;chameleon_scene_menu_card_data_file_load_reload(a);')
  text=text.replace('@LIST@',bodies).replace('@BROWSER@',re.sub(r'^#include[^\n]*\n','',browser.read_text(),flags=re.M)).replace('@PACKED@',packed_type_prefix((src/'mod/vfs/packed_fs.c').read_text()))
  text+=(HERE/'chameleon_browser_cache_de351.c.in').read_text()
  c=td/'probe.c';c.write_text(text,encoding='utf-8',newline='\n');exe=td/'probe.exe'
  inc=[td,src,src/'mui',src/'mui/view',src/'core',src/'mod',src/'mod/vfs',src/'ntag',src/'app/chameleon',src/'app/chameleon/view',src/'amiidb',src/'i18n',fw/'components/mlib',fw/'components/u8g2/csrc',fw/'components/tlsf',fw/'components/littlefs']
  cmd=['gcc','-std=c11','-O1','-g','-fshort-enums','-Wall','-Wextra','-Werror','-Wno-unused-function','-Wno-unused-parameter','-Wno-type-limits','-Wno-comment','-Wno-unused-value','-Wno-sign-compare','-Wno-missing-field-initializers','-Wno-pointer-to-int-cast','-Wno-pointer-sign','-DTEST_BASELINE=0','-DTEST_CACHE='+str(int(cache))]
  if kind=='asan':cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
  for d in inc:cmd+=['-I',str(d)]
  cmd+=[str(c),str(fw/'components/tlsf/tlsf.c'),str(src/'i18n/de_DE.c'),'-o',str(exe)]
  if kind!='native':cmd=['wsl','-d','Ubuntu-24.04-Codex-New','--','arm-linux-gnueabihf-gcc' if kind=='arm32' else 'gcc']+[lp(v) for v in cmd[1:]]
  r=subprocess.run(cmd,capture_output=True,text=True,timeout=120);assert r.returncode==0,r.stdout+r.stderr
  cmd=[str(exe)] if kind=='native' else ['wsl','-d','Ubuntu-24.04-Codex-New','--']+(['qemu-arm','-L','/usr/arm-linux-gnueabihf'] if kind=='arm32' else [])+[lp(exe)]
  r=subprocess.run(cmd,capture_output=True,text=True,timeout=240);print(r.stdout,flush=True);assert r.returncode==0,r.stdout+r.stderr
  assert before=={p:sha(fw/p) for p in before}
  return dict(cache=cache,runtime=kind,source_sha256=before,sources_unchanged=True,stdout=r.stdout)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--baseline',type=Path);p.add_argument('--report',type=Path);p.add_argument('--arm32',action='store_true');p.add_argument('--sanitize',action='store_true');a=p.parse_args()
 kind='arm32' if a.arm32 else 'asan' if a.sanitize else 'native'
 runs=[run(FW,True,kind)]
 if a.baseline:runs.append(run(a.baseline.resolve(),False,kind))
 report=dict(passed=True,device_access=False,runs=runs,limits=['Actual C/Mlib/TLSF with deterministic VFS+revision adapter; no device timings.','Modeled surrounding objects use actual structure sizes, not a complete concurrent application trace.','Production revision API is independently tested by core/VFS tests.'])
 if a.report:a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n')
