"""Actual animation tick function and actual mlib iterator, mocked timer/UI."""
from root_host import HostTests, FW, SRC, function
import os
from pathlib import Path
import unittest


class AnimationIterationTests(HostTests):
    def test_finishing_animation_does_not_skip_shifted_successor(self):
        source = Path(os.environ.get('PIXL_ANIM_SOURCE', SRC / 'mui/mui_anim.c')).read_text()
        tick = function(source, 'mui_anim_tick_handler')
        self.compile_run(r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include "m-array.h"
typedef struct anim {
    uint32_t act_time,time;
    uint16_t repeat_cnt,run_cnt;
    int32_t start_value,end_value,current_value;
    bool auto_restart;
    void *var;
    int32_t (*path_cb)(const struct anim *);
    void (*exec_cb)(void *,int32_t);
} mui_anim_t;
ARRAY_DEF(mui_anim_ptr_array, mui_anim_t *, M_PTR_OPLIST);
static mui_anim_ptr_array_t m_anim_ptr_array;
static bool m_anim_tmr_started;
static unsigned m_anim_tick_tmr,stops,updates,calls[3];
#define MUI_ANIM_TICK_INTERVAL_MS 20
#define MUI_ANIM_REPEAT_INFINITE 0xffff
#define NRF_LOG_INFO(...) ((void)0)
#define APP_ERROR_CHECK(x) assert((x)==0)
static int app_timer_stop(unsigned t) { (void)t; ++stops; return 0; }
static void *mui(void) { return NULL; }
static void mui_update(void *m) { (void)m; ++updates; }
static int32_t path(const mui_anim_t *a) { return a->act_time; }
static void exec(void *v,int32_t value) { (void)value; ++calls[(uintptr_t)v]; }
''' + tick + r'''
static mui_anim_t anim(unsigned id,bool finish) {
    mui_anim_t a={0}; a.time=finish?0:100; a.repeat_cnt=1;
    a.var=(void*)(uintptr_t)id; a.end_value=100; a.path_cb=path; a.exec_cb=exec;
    return a;
}
int main(void) {
    mui_anim_ptr_array_init(m_anim_ptr_array);
    mui_anim_t a=anim(0,true),b=anim(1,false),c=anim(2,true);
    mui_anim_ptr_array_push_back(m_anim_ptr_array,&a);
    mui_anim_ptr_array_push_back(m_anim_ptr_array,&b);
    mui_anim_ptr_array_push_back(m_anim_ptr_array,&c);
    m_anim_tmr_started=true; mui_anim_tick_handler();
    assert(a.act_time==20 && b.act_time==20 && c.act_time==20);
    assert(calls[0]==1 && calls[1]==1 && calls[2]==1);
    assert(mui_anim_ptr_array_size(m_anim_ptr_array)==1);
    assert(*mui_anim_ptr_array_get(m_anim_ptr_array,0)==&b);
    assert(updates==1 && stops==0);
    b.time=20; mui_anim_tick_handler();
    assert(calls[1]==2 && mui_anim_ptr_array_size(m_anim_ptr_array)==0);
    assert(stops==1 && !m_anim_tmr_started);
    a=anim(0,true); b=anim(1,true);
    mui_anim_ptr_array_push_back(m_anim_ptr_array,&a);
    mui_anim_ptr_array_push_back(m_anim_ptr_array,&b);
    m_anim_tmr_started=true; mui_anim_tick_handler();
    assert(mui_anim_ptr_array_size(m_anim_ptr_array)==0 && stops==2);
    assert(a.act_time==20 && b.act_time==20);
    mui_anim_ptr_array_clear(m_anim_ptr_array);
    puts("PASS actual mlib removal: adjacent animations each tick once; last removal stops timer");
    return 0;
}
''', [FW / 'components/mlib'])


if __name__ == '__main__':
    unittest.main()
