/* Actual DF/core/queue code plus extracted BLE SDK boundary functions.
 * Synthetic VFS and notification sink only: no radio, filesystem or device. */
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"CHECK line %d: %s\n",__LINE__,#x); exit(71); } } while (0)
#define BOARD_LCD 1
#define VFS_SPIFFS_ENABLE 1
#define NRF_SUCCESS 0
#define NRF_ERROR_DATA_SIZE 12
#define NRF_ERROR_INVALID_STATE 8
#define BLE_CONN_HANDLE_INVALID 65535
#define BLE_HCI_REMOTE_USER_TERMINATED_CONNECTION 0x13
#define NRF_LOG_INFO(...) ((void)0)
typedef uint32_t ret_code_t;
static uint32_t clock_tick;
uint32_t app_timer_cnt_get(void) { return clock_tick; }
uint32_t app_timer_cnt_diff_compute(uint32_t now,uint32_t before) { return (now-before)&0xffffff; }
static int critical_depth;
static uint16_t m_conn_handle = 7, m_ble_nus_max_data_len = 247;
static int m_nus;
static uint32_t sd_ble_gap_disconnect(uint16_t connection, uint8_t reason);
static uint32_t ble_nus_data_send(void *service, void *data, uint16_t *length, uint16_t connection);
/* ACTUAL_PROTOCOL_INCLUDES */
/* ACTUAL_BLE_FUNCTIONS */

static df_frame_t replies[1024];
static unsigned sends, attempts, disconnected, file_closes, dir_closes, dir_reads;
static uint32_t send_error_code, disconnect_error;
static bool fail_read, fail_dir_close, overlong_read, switch_peer_during_read;
static size_t file_length, file_offset;
static unsigned entry_count, entry_index;
static vfs_obj_t entries[40];
static vfs_driver_t driver;
static unsigned resets, write_calls;
static size_t written_length;
static uint8_t written_data[1024];
void ble_amiibolink_reset_transfer(void) { ++resets; }

static uint32_t sd_ble_gap_disconnect(uint16_t connection, uint8_t reason) {
    CHECK(connection == 7 && reason == 0x13 && critical_depth);
    ++disconnected;
    return disconnect_error;
}
static uint32_t ble_nus_data_send(void *service, void *data, uint16_t *length, uint16_t connection) {
    CHECK(service == &m_nus && connection == 7 && critical_depth);
    CHECK(*length >= DF_HEADER_LEN && *length <= m_ble_nus_max_data_len);
    ++attempts;
    if (send_error_code) return send_error_code;
    CHECK(sends < sizeof(replies)/sizeof(replies[0]));
    df_frame_t *frame = &replies[sends++];
    memset(frame,0,sizeof(*frame)); memcpy(frame,data,*length);
    frame->length = *length - DF_HEADER_LEN;
    return 0;
}
bool vfs_drive_enabled(vfs_drive_t d) { return d == VFS_DRIVE_EXT; }
vfs_driver_t *vfs_get_driver(vfs_drive_t d) { CHECK(d == VFS_DRIVE_EXT); return &driver; }
static int32_t mock_open(const char *p, vfs_file_t *f, uint32_t flags) {
    (void)p; (void)flags; f->handle=(void *)1; file_offset=0; return VFS_OK;
}
static int32_t mock_close(vfs_file_t *f) { (void)f; CHECK(!critical_depth); ++file_closes; return VFS_OK; }
static int32_t mock_read(vfs_file_t *f, void *data, size_t length) {
    (void)f; CHECK(!critical_depth && length);
    if (switch_peer_during_read) {
        switch_peer_during_read=false;
        ble_work_disconnected(); ble_work_connected();
    }
    if (fail_read) return VFS_ERR_FAIL;
    size_t n=file_length-file_offset; if(n>length)n=length;
    for(size_t i=0;i<n;i++) ((uint8_t*)data)[i]=(uint8_t)((file_offset+i)*17u+3u);
    file_offset+=n;
    return overlong_read ? (int32_t)length+1 : (int32_t)n;
}
static int32_t mock_write(vfs_file_t *f,void *data,size_t length) {
    CHECK(f->handle && !critical_depth && written_length+length<=sizeof(written_data));
    ++write_calls;memcpy(written_data+written_length,data,length);written_length+=length;return (int32_t)length;
}
static int32_t mock_open_dir(const char *p,vfs_dir_t *d) {
    (void)p; d->handle=(void*)2; entry_index=0; return VFS_OK;
}
static int32_t mock_read_dir(vfs_dir_t *d,vfs_obj_t *o) {
    (void)d; CHECK(!critical_depth); ++dir_reads;
    if(fail_read)return VFS_ERR_FAIL;
    if(entry_index==entry_count)return VFS_ERR_EOF;
    *o=entries[entry_index++]; return VFS_OK;
}
static int32_t mock_close_dir(vfs_dir_t *d) {
    (void)d; CHECK(!critical_depth); ++dir_closes;
    return fail_dir_close ? VFS_ERR_FAIL : VFS_OK;
}
static int32_t mock_stat(vfs_stat_t *s) { *s=(vfs_stat_t){1,8192,4096}; return VFS_OK; }
static unsigned dfu_calls, disable_calls, capture_calls, capture_ready;
static uint8_t captured[DF_PAYLOAD_LEN];
static size_t captured_length;
void ble_get_addr_str(char *value) { strcpy(value,"01:23:45:67:89:AB"); }
void ble_disable(void) { ++disable_calls; }
void enter_dfu(void) { ++dfu_calls; }
/* The volatile MTU command has separate actual-SDK contract tests. */
bool ble_mtu_diagnostic(uint16_t requested,uint8_t *snapshot,size_t capacity) {
    (void)requested; (void)snapshot; (void)capacity; return false;
}
int32_t vfs_spiffs_storage_diagnose(uint8_t op,uint8_t candidate,uint8_t *out,size_t cap,size_t *len) {
    CHECK(op==0 && candidate==0 && cap>=200); *len=200;
    for(size_t i=0;i<*len;i++) out[i]=(uint8_t)(i*13+9);
    return VFS_OK;
}
static void capture_handler(df_event_t *evt) {
    if(evt->type==DF_EVENT_DATA_TRANSMIT_READY) { ++capture_ready; return; }
    if(evt->type!=DF_EVENT_DATA_RECEVIED)return;
    CHECK(evt->df->chunk==0 && evt->df->status==0); ++capture_calls;
    captured_length=evt->df->length; memcpy(captured,evt->df->data,captured_length);
    df_frame_t out={.cmd=0x77,.status=0,.chunk=0,.length=0}; df_core_send_frame(&out);
}
static const df_cmd_entry_t capture_entries[]={{0x77,capture_handler},{0,NULL}};

static void reset(unsigned mtu) {
    ble_work_disconnected(); ble_work_process(ble_on_disconnected);
    m_conn_handle=7; m_ble_nus_max_data_len=mtu-3;
    df_core_init(); ble_work_set_handlers(ble_on_received_data,ble_on_transmit_ready);
    ble_work_connected(); ble_work_process(ble_on_disconnected);
    sends=attempts=disconnected=file_closes=dir_closes=dir_reads=0;
    clock_tick=dfu_calls=disable_calls=capture_calls=capture_ready=captured_length=write_calls=written_length=0;
    send_error_code=disconnect_error=0;
    fail_read=fail_dir_close=overlong_read=switch_peer_during_read=false;
    file_length=file_offset=entry_count=entry_index=0;
    memset(replies,0,sizeof(replies));
    CHECK(ble_work_can_send() && !critical_depth);
}
static void ready(void);
static void request(uint8_t cmd,const void *payload,size_t length) {
    if(m_tx_active && !m_tx_more && m_rx_df_frame.length==m_tx_sent)ready();
    uint8_t data[DF_MAX_LEN]={cmd,0,0,0}; CHECK(length <= DF_PAYLOAD_LEN);
    if(length)memcpy(data+4,payload,length);
    CHECK(ble_work_receive(data,length+4)); ble_work_process(ble_on_disconnected);
}
static void ready(void) { CHECK(ble_work_tx_ready()); ble_work_process(ble_on_disconnected); }
static void packet(uint8_t cmd,uint8_t status,uint16_t chunk,const uint8_t *payload,size_t length) {
    uint8_t data[DF_MAX_LEN]={cmd,status,(uint8_t)chunk,(uint8_t)(chunk>>8)};
    CHECK(length<=DF_PAYLOAD_LEN);if(length)memcpy(data+4,payload,length);
    CHECK(ble_work_receive(data,length+4));ble_work_process(ble_on_disconnected);
}
static void fragmented_request(uint8_t cmd,const uint8_t *payload,size_t length) {
    for(size_t pos=0,seq=0;pos<length;seq++) {
        size_t n=length-pos;if(n>16)n=16;
        packet(cmd,0,(uint16_t)(seq | (pos+n<length?0x8000:0)),payload+pos,n);
        pos+=n;if(pos<length)CHECK(!capture_calls && !sends);
    }
}
static void directory(void) { const uint8_t path[]={3,0,'E',':','/'}; request(0x16,path,sizeof(path)); }
static void open_file(void) {
    const uint8_t request_data[]={4,0,'E',':','/','x',8};
    request(0x12,request_data,sizeof(request_data)); CHECK(sends && replies[sends-1].status==0);
    ready(); sends=attempts=0;
}
static void file(void) { uint8_t id=0; request(0x14,&id,1); }
static void finish_stream(void) {
    CHECK(sends);
    for(unsigned steps=0;replies[sends-1].chunk&0x8000;steps++) {
        CHECK(steps<1000); unsigned before=sends; ready(); CHECK(sends==before+1);
    }
    unsigned before=sends; ready(); CHECK(sends==before);
}
static void modern(void) {
    request(3,NULL,0);finish_stream();CHECK(m_framed_rx && sends==1 && !replies[0].status);
    sends=attempts=0;
}
static size_t merge(uint8_t *out,size_t capacity,uint8_t command) {
    size_t n=0; CHECK(sends);
    for(unsigned i=0;i<sends;i++) {
        CHECK(replies[i].cmd==command && replies[i].status==0);
        CHECK(replies[i].chunk==(i+1<sends ? (i|0x8000) : i));
        CHECK(replies[i].length+4u<=m_ble_nus_max_data_len);
        CHECK(n+replies[i].length<=capacity);
        memcpy(out+n,replies[i].data,replies[i].length); n+=replies[i].length;
    }
    return n;
}
static size_t encode_expected(uint8_t *out) {
    size_t pos=0;
    for(unsigned i=0;i<entry_count;i++) {
        const vfs_obj_t *o=&entries[i]; uint16_t name=(uint16_t)strlen(o->name);
        uint32_t size=(uint32_t)o->size; uint8_t meta=(uint8_t)o->meta[0];
        memcpy(out+pos,&name,2);pos+=2;memcpy(out+pos,o->name,name);pos+=name;
        memcpy(out+pos,&size,4);pos+=4;out[pos++]=o->type;out[pos++]=meta;
        memcpy(out+pos,o->meta+1,meta);pos+=meta;
    }
    return pos;
}
static void make_entries(void) {
    entry_count=40;
    for(unsigned i=0;i<entry_count;i++) {
        vfs_obj_t *o=&entries[i];memset(o,0,sizeof(*o));
        size_t name=(i%3==0)?47:((i%3==1)?13:1);
        memset(o->name,'A'+i%26,name);o->name[name]=0;
        o->size=0x12340000u+i;o->type=i%2;
        o->meta[0]=(i%3==0)?127:((i%3==1)?12:0);
        for(unsigned j=0;j<(uint8_t)o->meta[0];j++)o->meta[j+1]=(char)(i+j);
    }
}
static void print_wire_frames(const char *name) {
    printf("\"%s\":[",name);
    for(unsigned i=0;i<sends;i++) {
        if(i){printf(",");}printf("[");
        const uint8_t *p=(const uint8_t*)&replies[i];
        for(unsigned j=0;j<4u+replies[i].length;j++){if(j)printf(",");printf("%u",p[j]);}
        printf("]");
    }
    printf("]");
}
int main(int argc,char **argv) {
    CHECK(argc==2); unsigned scenario=(unsigned)strtoul(argv[1],NULL,10);
    driver=(vfs_driver_t){.stat=mock_stat,.open_file=mock_open,.close_file=mock_close,.read_file=mock_read,.write_file=mock_write,
        .open_dir=mock_open_dir,.read_dir=mock_read_dir,.close_dir=mock_close_dir};
    uint8_t actual[16384],expected[16384];
    if(scenario<3) {
        unsigned mtus[]={23,185,250};reset(mtus[scenario]);make_entries();
        size_t n=encode_expected(expected);CHECK(n>1780);
        directory();finish_stream();CHECK(merge(actual,sizeof(actual),0x16)==n);
        CHECK(!memcmp(actual,expected,n) && dir_closes==1 && dir_reads==entry_count+1);
    } else if(scenario<6) {
        unsigned mtus[]={23,185,250};reset(mtus[scenario-3]);
        file_length=1000;open_file();file();finish_stream();
        size_t n=merge(actual,sizeof(actual),0x14);CHECK(n==file_length);
        for(size_t i=0;i<n;i++)CHECK(actual[i]==(uint8_t)(i*17u+3u));
        uint8_t id=0;request(0x13,&id,1);CHECK(file_closes==1);
    } else if(scenario==6) {
        unsigned mtus[]={23,185,250};
        for(unsigned k=0;k<3;k++) {
            reset(mtus[k]);request(1,NULL,0);finish_stream();
            size_t n=merge(actual,sizeof(actual),1);
            CHECK(n==2+strlen("2.21.0-DE3.10")+2+strlen("01:23:45:67:89:AB"));
            CHECK(!memcmp(actual+2,"2.21.0-DE3.10",strlen("2.21.0-DE3.10")));
            sends=0;request(0x10,NULL,0);finish_stream();
            CHECK(merge(actual,sizeof(actual),0x10)>16 && actual[0]==1);
        }
    } else if(scenario==7) {
        reset(23);directory();CHECK(sends==1 && replies[0].status==0 && !replies[0].length && dir_closes==1);
        reset(23);make_entries();directory();fail_read=true;finish_stream();
        CHECK(replies[sends-1].status==1 && !replies[sends-1].length && dir_closes==1);
        reset(23);fail_dir_close=true;directory();CHECK(replies[0].status==1 && dir_closes==1);
    } else if(scenario==8) {
        reset(23);file_length=1000;open_file();file();fail_read=true;ready();
        CHECK(sends==2 && replies[1].chunk==1 && replies[1].status==1 && !replies[1].length);
        unsigned before=sends;ready();CHECK(sends==before);
        reset(23);file_length=30;open_file();overlong_read=true;file();CHECK(replies[0].status==1);
    } else if(scenario==9) {
        reset(23);make_entries();send_error_code=19;directory();
        CHECK(!sends && attempts==1 && disconnected==1 && dir_closes==1 && !ble_work_can_send());
        ready();CHECK(attempts==1 && dir_closes==1);
        ble_work_disconnected();ble_work_process(ble_on_disconnected);CHECK(dir_closes==1);
        reset(23);file_length=1000;open_file();file();send_error_code=19;ready();
        CHECK(sends==1 && attempts==2 && disconnected==1 && file_closes==1);
        ready();CHECK(attempts==2 && file_closes==1);
    } else if(scenario==10) {
        reset(23);make_entries();directory();ble_work_disconnected();ble_work_process(ble_on_disconnected);
        CHECK(dir_closes==1);unsigned before=sends;ready();CHECK(sends==before);
        ble_work_connected();ble_work_process(ble_on_disconnected);sends=0;entry_count=1;directory();finish_stream();
        CHECK(replies[0].chunk==0x8000 && dir_closes==2);
    } else if(scenario==11) {
        reset(23);file_length=1000;open_file();switch_peer_during_read=true;file();
        CHECK(!sends && !attempts && !disconnected && file_closes==1 && ble_work_can_send());
    } else if(scenario==12) {
        reset(23);file_length=1000;open_file();send_error_code=8;disconnect_error=8;file();
        CHECK(attempts==1 && disconnected==1 && file_closes==1 && !ble_work_can_send());
        ready();CHECK(attempts==1);
    } else if(scenario==13) {
        reset(23);make_entries();directory();dir_chunk_state.chunk=0x7fff;ready();
        CHECK(replies[1].chunk==0x7fff && replies[1].status==1 && !replies[1].length && dir_closes==1);
        reset(23);file_length=1000;open_file();file();file_chunk_state.chunk=0x7fff;ready();
        CHECK(replies[1].chunk==0x7fff && replies[1].status==1 && !replies[1].length);
    } else if(scenario==14) {
        reset(23);m_ble_nus_max_data_len=4;directory();CHECK(sends==1 && replies[0].status==1 && !dir_reads && dir_closes==1);
        reset(23);file_length=1000;open_file();m_ble_nus_max_data_len=4;file();CHECK(sends==1 && replies[0].status==1 && !file_offset);
    } else if(scenario==15) {
        reset(23);make_entries();memset(entries[0].name,'x',sizeof(entries[0].name));directory();
        CHECK(sends==1 && replies[0].status==1 && !replies[0].length && dir_closes==1);
    } else if(scenario==16) {
        reset(23);file_length=32;open_file();file();finish_stream();CHECK(sends==3 && !replies[2].length);
        reset(23);file_length=0;open_file();file();finish_stream();CHECK(sends==1 && !replies[0].length);
    } else if(scenario==17) {
        reset(23);request(3,NULL,0);finish_stream();
        const uint8_t cap[]={'P','X','D','F',1,3,243,0,20,0};
        CHECK(merge(actual,sizeof(actual),3)==sizeof(cap) && !memcmp(actual,cap,sizeof(cap)));
        sends=0;request(3,"x",1);CHECK(sends==1 && replies[0].status==1 && !replies[0].length);
    } else if(scenario==18) {
        reset(23);modern();m_df_ctx.cmd_entries[0]=capture_entries;
        for(unsigned i=0;i<243;i++)expected[i]=(uint8_t)(i*7+1);
        fragmented_request(0x77,expected,243);
        CHECK(capture_calls==1 && captured_length==243 && !memcmp(captured,expected,243));
        CHECK(sends==1 && !replies[0].status && !capture_ready);ready();CHECK(capture_ready==1);
        /* An old client still uses a single legacy frame at a larger MTU. */
        reset(250);m_df_ctx.cmd_entries[0]=capture_entries;request(0x77,expected,243);
        CHECK(capture_calls==1 && captured_length==243 && !memcmp(captured,expected,243));
    } else if(scenario==19) {
        for(unsigned bad=0;bad<7;bad++) {
            reset(23);modern();m_df_ctx.cmd_entries[0]=capture_entries;
            packet(0x77,0,0x8000,(const uint8_t*)"1234567890123456",16);
            CHECK(!capture_calls && !sends && !disconnected);
            if(bad==0)packet(0x77,0,2,(const uint8_t*)"x",1);
            if(bad==1)packet(0x77,0,0,(const uint8_t*)"x",1);
            if(bad==2)packet(0x78,0,1,(const uint8_t*)"x",1);
            if(bad==3)packet(0x77,1,1,(const uint8_t*)"x",1);
            if(bad==4)packet(0x77,0,0x8001,NULL,0);
            if(bad==5)packet(0x77,0,1,NULL,0);
            if(bad==6){uint8_t short_header[]={0x77,0,1};CHECK(ble_work_receive(short_header,3));ble_work_process(ble_on_disconnected);}
            CHECK(disconnected==1 && !capture_calls && !sends && !ble_work_can_send());
        }
    } else if(scenario==20) {
        reset(250);modern();m_df_ctx.cmd_entries[0]=capture_entries;
        memset(expected,1,243);packet(0x77,0,0x8000,expected,242);packet(0x77,0,1,expected,2);
        CHECK(disconnected==1 && !capture_calls);
        reset(250);modern();m_df_ctx.cmd_entries[0]=capture_entries;
        packet(0x77,0,0x8000,expected,243);CHECK(disconnected==1 && !capture_calls);
        reset(23);modern();packet(0x77,0,0x8000,NULL,0);CHECK(disconnected==1);
        reset(23);modern();packet(0x77,0,1,expected,1);CHECK(disconnected==1);
    } else if(scenario==21) {
        reset(23);modern();m_df_ctx.cmd_entries[0]=capture_entries;
        packet(0x77,0,0x8000,(const uint8_t*)"x",1);
        clock_tick=9999;ble_df_driver_poll();CHECK(!disconnected);
        clock_tick=10000;ble_df_driver_poll();ble_work_process(ble_on_disconnected);
        CHECK(disconnected==1 && !capture_calls && !ble_work_can_send());
        reset(23);modern();request(1,NULL,0);clock_tick=10000;ble_df_driver_poll();ble_work_process(ble_on_disconnected);
        CHECK(disconnected==1 && sends==1);ready();CHECK(sends==1);
        reset(23);modern();clock_tick=0xffff00;packet(0x77,0,0x8000,(const uint8_t*)"x",1);
        clock_tick=(0xffff00+9999)&0xffffff;ble_df_driver_poll();CHECK(!disconnected);
        clock_tick=(0xffff00+10000)&0xffffff;ble_df_driver_poll();CHECK(disconnected==1);
    } else if(scenario==22) {
        reset(23);modern();m_df_ctx.cmd_entries[0]=capture_entries;
        packet(0x77,0,0x8000,(const uint8_t*)"old",3);
        ble_work_disconnected();ble_work_process(ble_on_disconnected);
        ble_work_connected();ble_work_process(ble_on_disconnected);
        ble_df_driver_enable_framed_rx();
        packet(0x77,0,0,(const uint8_t*)"new",3);
        CHECK(capture_calls==1 && captured_length==3 && !memcmp(captured,"new",3));
        reset(23);modern();m_df_ctx.cmd_entries[0]=capture_entries;
        packet(0x77,0,0x8000,(const uint8_t*)"old",3);
        ble_work_disconnected();ble_work_connected();ble_work_process(ble_on_disconnected);
        ble_df_driver_enable_framed_rx();
        packet(0x77,0,1,(const uint8_t*)"stale",5);
        CHECK(disconnected==1 && !capture_calls);
    } else if(scenario==23) {
        unsigned mtus[]={23,185,250};uint8_t query[]={0,0};
        for(unsigned k=0;k<3;k++) {
            reset(mtus[k]);request(0x1b,query,2);finish_stream();
            CHECK(merge(actual,sizeof(actual),0x1b)==200);
            for(unsigned i=0;i<200;i++)CHECK(actual[i]==(uint8_t)(i*13+9));
        }
    } else if(scenario==24) {
        reset(23);request(2,NULL,0);CHECK(sends==1 && !dfu_calls && !disable_calls);
        ready();CHECK(dfu_calls==1 && disable_calls==1);ready();CHECK(dfu_calls==1);
        reset(23);request(2,NULL,0);ble_work_disconnected();ble_work_process(ble_on_disconnected);
        ready();CHECK(!dfu_calls && !disable_calls);
        reset(23);send_error_code=19;request(2,NULL,0);ready();CHECK(disconnected==1 && !dfu_calls);
    } else if(scenario==25) {
        reset(23);request(1,NULL,0);send_error_code=19;ready();
        CHECK(sends==1 && attempts==2 && disconnected==1);ready();CHECK(attempts==2);
        reset(23);request(2,NULL,0);packet(1,0,0,NULL,0);
        CHECK(disconnected==1 && !dfu_calls);ready();CHECK(!dfu_calls);
    } else if(scenario==26) {
        reset(23);modern();m_df_ctx.cmd_entries[0]=capture_entries;
        packet(0x77,0,0x8000,(const uint8_t*)"a",1);
        clock_tick=9999;packet(0x77,0,0x8001,(const uint8_t*)"b",1);
        clock_tick=19998;packet(0x77,0,2,(const uint8_t*)"c",1);
        CHECK(capture_calls==1 && captured_length==3 && !memcmp(captured,"abc",3) && !disconnected);
        reset(23);modern();packet(0x77,0,0x8000,(const uint8_t*)"a",1);clock_tick=10000;
        packet(0x77,0,1,(const uint8_t*)"b",1);CHECK(disconnected==1 && !capture_calls);
    } else if(scenario==27) {
        reset(23);request(1,NULL,0);
        /* TX completion is queued ahead of the next central request. */
        while(replies[sends-1].chunk&0x8000)ready();
        unsigned before=sends;CHECK(ble_work_tx_ready());
        uint8_t cap[]={3,0,0,0};CHECK(ble_work_receive(cap,sizeof(cap)));ble_work_process(ble_on_disconnected);
        CHECK(sends==before+1 && replies[before].cmd==3 && replies[before].status==0 && !disconnected);
    } else if(scenario==28) {
        printf("{");unsigned mtus[]={23,185,250};
        for(unsigned i=0;i<3;i++) {
            if(i){printf(",");}printf("\"mtu%u\":{",mtus[i]);
            reset(mtus[i]);request(3,NULL,0);finish_stream();print_wire_frames("capability");
            sends=0;request(1,NULL,0);finish_stream();printf(",");print_wire_frames("version");
            sends=0;request(0x10,NULL,0);finish_stream();printf(",");print_wire_frames("drives");
            uint8_t query[]={0,0};sends=0;request(0x1b,query,2);finish_stream();printf(",");print_wire_frames("diagnostic");
            printf("}");
        }
        printf("}\n");return 0;
    } else if(scenario==29) {
        reset(23);modern();open_file();expected[0]=0;
        for(unsigned i=1;i<243;i++)expected[i]=(uint8_t)(i*11+3);
        fragmented_request(0x15,expected,243);
        CHECK(sends==1 && !replies[0].status && write_calls==1 && written_length==242);
        CHECK(!memcmp(written_data,expected+1,242));
        ready();uint8_t id=0;request(0x13,&id,1);CHECK(file_closes==1);
    } else if(scenario==30) {
        /* Documented pre-DE3.10 FILE_WRITE: each physical frame has its own
         * file ID, unlimited logical stream, and only final frame is ACKed. */
        for(unsigned length=3;length<=243;length+=240) {
            reset(250);open_file();expected[0]=0;
            for(unsigned i=1;i<length;i++)expected[i]=(uint8_t)(i*11+3);
            packet(0x15,0,0x8000,expected,length);
            CHECK(!sends && write_calls==1 && written_length==length-1 && !disconnected);
            packet(0x15,0,1,expected,length);
            CHECK(sends==1 && !replies[0].status && write_calls==2 && written_length==2*(length-1));
            CHECK(!memcmp(written_data,expected+1,length-1) && !memcmp(written_data+length-1,expected+1,length-1));
        }
        reset(250);modern();CHECK(m_framed_rx);
        ble_work_disconnected();ble_work_connected();ble_work_process(ble_on_disconnected);
        CHECK(!m_framed_rx);open_file();uint8_t first[]={0,0x41},last[]={0,0x42};
        packet(0x15,0,0x8000,first,2);CHECK(!sends && write_calls==1);
        packet(0x15,0,1,last,2);CHECK(sends==1 && written_length==2 && !memcmp(written_data,"AB",2));
        reset(23);request(3,"x",1);CHECK(!m_framed_rx && replies[0].status==1);
        reset(23);packet(3,0,1,NULL,0);CHECK(!m_framed_rx && replies[0].status==1);
    } else return 2;
    CHECK(!critical_depth);printf("PASS BLE MTU scenario %u\n",scenario);return 0;
}
