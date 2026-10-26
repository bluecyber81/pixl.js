/* FIFO/sortlist/clock mocks around the unmodified SDK operation bodies. */
typedef enum { TIMER_REQ_START, TIMER_REQ_STOP, TIMER_REQ_STOP_ALL } app_timer_req_type_t;
typedef struct { app_timer_req_type_t type; app_timer_t *p_timer; } timer_req_t;
typedef int nrf_atfifo_item_put_t;
typedef int nrf_atfifo_item_get_t;
typedef int drv_rtc_t;
static timer_req_t requests[10];
static unsigned q_count, q_head, queue_failures, create_calls, stop_callback_injections;
static bool force_queue_full, invoke_on_stop_enqueue, fail_create;
static int m_req_fifo, m_app_timer_sortlist;
static bool m_global_active = true;
static app_timer_t *mp_active_timer, *last_timer;
static nrf_sortlist_item_t *sort_item;
static uint64_t clock_now = 1000;
static uint64_t get_now(void) { return clock_now; }
static void timer_request_proc_trigger(void) {}
static timer_req_t *nrf_atfifo_item_alloc(int fifo, nrf_atfifo_item_put_t *ctx) {
    (void)fifo; (void)ctx;
    if (force_queue_full || q_count == 10) { queue_failures++; return NULL; }
    return &requests[(q_head + q_count) % 10];
}
static bool nrf_atfifo_item_put(int fifo, nrf_atfifo_item_put_t *ctx) {
    (void)fifo; (void)ctx; timer_req_t *r = &requests[(q_head + q_count) % 10]; q_count++;
    last_timer = r->p_timer;
    if (invoke_on_stop_enqueue && r->type == TIMER_REQ_STOP) {
        unsigned before = ui_updates; r->p_timer->handler(r->p_timer->p_context);
        assert(ui_updates == before); stop_callback_injections++;
    }
    return true;
}
static timer_req_t *nrf_atfifo_item_get(int fifo, nrf_atfifo_item_get_t *ctx) {
    (void)fifo; (void)ctx;
    if (!q_count) return NULL;
#ifndef SANITIZER_BUILD
    /* Native control: do not dereference a retained freed timer. Sanitizer
     * controls omit this and let the actual SDK body report its invalid read. */
    assert(!pointer_was_freed(requests[q_head].p_timer));
#endif
    return &requests[q_head];
}
static bool nrf_atfifo_item_free(int fifo, nrf_atfifo_item_get_t *ctx) {
    (void)fifo; (void)ctx; assert(q_count); q_head = (q_head + 1) % 10; q_count--; return true;
}
static void nrf_sortlist_add(int *list, nrf_sortlist_item_t *item) {
    (void)list; assert(!sort_item); item->next = NULL; sort_item = item;
}
static bool nrf_sortlist_remove(int *list, nrf_sortlist_item_t *item) {
    (void)list; bool found = sort_item == item;
    /* An intrusive unlink reads the retained node's next pointer. */
    if (found) sort_item = item->next;
    return found;
}
static void sorted_list_stop_all(void) { sort_item = NULL; }
