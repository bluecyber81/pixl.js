/* Included after the existing real-SPIFFS fixture, without its old main. */
#include "df_defines.h"
#include "df_proto_vfs.h"
#include "df_core.h"
#define TYBALT "/amiibo/Animal/Welcome/W08 - Tybalt.bin"
#define PHANTOM "/amiibo/Animal/Welcome/W08 - TybalT,`i&"
static unsigned checks, sends;
static bool idle = true;
static df_frame_t reply;
static bool transport;
static unsigned wire_count, wire_capacity=247;
static df_frame_t wire[32];
/* ACTUAL_CORE_AND_DRIVER */
uint32_t app_timer_cnt_get(void) { return 0; }
uint32_t app_timer_cnt_diff_compute(uint32_t a,uint32_t b) { return a-b; }
size_t ble_nus_max_data_length(void) { return wire_capacity; }
void ble_nus_abort_transfer(void) { assert(!"unexpected transport abort"); }
void ble_amiibolink_reset_transfer(void) {}
void df_proto_vfs_cleanup(void) {}
/* Reset handlers are outside this read-only diagnostic fixture. */
void df_proto_info_cancel_pending(void) {}
void df_proto_vfs_cancel_restart(void) {}
uint32_t ble_nus_tx_data(void *data,size_t size) {
    assert(size>=4 && size<=wire_capacity && wire_count<32);
    df_frame_t *frame=&wire[wire_count++]; memset(frame,0,sizeof(*frame));
    memcpy(frame,data,size); frame->length=size-4; return 0;
}
bool df_proto_vfs_is_idle(void) { return idle; }
static void record_send_frame(df_frame_t *frame) {
    reply = *frame; ++sends;
    if (transport) df_core_send_frame(frame);
}
static void send_error(uint8_t command) {
    df_frame_t frame = {0}; OUT_FRAME_NO_DATA(frame, command, DF_STATUS_ERR); record_send_frame(&frame);
}
/* ACTUAL_HANDLER */
const df_cmd_entry_t df_proto_handler_vfs_entries[]={{0x1b,df_proto_handler_vfs_storage_diag},{0,NULL}};
const df_cmd_entry_t df_proto_handler_info_entries[]={{0,NULL}};

static size_t expected_size(unsigned op) {
    return op == 3 ? 20 : op == 4 ? 101 : op == 5 ? 111 : 194;
}
static void query_v2(unsigned op, unsigned target) {
    spiffs before_fs = fs;
    uint8_t c[sizeof(cache)], f[sizeof(fds)], w[sizeof(work)], flash_before[sizeof(flash)];
    memcpy(c, cache, sizeof(c)); memcpy(f, fds, sizeof(f)); memcpy(w, work, sizeof(w));
    memcpy(flash_before, flash, sizeof(flash));
    unsigned before = hal_reads, wr = writes, er = erases;
    memset(out, 0xa5, sizeof(out)); length = 999;
    assert(vfs_spiffs_diag_query(&fs, op, target, out, sizeof(out), &length) == VFS_OK);
    assert(length == expected_size(op) && out[0] == 2 && out[1] == op && out[2] == target);
    for (unsigned i = length; i < sizeof(out); ++i) assert(out[i] == 0xa5);
    assert(!memcmp(&before_fs, &fs, sizeof(fs)) && !memcmp(c, cache, sizeof(c)));
    assert(!memcmp(f, fds, sizeof(f)) && !memcmp(w, work, sizeof(w)));
    assert(!memcmp(flash_before, flash, sizeof(flash)) && writes == wr && erases == er);
    assert(hal_reads - before == (op == 6 ? 4 : 0)); ++checks;
}
static unsigned scan(const char *scope, const char *name, struct spiffs_dirent *found) {
    spiffs_DIR dir; struct spiffs_dirent ent; unsigned matches = 0;
    vfs_spiffs_diag_list_begin(scope);
    assert(SPIFFS_opendir(&fs, "/", &dir)); SPIFFS_clearerr(&fs);
    while (SPIFFS_readdir(&dir, &ent)) {
        vfs_spiffs_diag_list_entry(scope, &ent);
        if (!strcmp((char *)ent.name, name)) { if (found) *found = ent; ++matches; }
    }
    vfs_spiffs_diag_list_end(scope, SPIFFS_errno(&fs));
    assert(SPIFFS_closedir(&dir) == 0); vfs_spiffs_diag_list_closed(scope);
    return matches;
}
static void request(unsigned op, unsigned target, unsigned generation, unsigned request_length, unsigned status, unsigned chunk) {
    df_frame_t request = {.cmd=0x1b, .length=request_length, .status=status, .chunk=chunk};
    request.data[0]=op; request.data[1]=target; request.data[2]=generation; request.data[3]=generation>>8;
    df_event_t event = {.type=DF_EVENT_DATA_RECEVIED, .df=&request};
    unsigned before = sends; df_proto_handler_vfs_storage_diag(&event);
    assert(sends == before+1 && reply.cmd == 0x1b && reply.chunk == 0); ++checks;
}
static void rejected_request(unsigned op, unsigned target, unsigned generation, unsigned request_length, unsigned status, unsigned chunk) {
    unsigned before = hal_reads;
    request(op,target,generation,request_length,status,chunk);
    assert(reply.status == DF_STATUS_ERR && reply.length == 0 && hal_reads == before);
}
static void transport_request(unsigned mtu,bool framed,unsigned op,unsigned target,unsigned generation,size_t expected) {
    wire_capacity=mtu-3; wire_count=0; df_core_init();
    if(framed) ble_df_driver_enable_framed_rx();
    uint8_t raw[]={0x1b,0,0,0,op,target,generation,generation>>8};
    unsigned before=sends; transport=true;
    ble_on_received_data(raw,op>=5?8:6);
    for(unsigned i=0;m_tx_active;i++) { assert(i<32); ble_on_transmit_ready(); }
    transport=false;
    assert(sends==before+1 && reply.status==0 && reply.length==expected);
    uint8_t merged[243]; size_t offset=0;
    for(unsigned i=0;i<wire_count;i++) {
        assert(wire[i].cmd==0x1b && wire[i].status==0);
        assert(wire[i].chunk==(i+1<wire_count?(0x8000|i):i));
        assert(offset+wire[i].length<=sizeof(merged));
        memcpy(merged+offset,wire[i].data,wire[i].length); offset+=wire[i].length;
    }
    assert(wire_count==(expected+mtu-8)/(mtu-7));
    assert(offset==expected && !memcmp(merged,reply.data,expected));
    unsigned completed=wire_count; ble_on_transmit_ready();
    assert(wire_count==completed && sends==before+1); ++checks;
}
int main(void) {
    memset(flash,255,sizeof(flash)); mount_fs(); SPIFFS_unmount(&fs);
    assert(SPIFFS_format(&fs)==0); mount_fs();
    uint8_t bytes[540]; memset(bytes,0x57,sizeof(bytes));
    const char *names[] = {TARGET, TYBALT, PHANTOM};
    for(unsigned i=0;i<3;++i) {
        spiffs_file f=SPIFFS_open(&fs,names[i],SPIFFS_CREAT|SPIFFS_WRONLY,0); assert(f>=0);
        assert(SPIFFS_write(&fs,f,bytes,sizeof(bytes))==sizeof(bytes)); assert(SPIFFS_close(&fs,f)==0);
    }
    no_writes=1; vfs_spiffs_diag_reset();
    struct spiffs_dirent correct={0}, phantom={0};
    assert(scan(DIR,TYBALT,&correct)==1); assert(scan(DIR,PHANTOM,&phantom)==1);
    query(0,0); assert(out[0]==1 && out[6]==1 && !strcmp((char*)out+104,TARGET));
    query_v2(3,1); query_v2(4,1); assert(!(out[3]&1));
    scan("/other/",TYBALT,NULL); query_v2(4,1); assert(!(out[3]&1));
    assert(vfs_spiffs_diag_query(&fs,0,0,out,sizeof(out),&length)==VFS_ERR_FAIL);
    assert(scan(DIR,TYBALT,NULL)==1); query_v2(4,1);
    assert((out[3]&3)==3 && out[6]==1 && u16(out+10)==correct.pix);
    assert(!memcmp(out+24,flash+correct.pix*256u,77));
    uint16_t generation=u16(out+4);
    assert(vfs_spiffs_diag_generation_matches(1,generation));
    assert(!vfs_spiffs_diag_generation_matches(2,generation));
    assert(!vfs_spiffs_diag_generation_matches(1,generation-1));
    puts("PASS real LCD SPIFFS hook: exact selected name, full raw prefix and LU/page provenance; other directory not armed");

    uint32_t lu_address=u32(out+16), header_address=u32(out+12);
    uint8_t page[256];
    assert(spiffs_phys_rd(&fs,SPIFFS_OP_T_OBJ_IX|SPIFFS_OP_C_READ,0,header_address,256,page)==0);
    assert(spiffs_phys_rd(&fs,SPIFFS_OP_T_OBJ_LU|SPIFFS_OP_C_READ,0,lu_address-(lu_address%256),256,page)==0);
    query_v2(5,1); assert((out[3]&24)==24 && u16(out+32)==u16(flash+lu_address));
    assert(!memcmp(out+34,flash+header_address,77));
    query_v2(6,1);
    for(unsigned i=0;i<2;++i) { uint8_t *s=out+20+87*i; assert(!u32(s)&&!u32(s+6));
        assert(u16(s+4)==u16(flash+lu_address)&&!memcmp(s+10,flash+header_address,77)); }
    puts("PASS cache peek and two direct LU/header pairs preserve flash/cache/LRU/FD/work and raw fields");

    for(int failed=0;failed<4;++failed) {
        direct_fault_at=failed; direct_fault_count=0; query_v2(6,1); direct_fault_at=-1;
        assert(direct_fault_count==4);
        unsigned pair=failed/2; uint8_t *s=out+20+87*pair;
        if(failed%2) {assert(u32(s+6)==17); for(unsigned i=10;i<87;++i) assert(!s[i]);}
        else {assert(u32(s)==17 && !u16(s+4));}
    }
    direct_mutation=1; direct_fault_count=0; query_v2(6,1); direct_mutation=0;
    assert(out[20+87+10+13+7] != out[20+10+13+7]);
    puts("PASS independently failed/partial HAL samples are zeroed; successful changed repeated header remains visible");

    for(unsigned op=3;op<=6;++op) for(unsigned cap=0;cap<expected_size(op);++cap) {
        unsigned before=hal_reads;
        assert(vfs_spiffs_diag_query(&fs,op,1,out,cap,&length)<0 && length==0 && before==hal_reads); ++checks;
    }
    for(unsigned op=0;op<9;++op) for(unsigned len=0;len<=243;++len) {
        unsigned valid_len=(op==5||op==6)?4:2;
        if(len!=valid_len) rejected_request(op,1,generation,len,0,0);
    }
    rejected_request(6,2,generation,4,0,0); rejected_request(6,1,generation-1,4,0,0);
    rejected_request(5,1,generation,4,1,0); rejected_request(6,1,generation,4,0,0x8000);
    rejected_request(7,1,generation,2,0,0);
    idle=false; for(unsigned op=3;op<=6;++op) rejected_request(op,1,generation,op>=5?4:2,0,0); idle=true;
    request(6,1,generation,4,0,0); assert(reply.status==0&&reply.length==194);
    puts("PASS actual DF handler lengths/flags/idle/selection/generation bounds, no HAL on rejected requests");

    vfs_spiffs_diag_list_begin(DIR); vfs_spiffs_diag_list_closed(DIR);
    const spiffs_page_object_ix_header *h=(const void *)(flash+correct.pix*256u);
    vfs_spiffs_diag_header_observe(&fs,correct.obj_id|SPIFFS_OBJ_ID_IX_FLAG,correct.pix,h);
    query_v2(4,1); assert(!(out[3]&3));
    assert(!vfs_spiffs_diag_generation_matches(1,u16(out+4)));
    query_v2(3,2);
    spiffs_page_object_ix_header *ph=(void *)(flash+phantom.pix*256u);
    uint8_t flags=ph->p_hdr.flags; ph->p_hdr.flags|=SPIFFS_PH_FLAG_FINAL;
    spiffs_cache_init(&fs); /* Fixture reset before deliberately nonfinal image. */
    assert(scan(DIR,PHANTOM,NULL)==0); query_v2(4,2);
    assert((out[3]&3)==3 && u16(out+10)==phantom.pix && (out[24+4]&SPIFFS_PH_FLAG_FINAL));
    ph->p_hdr.flags=flags; ph->p_hdr.obj_id^=1; spiffs_cache_init(&fs);
    scan(DIR,PHANTOM,NULL); query_v2(4,2);
    assert(u16(out+8)!=u16(out+24));
    puts("PASS pre-filter observation survives nonfinal skipped header and records LU/header mismatch without normalizing");

    /* A new listing invalidates the previous generation; selection restores
     * the original schema rather than reinterpreting a union snapshot. */
    uint16_t old_generation=u16(out+4); scan(DIR,PHANTOM,NULL);
    rejected_request(6,2,old_generation,4,0,0);
    request(3,0,0,2,0,0); assert(reply.status==0&&reply.data[0]==2);
    scan(DIR,TARGET,NULL); query(0,0); assert(out[0]==1&&out[6]==1);
    const unsigned legacy_sizes[]={170,91,235}, mtus[]={23,185,250};
    for(unsigned mode=0;mode<2;mode++) for(unsigned m=0;m<3;m++) {
        query_v2(3,0); scan(DIR,TARGET,NULL);
        for(unsigned op=0;op<3;op++) transport_request(mtus[m],mode,op,0,0,legacy_sizes[op]);
        transport_request(mtus[m],mode,3,1,0,20);
        scan(DIR,TYBALT,NULL); query_v2(4,1); generation=u16(out+4);
        for(unsigned op=4;op<=6;op++) transport_request(mtus[m],mode,op,1,generation,expected_size(op));
    }
    puts("PASS 42 actual handler/core/BLE-driver replies reassemble byte-identically at simulated ATT23/185/250, legacy and framed RX");
    query_v2(3,1); vfs_spiffs_diag_reset(); query(0,0); assert(out[0]==1&&!(out[3]&1));
    puts("PASS aborted listing disarms capture; stale listing rejected; explicit legacy restore and reset preserve schema1");
    printf("PASS %u bounded Tybalt diagnostic checks\n",checks);
    return 0;
}
