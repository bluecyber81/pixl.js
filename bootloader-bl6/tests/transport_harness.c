
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
#define NRF_SUCCESS 0u
#define NRF_ERROR_NO_MEM 4u
#define NRF_ERROR_INVALID_PARAM 7u
#define NRF_ERROR_INVALID_STATE 8u
#define NRF_ERROR_DATA_SIZE 12u
#define NRF_ERROR_RESOURCES 19u
#define BLE_ERROR_INVALID_CONN_HANDLE 0x3002u
#define BLE_GATT_HVX_NOTIFICATION 1
#define BLE_CONN_HANDLE_INVALID 65535u
#define BLE_HCI_REMOTE_USER_TERMINATED_CONNECTION 0x13
#define MAX_RESPONSE_LEN 17
#define MAX_DFU_PKT_LEN 20
#define RESPONSE_HEADER_LEN 3
#define BLE_CCCD_VALUE_LEN 2
#define NRF_DFU_OP_OBJECT_CREATE 1
#define NRF_DFU_OP_RECEIPT_NOTIF_SET 2
#define NRF_DFU_OP_CRC_GET 3
#define NRF_DFU_OP_OBJECT_EXECUTE 4
#define NRF_DFU_OP_OBJECT_SELECT 6
#define NRF_DFU_OP_OBJECT_WRITE 8
#define NRF_DFU_OP_RESPONSE 0x60
#define NRF_DFU_RES_CODE_SUCCESS 1
#define NRF_DFU_RES_CODE_EXT_ERROR 11
#define NRF_DFU_EXT_ERROR_NO_ERROR 0
#define NRF_DFU_OBJ_TYPE_COMMAND 1
#define BLE_GATTS_AUTHORIZE_TYPE_WRITE 2
#define BLE_GATTS_AUTHORIZE_TYPE_INVALID 0
#define BLE_GATTS_OP_WRITE_REQ 1
#define BLE_GATTS_OP_PREP_WRITE_REQ 4
#define BLE_GATT_STATUS_SUCCESS 0
#define BLE_GATT_STATUS_ATTERR_WRITE_NOT_PERMITTED 0x103
#define BLE_GATT_STATUS_ATTERR_INVALID_OFFSET 0x107
#define BLE_GATT_STATUS_ATTERR_INVALID_ATT_VAL_LENGTH 0x10d
#define BLE_GATT_STATUS_ATTERR_REQUEST_NOT_SUPPORTED 0x106
#define BLE_GATT_STATUS_ATTERR_CPS_CCCD_CONFIG_ERROR 0x1fd
#define BLE_GAP_EVT_CONNECTED 1
#define BLE_GAP_EVT_DISCONNECTED 2
#define BLE_GATTS_EVT_HVN_TX_COMPLETE 3
#define BLE_GATTS_EVT_RW_AUTHORIZE_REQUEST 4
#define DFU_BLE_RESETTING_SOON 2
#define NRF_DFU_EVT_TRANSPORT_ACTIVATED 1
#define NRF_DFU_EVT_TRANSPORT_DEACTIVATED 2
#define NRF_LOG_DEBUG(...) ((void)0)
#define NRF_LOG_WARNING(...) ((void)0)
#define NRF_LOG_ERROR(...) ((void)0)
#define ASSERT(x) assert(x)
#define APP_ERROR_CHECK(x) assert((x)==0)
typedef uint32_t ret_code_t;
typedef uint8_t nrf_dfu_op_t;
typedef struct {uint16_t cccd_handle,value_handle;} handles_t;
typedef struct {handles_t dfu_ctrl_pt_handles,dfu_pkt_handles;} ble_dfu_t;
typedef struct {uint16_t len,offset;uint8_t *p_value;} ble_gatts_value_t;
typedef struct {uint16_t handle;uint8_t type;uint8_t *p_data;uint16_t *p_len;} ble_gatts_hvx_params_t;
typedef struct {uint8_t request,result;union {struct {uint32_t max_size,offset,crc;} select;struct {uint32_t offset,crc;} write;struct {uint32_t offset,crc;} crc;};} nrf_dfu_response_t;
typedef struct {uint8_t request;void *p_context;struct {void (*response)(nrf_dfu_response_t*,void*);void (*write)(void*);} callback;union{struct{uint8_t object_type;}select;struct{uint8_t object_type;uint32_t object_size;}create;struct{uint8_t*p_data;uint16_t len;}write;};} nrf_dfu_request_t;
typedef struct {uint16_t handle;uint8_t op;uint16_t offset,len;uint8_t data[24];} ble_gatts_evt_write_t;
typedef struct {uint8_t type;union{ble_gatts_evt_write_t write;}request;} ble_gatts_evt_rw_authorize_request_t;
typedef struct {uint16_t count;} ble_gatts_evt_hvn_tx_complete_t;
typedef struct {uint16_t conn_handle;union{ble_gatts_evt_write_t write;ble_gatts_evt_rw_authorize_request_t authorize_request;ble_gatts_evt_hvn_tx_complete_t hvn_tx_complete;}params;} ble_gatts_evt_t;
typedef struct {uint16_t conn_handle;} ble_gap_evt_t;
typedef struct {struct{uint16_t evt_id;}header;union{ble_gatts_evt_t gatts_evt;ble_gap_evt_t gap_evt;}evt;} ble_evt_t;
typedef struct {uint8_t type;union{struct{uint16_t gatt_status;uint8_t update;uint16_t offset,len;uint8_t const*p_data;}write;}params;} ble_gatts_rw_authorize_reply_params_t;
static uint16_t m_conn_handle=BLE_CONN_HANDLE_INVALID,m_pkt_notif_target,m_pkt_notif_target_cnt;
static uint32_t m_flags,m_gap_conn_params,ble_dfu_transport;
static void (*m_observer)(int);
bool g_dfu_finalizing;
static int m_buffer_pool,allocations,frees;
static uint8_t allocated_packet[MAX_DFU_PKT_LEN];
static void*nrf_balloc_alloc(void*pool){(void)pool;allocations++;return allocated_packet;}
static void nrf_balloc_free(void*pool,void*data){(void)pool;assert(data==allocated_packet);frees++;}
static ble_dfu_t m_dfu={{11,10},{0,12}};
static int locks,lock_enters,lock_exits;
static void (*on_unlock)(void);
static void (*during_hvx)(void);
static void (*during_request)(void);
static void critical_enter(void){locks++;lock_enters++;}
static void critical_exit(void){assert(locks>0);locks--;lock_exits++;if(!locks&&on_unlock){void(*f)(void)=on_unlock;on_unlock=NULL;f();}}
#define CRITICAL_REGION_ENTER() {critical_enter();
#define CRITICAL_REGION_EXIT() critical_exit();}
static int credits,hvx_attempts,accepted,disconnects,advertising_calls;
static uint32_t forced_hvx_error,forced_disconnect_error,forced_request_error,cccd_error;
static uint8_t cccd_value=1,ext_error;
static int auth_replies;
static ble_gatts_rw_authorize_reply_params_t last_auth;
static uint32_t auth_error;
static nrf_dfu_request_t captured_request;
static int request_count;
static uint8_t packets[2048][17];
static uint16_t packet_len[2048],packet_conn[2048];
static int checks,failures;
#define CHECK(x,label) do{checks++;if(!(x)){failures++;printf("FAIL %s line=%d\n",label,__LINE__);}}while(0)
static uint32_t sd_ble_gatts_hvx(uint16_t conn,ble_gatts_hvx_params_t const*p){
#if CANDIDATE
 assert(locks>0);
#endif
 hvx_attempts++;if(during_hvx){void(*f)(void)=during_hvx;during_hvx=NULL;f();}
 if(forced_hvx_error)return forced_hvx_error;
 if(credits<=0)return NRF_ERROR_RESOURCES;
 credits--;assert(accepted<2048);assert(*p->p_len<=17);memcpy(packets[accepted],p->p_data,*p->p_len);packet_len[accepted]=*p->p_len;packet_conn[accepted]=conn;accepted++;return 0;
}
static uint32_t sd_ble_gap_disconnect(uint16_t conn,uint8_t reason){assert(conn!=BLE_CONN_HANDLE_INVALID);assert(reason==0x13);disconnects++;return forced_disconnect_error;}
static uint32_t sd_ble_gatts_value_get(uint16_t c,uint16_t h,ble_gatts_value_t*v){(void)c;assert(h==11);if(cccd_error)return cccd_error;v->p_value[0]=cccd_value;v->p_value[1]=0;return 0;}
static bool ble_srv_is_notification_enabled(uint8_t const*p){return(p[0]&1)!=0;}
static uint32_t sd_ble_gatts_rw_authorize_reply(uint16_t c,ble_gatts_rw_authorize_reply_params_t const*p){(void)c;auth_replies++;last_auth=*p;return auth_error;}
static uint32_t sd_ble_gap_conn_param_update(uint16_t h,void*p){(void)h;(void)p;return 0;}
static uint32_t advertising_start(void){advertising_calls++;return 0;}
static uint32_t nrf_dfu_transports_close(void const*p){(void)p;return 0;}
static uint32_t nrf_dfu_req_handler_on_req(nrf_dfu_request_t*p){captured_request=*p;request_count++;if(during_request){void(*f)(void)=during_request;during_request=NULL;f();}return forced_request_error;}
static uint16_t uint32_encode(uint32_t x,uint8_t*p){for(unsigned i=0;i<4;i++)p[i]=(uint8_t)(x>>(i*8));return 4;}
static uint32_t uint32_decode(uint8_t const*p){return(uint32_t)p[0]|(uint32_t)p[1]<<8|(uint32_t)p[2]<<16|(uint32_t)p[3]<<24;}
static uint16_t uint16_decode(uint8_t const*p){return(uint16_t)p[0]|(uint16_t)p[1]<<8;}
static uint8_t ext_error_get(void){return ext_error;}
static int ext_error_set(uint8_t e){ext_error=e;return 0;}
/* GENERATED_FUNCTIONS */
static void event(uint16_t id,uint16_t conn){ble_evt_t e={0};e.header.evt_id=id;e.evt.gap_evt.conn_handle=conn;dispatch_event(&e);}
static void * context(void){
#if CANDIDATE
 return response_context_get();
#else
 return &m_dfu;
#endif
}
static void fresh(void){
 on_unlock=NULL;during_hvx=NULL;during_request=NULL;assert(locks==0);credits=hvx_attempts=accepted=disconnects=0;forced_hvx_error=forced_disconnect_error=forced_request_error=cccd_error=0;cccd_value=1;auth_replies=auth_error=request_count=0;ext_error=0;m_flags=0;g_dfu_finalizing=false;allocations=frees=0;
 event(BLE_GAP_EVT_DISCONNECTED,7);event(BLE_GAP_EVT_CONNECTED,7);
}
static void reply(uint8_t op,uint32_t offset,void*ctx){nrf_dfu_response_t r={.request=op,.result=NRF_DFU_RES_CODE_SUCCESS};if(op==NRF_DFU_OP_OBJECT_SELECT){r.select.max_size=4096;r.select.offset=offset;r.select.crc=0x12345678;}else{r.crc.offset=offset;r.crc.crc=0x12345678;}ble_dfu_req_handler_callback(&r,ctx);}
static void hvn_complete(uint16_t c,int count){ble_evt_t e={0};credits+=count;e.header.evt_id=BLE_GATTS_EVT_HVN_TX_COMPLETE;e.evt.gatts_evt.conn_handle=c;e.evt.gatts_evt.params.hvn_tx_complete.count=(uint16_t)count;dispatch_event(&e);}
/* Historical FIFO tests inject NRF_ERROR_RESOURCES even before any HVN exists.
 * Granting their synthetic capacity is not a real SDK completion. Exercise the
 * retry function directly; the final-ACK section separately uses real counts. */
static void tx_complete(uint16_t c,int free_slots){credits+=free_slots;CRITICAL_REGION_ENTER();if(c==m_conn_handle)response_flush_locked();CRITICAL_REGION_EXIT();}
static void set_prn(uint16_t n){ble_gatts_evt_write_t w={.len=3,.op=BLE_GATTS_OP_WRITE_REQ,.data={NRF_DFU_OP_RECEIPT_NOTIF_SET,(uint8_t)n,(uint8_t)(n>>8)}};CHECK(on_ctrl_pt_write(&m_dfu,&w)==0,"PRN control accepted");}
static void authorize_crc(uint16_t conn){ble_evt_t e={0};e.header.evt_id=BLE_GATTS_EVT_RW_AUTHORIZE_REQUEST;e.evt.gatts_evt.conn_handle=conn;e.evt.gatts_evt.params.authorize_request.type=BLE_GATTS_AUTHORIZE_TYPE_WRITE;ble_gatts_evt_write_t*w=&e.evt.gatts_evt.params.authorize_request.request.write;w->handle=10;w->op=BLE_GATTS_OP_WRITE_REQ;w->len=1;w->data[0]=NRF_DFU_OP_CRC_GET;dispatch_event(&e);}
#if CANDIDATE
static void reconnect_hook(void){event(BLE_GAP_EVT_DISCONNECTED,7);event(BLE_GAP_EVT_CONNECTED,8);}
static void reused_handle_hook(void){event(BLE_GAP_EVT_DISCONNECTED,7);event(BLE_GAP_EVT_CONNECTED,7);}
static void deferred_tx(void){tx_complete(m_conn_handle,1);}
static void arm_deferred_tx(void){assert(locks>0);on_unlock=deferred_tx;}
#endif
int main(void){
 fresh();void*c=context();credits=0;
 reply(NRF_DFU_OP_OBJECT_SELECT,11,c);reply(NRF_DFU_OP_CRC_GET,22,c);reply(NRF_DFU_OP_OBJECT_CREATE,33,c);
 CHECK(accepted==0,"responses retained while SD queue full");tx_complete(7,3);
 CHECK(accepted==3,"TX-complete retries all queued replies");
 if(accepted==3){CHECK(packets[0][1]==6&&packets[1][1]==3&&packets[2][1]==1,"FIFO operation ordering");CHECK(uint32_decode(packets[0]+7)==11&&uint32_decode(packets[1]+3)==22,"FIFO data copied and retained");CHECK(packet_len[0]==15&&packet_len[1]==11&&packet_len[2]==3,"wire response sizes unchanged");}
 /* Ring wrap and a normal PRN=1 client that waits after every packet. */
 fresh();set_prn(1);c=context();for(int i=1;i<=128;i++){credits=0;reply(NRF_DFU_OP_OBJECT_WRITE,(uint32_t)i,c);tx_complete(7,1);}CHECK(accepted==128,"128 PRN1 wait/write cycles");CHECK(disconnects==0,"normal PRN1 never disconnects");if(accepted==128)for(int i=0;i<128;i++)CHECK(packets[i][1]==3&&uint32_decode(packets[i]+3)==(uint32_t)i+1,"PRN1 CRC offsets ordered");
 fresh();set_prn(12);c=context();for(int i=1;i<=24;i++){credits=1;reply(NRF_DFU_OP_OBJECT_WRITE,i,c);}CHECK(accepted==2,"PRN12 interval retained");
 fresh();set_prn(0);c=context();for(int i=0;i<20;i++)reply(NRF_DFU_OP_OBJECT_WRITE,i,c);CHECK(hvx_attempts==0,"PRN0 sends no packet notifications");credits=1;reply(NRF_DFU_OP_CRC_GET,20,c);CHECK(accepted==1,"explicit CRC still works with PRN0");
 /* Disconnect owns both buffered data and scheduled callback generation. */
 fresh();c=context();reply(NRF_DFU_OP_OBJECT_SELECT,111,c);set_prn(12);m_pkt_notif_target_cnt=7;event(BLE_GAP_EVT_DISCONNECTED,7);event(BLE_GAP_EVT_CONNECTED,8);tx_complete(8,4);CHECK(accepted==0,"disconnect discards old buffered responses");CHECK(m_pkt_notif_target==0&&m_pkt_notif_target_cnt==0,"PRN reset for fresh session");int old_attempts=hvx_attempts;reply(NRF_DFU_OP_OBJECT_SELECT,222,c);CHECK(hvx_attempts==old_attempts,"stale callback cannot notify new peer");credits=1;reply(NRF_DFU_OP_OBJECT_SELECT,333,context());CHECK(accepted==1&&packet_conn[0]==8,"fresh callback reaches fresh peer");
 /* Wrong-connection TX-complete is ignored. */
 fresh();reply(NRF_DFU_OP_OBJECT_CREATE,0,context());tx_complete(99,1);CHECK(accepted==0,"foreign TX-complete ignored");tx_complete(7,0);CHECK(accepted==1,"matching TX-complete drains");
 /* Bounded overflow fails this session once and reconnect resumes. */
 fresh();c=context();for(int i=0;i<5;i++)reply(NRF_DFU_OP_OBJECT_SELECT,i,c);CHECK(disconnects==1,"full software FIFO terminates stalled session");for(int i=0;i<4;i++)reply(NRF_DFU_OP_CRC_GET,i,c);CHECK(disconnects==1,"failed session does not repeatedly disconnect");event(BLE_GAP_EVT_DISCONNECTED,7);event(BLE_GAP_EVT_CONNECTED,8);credits=1;reply(NRF_DFU_OP_OBJECT_CREATE,0,context());CHECK(accepted==1,"reconnect works after overflow");
 for(unsigned i=0;i<3;i++){fresh();c=context();forced_hvx_error=(uint32_t[]){NRF_ERROR_INVALID_STATE,NRF_ERROR_DATA_SIZE,BLE_ERROR_INVALID_CONN_HANDLE}[i];reply(NRF_DFU_OP_CRC_GET,0,c);CHECK(disconnects==1,"nonretryable notification error disconnects");}
 for(unsigned i=0;i<2;i++){fresh();forced_hvx_error=NRF_ERROR_INVALID_STATE;forced_disconnect_error=i?BLE_ERROR_INVALID_CONN_HANDLE:NRF_ERROR_INVALID_STATE;reply(NRF_DFU_OP_CRC_GET,0,context());CHECK(disconnects==1,"already disconnected is a tolerated outcome");}
 /* Actual authorization: unsupported Prepare Write gets a bounded ATT error. */
 fresh();ble_evt_t e={0};e.evt.gatts_evt.conn_handle=7;e.evt.gatts_evt.params.authorize_request.type=BLE_GATTS_AUTHORIZE_TYPE_WRITE;ble_gatts_evt_write_t*w=&e.evt.gatts_evt.params.authorize_request.request.write;w->handle=10;w->op=BLE_GATTS_OP_PREP_WRITE_REQ;w->len=1;w->data[0]=NRF_DFU_OP_CRC_GET;
 CHECK(!on_rw_authorize_req(&m_dfu,&e),"prepared command is not executed");CHECK(auth_replies==1&&last_auth.params.write.gatt_status==0x106,"prepared command gets REQUEST_NOT_SUPPORTED");CHECK(last_auth.params.write.update==0&&last_auth.params.write.len==0&&last_auth.params.write.p_data==NULL,"unsupported write cannot alter attribute");
 w->op=BLE_GATTS_OP_WRITE_REQ;auth_replies=0;CHECK(on_rw_authorize_req(&m_dfu,&e),"valid Write Request remains supported");CHECK(auth_replies==1&&last_auth.params.write.gatt_status==0,"valid Write Request gets success");
 w->len=0;CHECK(!on_rw_authorize_req(&m_dfu,&e)&&last_auth.params.write.gatt_status==0x10d,"empty command rejected");w->len=1;w->offset=1;CHECK(!on_rw_authorize_req(&m_dfu,&e)&&last_auth.params.write.gatt_status==0x107,"offset command rejected");w->offset=0;cccd_error=5;CHECK(!on_rw_authorize_req(&m_dfu,&e),"CCCD read error rejects authorization");
#if CANDIDATE
 /* Reclaim SD credits even when the corresponding IRQ has not run yet. */
 fresh();c=context();for(int i=0;i<4;i++)reply(NRF_DFU_OP_CRC_GET,i,c);credits=5;reply(NRF_DFU_OP_CRC_GET,4,c);CHECK(accepted==5&&disconnects==0,"pending TX-complete does not cause spurious overflow");for(int i=0;i<5;i++)CHECK(uint32_decode(packets[i]+3)==(uint32_t)i,"reclaimed credits preserve order");
 /* A disconnect at the exact critical-exit boundary cannot leak a response. */
 fresh();c=context();credits=1;on_unlock=reconnect_hook;reply(NRF_DFU_OP_OBJECT_SELECT,44,c);CHECK(accepted==0,"disconnect between response decision and enqueue drops stale response");CHECK(m_conn_handle==8,"deferred reconnect was exercised");
 fresh();c=context();credits=0;reply(NRF_DFU_OP_OBJECT_CREATE,0,c);reply(NRF_DFU_OP_CRC_GET,8,c);credits=1;during_hvx=arm_deferred_tx;tx_complete(7,0);CHECK(accepted==2,"deferred retry after queue mutation neither duplicates nor loses");CHECK(packets[0][1]==1&&packets[1][1]==3,"retry serialization preserves FIFO");
 fresh();c=context();uint8_t bad[18]={0};response_send(bad,sizeof(bad),(uintptr_t)c);CHECK(disconnects==1&&accepted==0,"oversized internal response never overflows slot");CHECK(response_context_get()==NULL,"failed session stops admitting requests");
 fresh();m_response_session=UINT32_MAX;response_session_reset(7);CHECK(m_response_session==1&&response_context_get()!=NULL,"generation wrap skips zero");
 /* ATT acceptance followed by a full DFU scheduler must not silently hang.
  * Run the identical checks against BL4 to reproduce the missing disconnect. */
 fresh();forced_request_error=NRF_ERROR_NO_MEM;authorize_crc(7);
 CHECK(auth_replies==1&&last_auth.params.write.gatt_status==BLE_GATT_STATUS_SUCCESS,"scheduler failure follows successful ATT authorization");
 CHECK(request_count==1&&accepted==0,"scheduler rejects command before any DFU response exists");
 CHECK(disconnects==1&&m_response_failed,"scheduler rejection terminates accepted session");
 int before_requests=request_count;authorize_crc(7);
 CHECK(request_count==before_requests&&disconnects==1,"failed session neither schedules nor disconnects repeatedly");
 event(BLE_GAP_EVT_DISCONNECTED,7);event(BLE_GAP_EVT_CONNECTED,8);forced_request_error=0;authorize_crc(8);credits=1;reply(NRF_DFU_OP_CRC_GET,123,captured_request.p_context);
 CHECK(request_count==before_requests+1&&disconnects==1&&accepted==1&&packet_conn[0]==8,"fresh peer resumes after scheduler rejection");
 fresh();authorize_crc(7);CHECK(request_count==1&&disconnects==0,"normal authorized command stays connected");
 fresh();forced_request_error=NRF_ERROR_NO_MEM;auth_error=NRF_ERROR_INVALID_STATE;authorize_crc(7);CHECK(request_count==0&&disconnects==0,"failed ATT reply never schedules a command or disconnects");
 fresh();forced_request_error=NRF_ERROR_NO_MEM;authorize_crc(99);CHECK(disconnects==0&&!m_response_failed,"foreign event cannot terminate live session");
 fresh();forced_request_error=NRF_ERROR_NO_MEM;during_request=reused_handle_hook;authorize_crc(7);CHECK(disconnects==0&&!m_response_failed,"stale admission failure cannot terminate reused handle in new session");
 fresh();event(BLE_GAP_EVT_DISCONNECTED,7);authorize_crc(7);CHECK(request_count==0&&disconnects==0,"missing live session never disconnects invalid handle");
 for(unsigned i=0;i<2;i++){fresh();forced_request_error=NRF_ERROR_NO_MEM;forced_disconnect_error=i?BLE_ERROR_INVALID_CONN_HANDLE:NRF_ERROR_INVALID_STATE;authorize_crc(7);CHECK(disconnects==1&&m_response_failed,"scheduler failure tolerates disconnect already in progress");}
 CHECK(locks==0&&lock_enters==lock_exits,"critical regions balanced");
#endif
#if RUN_FINAL_ACK_TESTS
 /* Final Execute can leave the software FIFO but still wait for the radio ACK.
  * These tests invoke the actual pending query and the SDK's aggregate count. */
 fresh();CHECK(!nrf_dfu_ble_response_pending(),"idle session has no pending response");
 c=context();credits=1;reply(NRF_DFU_OP_OBJECT_EXECUTE,0,c);
 CHECK(accepted==1&&m_response_count==0,"Execute is accepted into SD before completion");
 CHECK(nrf_dfu_ble_response_pending(),"accepted Execute remains pending before HVN completion");
 hvn_complete(99,1);CHECK(nrf_dfu_ble_response_pending(),"foreign completion cannot acknowledge Execute");
 hvn_complete(7,0);CHECK(nrf_dfu_ble_response_pending(),"zero count cannot acknowledge Execute");
 hvn_complete(7,1);CHECK(!nrf_dfu_ble_response_pending(),"matching completion releases Execute drain");

 fresh();c=context();credits=3;for(int i=0;i<3;i++)reply(NRF_DFU_OP_CRC_GET,i,c);
 CHECK(accepted==3&&nrf_dfu_ble_response_pending(),"multiple accepted notifications remain pending");
 hvn_complete(7,2);CHECK(nrf_dfu_ble_response_pending(),"aggregate count retires two but retains the third");
 hvn_complete(7,1);CHECK(!nrf_dfu_ble_response_pending(),"last aggregate completion drains all accepted notifications");

 fresh();c=context();credits=1;reply(NRF_DFU_OP_CRC_GET,1,c);reply(NRF_DFU_OP_OBJECT_EXECUTE,0,c);
 CHECK(accepted==1&&m_response_count==1&&nrf_dfu_ble_response_pending(),"software FIFO is pending while final Execute waits for capacity");
 hvn_complete(7,1);CHECK(accepted==2&&m_response_count==0&&nrf_dfu_ble_response_pending(),"old completion must not acknowledge newly flushed Execute");
 hvn_complete(7,1);CHECK(!nrf_dfu_ble_response_pending(),"newly flushed Execute needs its own completion");

 fresh();c=context();credits=3;for(int i=0;i<5;i++)reply(NRF_DFU_OP_CRC_GET,i,c);
 CHECK(accepted==3&&m_response_count==2,"aggregate test has three accepted and two software-queued replies");
 hvn_complete(7,3);CHECK(accepted==5&&m_response_count==0&&nrf_dfu_ble_response_pending(),"aggregate completion does not acknowledge replies flushed by that event");
 hvn_complete(7,2);CHECK(!nrf_dfu_ble_response_pending(),"second aggregate completion releases remaining replies");

 fresh();c=context();credits=1;reply(NRF_DFU_OP_OBJECT_EXECUTE,0,c);
 hvn_complete(7,2);CHECK(disconnects==1&&m_response_failed,"impossible aggregate count fails the session instead of underflowing");
 CHECK(!nrf_dfu_ble_response_pending(),"failed link cannot stall final drain");
 hvn_complete(7,2);CHECK(disconnects==1,"failed aggregate event does not disconnect repeatedly");

 fresh();c=context();credits=2;reply(NRF_DFU_OP_CRC_GET,1,c);reply(NRF_DFU_OP_OBJECT_EXECUTE,0,c);
 event(BLE_GAP_EVT_DISCONNECTED,7);CHECK(!nrf_dfu_ble_response_pending(),"disconnect discards inflight and software drain state");
 event(BLE_GAP_EVT_CONNECTED,8);CHECK(!nrf_dfu_ble_response_pending(),"new session starts drained");
 credits=1;reply(NRF_DFU_OP_OBJECT_EXECUTE,0,context());hvn_complete(7,1);
 CHECK(nrf_dfu_ble_response_pending(),"prior peer completion cannot clear a new session");
 response_session_reset(BLE_CONN_HANDLE_INVALID);CHECK(!nrf_dfu_ble_response_pending(),"explicit session reset clears pending state");

 fresh();c=context();g_dfu_finalizing=true;
 CHECK(response_context_get()==NULL,"finalizing stops new request contexts");
 ble_gatts_evt_write_t final_control={.len=1,.op=BLE_GATTS_OP_WRITE_REQ,.data={NRF_DFU_OP_CRC_GET}};
 CHECK(on_ctrl_pt_write(&m_dfu,&final_control)==NRF_ERROR_INVALID_STATE&&request_count==0,"finalizing rejects a new control request before scheduling");
 authorize_crc(7);CHECK(request_count==0&&last_auth.params.write.gatt_status==BLE_GATT_STATUS_ATTERR_WRITE_NOT_PERMITTED,"finalizing reports ATT write-not-permitted without scheduling");
 ble_evt_t final_packet={0};final_packet.evt.gatts_evt.conn_handle=7;final_packet.evt.gatts_evt.params.write.handle=12;final_packet.evt.gatts_evt.params.write.len=1;final_packet.evt.gatts_evt.params.write.data[0]=42;
 on_write(&m_dfu,&final_packet);
 CHECK(allocations==0&&request_count==0,"finalizing packet traffic allocates no buffer and schedules no write");
 credits=1;reply(NRF_DFU_OP_OBJECT_EXECUTE,0,c);
 CHECK(accepted==1&&nrf_dfu_ble_response_pending(),"finalizing still delivers callback for already admitted Execute");
 hvn_complete(7,1);CHECK(!nrf_dfu_ble_response_pending(),"finalizing permits final response completion");
 int before_advertising=advertising_calls;event(BLE_GAP_EVT_DISCONNECTED,7);
 CHECK(advertising_calls==before_advertising,"finalizing disconnect does not advertise a new DFU session");
 event(BLE_GAP_EVT_CONNECTED,8);CHECK(response_context_get()==NULL,"new connection cannot admit traffic while finalization remains locked");
 CHECK(locks==0&&lock_enters==lock_exits,"finalization query critical regions remain balanced");
#endif
 printf("checks=%d failures=%d\n",checks,failures);return failures?1:0;
}
