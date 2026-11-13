"""App643 regression vectors against the actual candidate C restore helper.

The cache declaration, restore functions, VFS predicate and checked string
assignment are extracted from production. The reduced app/cache objects and
failed-assignment boundary are explicit host fixtures; this is not a device
wake/reset run. The 37 immutable synthetic vectors originate from the bounded
App643 ARM test, not from the implementation being checked here.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SRC = ROOT / "fw/application/src"


def function(text, name):
    match = re.search(r"^[A-Za-z_][^\n;{}]*\b" + re.escape(name) + r"\([^;{}]*?\)\s*\{", text, re.M)
    assert match, name
    end = text.index("{", match.start()) + 1
    depth = 1
    while depth:
        depth += (text[end] == "{") - (text[end] == "}")
        end += 1
    return text[match.start():end]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--sanitize", action="store_true")
    args = parser.parse_args()
    vectors = json.loads((HERE / "amiibo_retain_cases_de371.json").read_text())
    paths = [SRC / "app/amiibo/app_amiibo.c", SRC / "app/amiibo/app_amiibo.h",
             SRC / "mui/mui_alloc.h", SRC / "mod/vfs/vfs.c",
             ROOT / "fw/components/mlib/m-string.h", HERE / "amiibo_retain_cases_de371.json"]
    hashes = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    source, header, alloc, vfs = [p.read_text() for p in paths[:4]]
    cache = re.search(r"typedef struct \{[^}]*\} app_amiibo_cache_data_t;", header).group(0)
    actual_set = function(alloc, "mui_string_try_set_str").replace("mui_string_try_set_str", "actual_try_set_str", 1)
    declarations = r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include "m-string.h"
#define VFS_MAX_NAME_LEN 48
#define VFS_MAX_PATH_LEN 64
#define APP_AMIIBO_CACHE_PAGE_MAGIC 0x41333250u
typedef enum {VFS_DRIVE_INT,VFS_DRIVE_EXT,VFS_DRIVE_MAX} vfs_drive_t;
enum {AMIIBO_SCENE_FILE_BROWSER=0,AMIIBO_SCENE_AMIIBO_DETAIL=2};
typedef struct {uint8_t bytes[2178];} ntag_t;
typedef struct {
    vfs_drive_t current_drive;
    string_t current_folder, current_file;
    uint32_t current_focus_index;
    char browser_anchor[VFS_MAX_NAME_LEN];
    uint16_t browser_anchor_icon;
    int8_t browser_direction;
    bool reload_amiibo_files;
    ntag_t ntag;
} app_amiibo_t;
static struct {ntag_t ntag;} tag_cache;
static void *cache_get_data(void) { return &tag_cache; }
#define cache_get_data() (&tag_cache)
static const struct {bool enabled;} vfs_drive_items[VFS_DRIVE_MAX]={{false},{true}};
static void *mui_mem_malloc(size_t n) {return malloc(n);}
static unsigned assignments, fail_assignment;
'''
    wrapper = r'''
/* Failure is injected at the checked-assignment boundary. Native 64-bit Mlib
 * has a larger inline string buffer than the 32-bit firmware; a forced first
 * or second failure therefore must not depend on native allocation counts. */
static bool mui_string_try_set_str(m_string_ptr value, const char *text) {
    if (++assignments == fail_assignment) return false;
    return actual_try_set_str(value,text);
}
'''
    source_c = declarations + cache + "\n" + function(vfs, "vfs_drive_enabled") + "\n" + actual_set + wrapper
    source_c += "\n".join(function(source, n) for n in ["app_amiibo_restore_browser_cache", "app_amiibo_restore_cache"])
    source_c += r'''
_Static_assert(sizeof(app_amiibo_cache_data_t)==260,"Serialized cache changed");
_Static_assert(offsetof(app_amiibo_cache_data_t,current_folder)==2,"Folder ABI");
_Static_assert(offsetof(app_amiibo_cache_data_t,current_file)==130,"Filename ABI");
_Static_assert(offsetof(app_amiibo_cache_data_t,current_focus_index)==196,"Focus ABI");
_Static_assert(offsetof(app_amiibo_cache_data_t,current_scene_id)==200,"Scene ABI");
_Static_assert(offsetof(app_amiibo_cache_data_t,browser_magic)==204,"Tail ABI");
struct test_case {const char *name;uint8_t raw[260];bool ok,reset;unsigned fail;const char *folder,*file;unsigned reserve;};
static const struct test_case cases[]={
'''
    for case in vectors["cases"]:
        existing = case["existing_strings"] or {}
        row = [json.dumps(case["name"]), "{" + ",".join(str(x) for x in bytes.fromhex(case["raw_hex"])) + "}",
               str(int(case["expect_success"])), str(int(case["expect_tail_reset"])), str(case["fail_alloc"] or 0),
               json.dumps(existing.get("folder", "")), json.dumps(existing.get("file", "")), str(existing.get("extra_capacity", 0))]
        source_c += "{" + ",".join(row) + "},\n"
    source_c += r'''
};
static uint32_t read32(const uint8_t *p) {return (uint32_t)p[0]|(uint32_t)p[1]<<8|(uint32_t)p[2]<<16|(uint32_t)p[3]<<24;}
int main(void) {
 unsigned passed=0;
 for(size_t i=0;i<sizeof(tag_cache.ntag);i++)tag_cache.ntag.bytes[i]=(uint8_t)(i*37+11);
 for(unsigned c=0;c<sizeof(cases)/sizeof(*cases);c++)for(unsigned alignment=0;alignment<4;alignment++){
  const struct test_case *t=&cases[c];
  _Alignas(4) uint8_t protected_input[4+260+4];
  memset(protected_input,0xd9,sizeof(protected_input));
  uint8_t *retain=protected_input+alignment;
  memcpy(retain,t->raw,260);
  uint8_t before[sizeof(protected_input)];memcpy(before,protected_input,sizeof(before));
  app_amiibo_t app;memset(&app,0,sizeof(app));
  string_init(app.current_folder);string_init(app.current_file);
  string_set_str(app.current_folder,t->folder);string_set_str(app.current_file,t->file);
  if(t->reserve){string_reserve(app.current_folder,t->reserve+64);string_reserve(app.current_file,t->reserve+64);}
  app.current_drive=(vfs_drive_t)126;app.current_focus_index=0xcafebabe;
  memset(app.browser_anchor,0x5a,sizeof(app.browser_anchor));
  app.browser_anchor_icon=0x3456;app.browser_direction=0x12;app.reload_amiibo_files=true;
  memset(&app.ntag,0xa5,sizeof(app.ntag));
  assignments=0;fail_assignment=t->fail;
  bool ok=app_amiibo_restore_cache(&app,retain);
  if(ok!=t->ok){fprintf(stderr,"%s alignment%u return mismatch\n",t->name,alignment);return 1;}
  assert(!memcmp(before,protected_input,sizeof(before)));
  if(ok){
   assert(app.current_drive==t->raw[1]);
   assert(!strcmp(string_get_cstr(app.current_folder),(char*)t->raw+2));
   assert(!strcmp(string_get_cstr(app.current_file),(char*)t->raw+130));
   assert(app.reload_amiibo_files==(read32(t->raw+200)==2 && t->raw[130]));
   assert(!memcmp(&app.ntag,&tag_cache.ntag,sizeof(app.ntag)));
   if(t->reset){assert(app.current_focus_index==0 && app.browser_anchor_icon==0 && app.browser_direction==0);for(unsigned n=0;n<48;n++)assert(app.browser_anchor[n]==0);}
   else{assert(app.current_focus_index==read32(t->raw+196));assert(!memcmp(app.browser_anchor,t->raw+208,48));assert(app.browser_anchor_icon==((unsigned)t->raw[256]|(unsigned)t->raw[257]<<8));assert((uint8_t)app.browser_direction==t->raw[258]);}
  } else {
   assert(app.current_drive==126 && app.current_focus_index==0xcafebabe);
   assert(app.browser_anchor_icon==0x3456 && app.browser_direction==0x12 && app.reload_amiibo_files);
   for(unsigned n=0;n<48;n++)assert(app.browser_anchor[n]==0x5a);
   for(unsigned n=0;n<sizeof(app.ntag);n++)assert(app.ntag.bytes[n]==0xa5);
   if(t->fail==2)assert(!strcmp(string_get_cstr(app.current_folder),(char*)t->raw+2));
  }
  string_clear(app.current_folder);string_clear(app.current_file);
  passed++;
 }
 assert(!app_amiibo_restore_cache(NULL,NULL));
 printf("PASS %u cases: 37 App643 vectors at all four byte alignments; serialized ABI and read-only input; checked-string failure boundary\n",passed);
 return 0;
}
'''
    with tempfile.TemporaryDirectory(prefix="amiibo-retain-port-") as temp:
        output = args.output or Path(temp)
        output.mkdir(parents=True, exist_ok=True)
        cfile, binary = output / "retention_port.c", output / "retention_port"
        cfile.write_text(source_c)
        command = ["gcc", "-std=c11", "-O1", "-g", "-fshort-enums", "-Wall", "-Wextra", "-Werror",
                   "-Wno-unused-function", "-I", str(ROOT / "fw/components/mlib"), str(cfile), "-o", str(binary)]
        if args.sanitize:
            command += ["-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-fno-omit-frame-pointer", "-fno-pie", "-no-pie"]
        build = subprocess.run(command, capture_output=True, text=True, timeout=60)
        run = subprocess.run([str(binary)], capture_output=True, text=True, timeout=60) if build.returncode==0 else None
        unchanged = all(hashlib.sha256((ROOT / p).read_bytes()).hexdigest()==h for p,h in hashes.items())
        report = dict(passed=bool(run and run.returncode==0 and unchanged),source_sha256=hashes,source_unchanged=unchanged,
                      build=dict(command=command,exit=build.returncode,stdout=build.stdout,stderr=build.stderr),
                      run=None if not run else dict(exit=run.returncode,stdout=run.stdout,stderr=run.stderr),
                      reference_vectors=37,alignments=4,native_word_size=64,device_access=False,
                      limits=["The actual C restore/validation and actual Mlib checked setter execute; app/cache objects are reduced host fixtures.",
                              "Allocation-failure vectors inject a false checked-assignment return independent of the larger 64-bit native inline string capacity.",
                              "Not a full on_run lifecycle, wake/reset, SDK peripheral, NFC or physical storage test."])
        (output / "RESULTS.json").write_text(json.dumps(report,indent=2)+"\n")
        print(build.stderr + (run.stdout+run.stderr if run else ""))
        if not report["passed"]: raise SystemExit(1)


if __name__ == "__main__":
    main()
