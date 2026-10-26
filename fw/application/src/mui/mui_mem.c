#include "mui_mem.h"
#include "stdlib.h"
#include "tlsf.h"
#include "../mod/runtime_diag.h"

#include <string.h>

#ifdef MUI_MEM_USE_TLSF

static uint8_t m_mem[MUI_MEM_BUFF_SIZE];
static tlsf_t m_tlsf = NULL;

static void mui_mem_walker(void * ptr, size_t size, int used, void * user)
{
    mui_mem_monitor_t * mon_p = user;
    if(used) {
        mon_p->used_cnt++;
    }
    else {
        mon_p->free_cnt++;
        mon_p->free_size += size;
        if(size > mon_p->free_biggest_size)
            mon_p->free_biggest_size = size;
    }
}

void mui_mem_init() {
    /* Startup storage work can allocate before mui_init(). Keep those blocks
     * and their diagnostics when the UI initializes the same pool again. */
    if (m_tlsf == NULL) {
        runtime_diag_heap_reset();
        m_tlsf = tlsf_create_with_pool(m_mem, sizeof(m_mem));
    }
}
void mui_mem_deinit() {
    tlsf_destroy(m_tlsf);
    m_tlsf = NULL;
    runtime_diag_heap_reset();
}
void *mui_mem_malloc(size_t size) {
    void *result = tlsf_malloc(m_tlsf, size);
    runtime_diag_heap_change(0, result ? tlsf_block_size(result) : 0, size && !result);
    return result;
}
void *mui_mem_realloc(void *p, size_t new_size) {
    size_t old_size = p ? tlsf_block_size(p) : 0;
    void *result = tlsf_realloc(m_tlsf, p, new_size);
    /* Failed realloc preserves the old block; realloc(p,0) releases it. */
    bool failed = new_size && !result;
    runtime_diag_heap_change(failed ? 0 : old_size, result ? tlsf_block_size(result) : 0, failed);
    return result;
}
void mui_mem_free(void *p) {
    runtime_diag_heap_change(p ? tlsf_block_size(p) : 0, 0, false);
    tlsf_free(m_tlsf, p);
}

void mui_mem_monitor(mui_mem_monitor_t *mon_p) {
    memset(mon_p, 0, sizeof(mui_mem_monitor_t));
    if (!m_tlsf) return;
    tlsf_walk_pool(tlsf_get_pool(m_tlsf), mui_mem_walker, mon_p);

    mon_p->total_size = sizeof(m_mem);
    mon_p->used_pct = 100 - ((100U * mon_p->free_size) / mon_p->total_size);
    if (mon_p->free_size > 0) {
        mon_p->frag_pct = mon_p->free_biggest_size * 100U / mon_p->free_size;
        mon_p->frag_pct = 100 - mon_p->frag_pct;
    } else {
        mon_p->frag_pct = 0; /*no fragmentation if all the RAM is used*/
    }

    runtime_diag_heap_sample(mon_p->total_size, mon_p->free_size, mon_p->free_biggest_size);
}

#else

void mui_mem_init() {
    // nop
}
void mui_mem_deinit() {
    // nop
}

void *mui_mem_malloc(size_t size) { return malloc(size); }
void *mui_mem_realloc(void *p, size_t new_size) { return realloc(p, new_size); }
void mui_mem_free(void *p) { return free(p); }
void mui_mem_monitor(mui_mem_monitor_t *p_mon) { memset(p_mon, 0, sizeof(*p_mon)); }

#endif
