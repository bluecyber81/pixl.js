#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdbool.h>
#include <string.h>

#define BLE_CONN_HANDLE_INVALID UINT16_MAX
#define BLE_HCI_REMOTE_USER_TERMINATED_CONNECTION 19
#define BLE_ERROR_INVALID_CONN_HANDLE 88
#define NRF_ERROR_INVALID_STATE 91
#define NRF_DFU_OP_OBJECT_WRITE 8
#define MAX_DFU_PKT_LEN 244
#define NRF_SUCCESS 0
#define NRF_LOG_DEBUG(...)
#define NRF_LOG_WARNING(...)
#define APP_ERROR_CHECK(rc) assert((rc) == 0)
#define CRITICAL_REGION_ENTER() ++critical
#define CRITICAL_REGION_EXIT() do { assert(critical); --critical; } while(0)
typedef unsigned ret_code_t;
typedef struct { uint16_t handle,offset,len; uint8_t data[244]; } ble_gatts_evt_write_t;
typedef struct { struct { struct { uint16_t conn_handle; struct { ble_gatts_evt_write_t write; } params; } gatts_evt; } evt; } ble_evt_t;
typedef struct { struct {uint16_t value_handle;} dfu_pkt_handles; } ble_dfu_t;
typedef struct {
    int request; void *p_context; struct { void (*response)(void); void (*write)(void*); } callback;
    struct {uint8_t *p_data; uint16_t len;} write;
} nrf_dfu_request_t;
static uint32_t m_response_session;
static uint16_t m_conn_handle,m_response_head,m_response_count,m_response_inflight,m_pkt_notif_target,m_pkt_notif_target_cnt;
static bool m_response_failed,g_dfu_finalizing;
bool g_dfu_reset_pending;
static unsigned critical,m_buffer_pool,allocations,releases,dispatches,disconnects;
static bool full,reject,switch_link,in_use;
static uint8_t buffer[244];
static unsigned gap_result;
static nrf_dfu_request_t captured;
static void response_session_reset(uint16_t);
static unsigned sd_ble_gap_disconnect(uint16_t handle, int reason) {
    assert(critical && handle==m_conn_handle && reason==19); ++disconnects; return gap_result;
}
static void ble_dfu_req_handler_callback(void) {}
static uint8_t* nrf_balloc_alloc(unsigned *pool) {
    assert(pool==&m_buffer_pool); ++allocations;
    if(full) return NULL;
    assert(!in_use); in_use=true; return buffer;
}
static int nrf_balloc_free(unsigned *pool, void *buf) {
    assert(in_use && pool==&m_buffer_pool && buf==buffer); in_use=false; ++releases; return 0;
}
static unsigned nrf_dfu_req_handler_on_req(nrf_dfu_request_t *req) {
    ++dispatches; captured=*req;
    if(switch_link) { response_session_reset(BLE_CONN_HANDLE_INVALID); response_session_reset(7); }
    return reject?4u:0u;
}
/* IMPLEMENTATION */
static void start(void) {
    assert(!critical && !in_use); response_session_reset(7);
    full=reject=switch_link=false; g_dfu_finalizing=false; gap_result=0;
    allocations=releases=dispatches=disconnects=0;
}
static void packet(unsigned handle, unsigned attr,unsigned off,unsigned len) {
    ble_dfu_t service={.dfu_pkt_handles.value_handle=12};
    ble_evt_t e={.evt.gatts_evt={.conn_handle=handle,.params.write={.handle=attr,.offset=off,.len=len}}};
    for(unsigned i=0; i<len && i<244; ++i) e.evt.gatts_evt.params.write.data[i]=(uint8_t)(i^0xb3);
    on_write(&service,&e); assert(!critical);
}
int main(void) {
    (void)&response_fail_locked; /* The old data ingress did not use this helper. */
    start(); packet(7,12,0,244);
    assert(allocations==1 && dispatches==1 && !disconnects && !releases);
    assert(captured.write.len==244 && captured.write.p_data==buffer &&
           captured.request==NRF_DFU_OP_OBJECT_WRITE && captured.p_context==(void*)(uintptr_t)m_response_session);
    for(unsigned i=0;i<244;++i) assert(buffer[i]==(uint8_t)(i^0xb3));
    captured.callback.write(buffer); assert(releases==1); puts("PASS normal full-size ownership");
    start(); packet(7,13,0,20); packet(7,12,4,20); packet(7,12,0,0); packet(7,12,0,245);
    assert(!allocations && !disconnects); puts("PASS malformed or other attribute");
    for(unsigned idx=0;idx<3;++idx) {
        start(); gap_result=(unsigned[]){0,NRF_ERROR_INVALID_STATE,BLE_ERROR_INVALID_CONN_HANDLE}[idx];
        full=true; packet(7,12,0,20); packet(7,12,0,20);
        assert(!dispatches && !releases && allocations==(EXPECT_OLD?2u:1u) && disconnects==(EXPECT_OLD?0u:1u));
        full=false;
        if(!EXPECT_OLD) { packet(7,12,0,4); assert(!dispatches); }
        response_session_reset(BLE_CONN_HANDLE_INVALID); response_session_reset(7);
        packet(7,12,0,4); assert(dispatches==1); captured.callback.write(buffer);
    }
    puts("PASS pool pressure, duplicate frames, pending disconnect and next session");
    start(); reject=true; packet(7,12,0,20);
    assert(releases==1 && dispatches==1 && !in_use && disconnects==(EXPECT_OLD?0u:1u));
    if(!EXPECT_OLD) { packet(7,12,0,20); assert(releases==1 && dispatches==1); }
    puts("PASS scheduler rejection releases exactly once");
    start(); reject=switch_link=true; packet(7,12,0,20);
    assert(!disconnects && !m_response_failed && releases==1); puts("PASS reused handle preserves new generation");
    if(!EXPECT_OLD) {
        start(); packet(6,12,0,20); assert(!allocations && !disconnects);
        puts("PASS foreign connection handle rejected");
    }
    start(); g_dfu_finalizing=true; packet(7,12,0,20);
    assert(!allocations && !disconnects); puts("PASS finalized image retains control");
    if(!EXPECT_OLD) {
        start(); g_dfu_reset_pending=true; packet(7,12,0,20);
        assert(!allocations && !disconnects && !dispatches);
        puts("PASS pending timeout does not accept a new packet");
    }
    return 0;
}
