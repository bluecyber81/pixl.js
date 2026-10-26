"""Actual Mlib/TLSF: a cleared large list must release its backing storage."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
from root_host import FW, function


def run(root, baseline=False, sanitize=False):
    src = root / 'application/src'
    source = src / 'mui/view/mui_list_view.c'
    text = source.read_text()
    header = (src / 'mui/view/mui_list_view.h').read_text()
    item = header[header.index('struct mui_list_item_s {'):header.index('#define LIST_SCROLL_UP')]
    names = ['mui_list_view_try_add_item_ext', 'mui_list_view_clear_items', 'mui_list_view_clear_items_with_cb']
    funcs = '\n'.join(function(text[text.index(('bool ' if n==names[0] else 'void ')+n+'('):], n) for n in names)
    code = r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "mui_mem.c"
#include "mui_alloc.h"
typedef struct mui_list_item_s mui_list_item_t;
@ITEM@
typedef struct { mui_list_item_array_t items; unsigned focus; } mui_list_view_t;
typedef void (*mui_list_view_item_clear_cb)(mui_list_item_t *);
static void mui_list_view_set_focus(mui_list_view_t *v,unsigned f) { v->focus=f; }
@FUNCTIONS@
static unsigned callbacks;
static void release_payload(mui_list_item_t *item) {
    assert(item->user_data); mui_mem_free(item->user_data); ++callbacks;
}
int main(void) {
    mui_mem_init(); mui_mem_monitor_t before,after;
    mui_mem_monitor(&before);
    mui_list_view_t view={0}; mui_list_item_array_init(view.items);
    for(unsigned pass=0;pass<40;++pass) {
        for(unsigned i=0;i<33;++i) {
            void *payload = mui_mem_malloc(8); assert(payload);
            assert(mui_list_view_try_add_item_ext(&view,1,"A","B",payload));
        }
        assert(view.items->alloc==64);
        mui_list_view_clear_items_with_cb(&view,release_payload);
        assert(callbacks==(pass+1)*33 && view.items->size==0 && view.focus==0);
        if (view.items->alloc) { puts("RETAINED_LARGE_ARRAY"); return 71; }
        mui_mem_monitor(&after);
        assert(after.free_size==before.free_size && after.free_biggest_size==before.free_biggest_size);
        for(unsigned i=0;i<33;++i)
            assert(mui_list_view_try_add_item_ext(&view,1,"A long filename needing a string allocation.bin",NULL,NULL));
        mui_list_view_clear_items(&view);
        assert(view.items->alloc==0);
        mui_mem_monitor(&after); assert(after.free_size==before.free_size);
    }
    for(unsigned i=0;i<24;++i) assert(mui_list_view_try_add_item_ext(&view,1,"short",NULL,NULL));
    void *page=view.items->ptr; assert(view.items->alloc==32);
    mui_list_view_clear_items(&view);
    assert(view.items->alloc==32 && view.items->ptr==page && !view.items->size);
    for(unsigned i=0;i<24;++i) assert(mui_list_view_try_add_item_ext(&view,1,"short",NULL,NULL));
    assert(view.items->ptr==page);
    mui_list_view_clear_items(&view); mui_list_item_array_clear(view.items);
    mui_mem_monitor(&after); assert(after.free_size==before.free_size);
    puts("PASS large arrays released; callback payloads freed once; small page reused; 40 cycles leak-free");
}
'''.replace('@ITEM@', item).replace('@FUNCTIONS@', funcs)
    with tempfile.TemporaryDirectory(prefix='pixl-list-release-') as folder:
        folder=Path(folder); path=folder/'probe.c';path.write_text(code)
        exe=folder/('probe.exe' if os.name=='nt' else 'probe')
        cmd=['gcc','-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-Wno-unused-parameter',
             '-I',str(src/'mui'),'-I',str(root/'components/mlib'),'-I',str(root/'components/tlsf')]
        if sanitize or os.environ.get('PIXL_SANITIZE')=='1':
            cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
        subprocess.run(cmd+[str(path),str(root/'components/tlsf/tlsf.c'),'-o',str(exe)],check=True,timeout=60)
        result=subprocess.run([str(exe)],text=True,capture_output=True,timeout=30)
        assert result.returncode==(71 if baseline else 0),(result.stdout,result.stderr)
        assert ('RETAINED_LARGE_ARRAY' if baseline else 'PASS') in result.stdout
        return {'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'baseline':baseline,
                'returncode':result.returncode,'stdout':result.stdout,'stderr':result.stderr}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--baseline',type=Path)
    p.add_argument('--sanitize',action='store_true');p.add_argument('--report',type=Path);a=p.parse_args()
    results=[run(FW,sanitize=a.sanitize)]
    if a.baseline:results.append(run(a.baseline,baseline=True,sanitize=a.sanitize))
    report={'passed':True,'device_access':False,'scope':'Extracted production clear/append with actual Mlib/TLSF; native ABI, not MCU watermark','results':results}
    if a.report:a.report.write_text(json.dumps(report,indent=2)+'\n')
    print('PASS bounded list retention and callback cleanup')
