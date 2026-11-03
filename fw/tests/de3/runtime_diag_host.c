static uint16_t get16(const uint8_t *p) { return (uint16_t)p[0] | (uint16_t)p[1] << 8; }
static uint32_t get32(const uint8_t *p) {
    return (uint32_t)p[0] | (uint32_t)p[1] << 8 | (uint32_t)p[2] << 16 | (uint32_t)p[3] << 24;
}
static void diagnostic(uint8_t *out) {
    sends = attempts = 0;
    request(6, NULL, 0);
    finish_stream();
    CHECK(merge(out,64,6)==64 && !memcmp(out,"PXDG",4) && out[4]==1 && out[5]==64);
    CHECK(out[10]==0 && out[11]==0 && !(out[6]&8) && get32(out+52)==UINT32_MAX);
}
static int32_t operation_error;
static int32_t failing_noargs(void) { return operation_error; }
static int32_t failing_path(const char *p) { (void)p; return operation_error; }
static int32_t failing_rename(const char *a,const char *b) { (void)a;(void)b;return operation_error; }
static int32_t failing_meta(const char *p,void *m,size_t n) { (void)p;(void)m;(void)n;return operation_error; }
static int32_t successful_stat_file(const char *p,vfs_obj_t *o) { (void)p;memset(o,0,sizeof(*o));o->type=VFS_TYPE_REG;return 0; }
static void assert_vfs_error(uint8_t command,const void *data,size_t size,int32_t expected) {
    uint8_t out[64]; sends=attempts=0;request(command,data,size);finish_stream();
    CHECK(replies[0].cmd==command && replies[0].status==1 && !replies[0].length);
    diagnostic(out);CHECK(out[9]==command && (int32_t)get32(out+20)==expected);
}
int main(int argc,char **argv) {
    CHECK(argc==3); unsigned scenario=(unsigned)strtoul(argv[1],NULL,10);
    unsigned mtu=(unsigned)strtoul(argv[2],NULL,10);
    driver=(vfs_driver_t){.stat=mock_stat,.open_file=mock_open,.close_file=mock_close,
        .read_file=mock_read,.write_file=mock_write,.open_dir=mock_open_dir,.read_dir=mock_read_dir,
        .close_dir=mock_close_dir};
    uint8_t out[64],before[64];
    reset(mtu); modern();
    if (scenario==0) {
        diagnostic(out);
        CHECK(!(out[6]&3) && get32(out+24)==0 && get32(out+28)==UINT32_MAX);
        CHECK(get32(out+48)==UINT32_MAX && get32(out+56)==0);
        mui_mem_init(); diagnostic(out); CHECK((out[6]&3)==3);
        CHECK(get32(out+40)==MUI_MEM_BUFF_SIZE && get32(out+24)>0);
        uint32_t samples=get32(out+56);
        for(unsigned field=0;field<3;field++) {
            df_frame_t invalid={0};
            if(field==0)invalid.length=1;
            if(field==1)invalid.status=1;
            if(field==2)invalid.chunk=1;
            df_event_t event={.type=DF_EVENT_DATA_RECEVIED,.df=&invalid};
            sends=attempts=0;
            df_proto_handler_info_runtime_diagnostic(&event);
            CHECK(sends==1 && replies[0].status==1 && !replies[0].length); finish_stream();
        }
        diagnostic(out); CHECK(get32(out+56)==samples+1);
        unsigned count=sends; df_event_t ready_event={.type=DF_EVENT_DATA_TRANSMIT_READY,.df=NULL};
        df_proto_handler_info_runtime_diagnostic(&ready_event);CHECK(sends==count);
        memset(out,0xa5,sizeof(out)); CHECK(!runtime_diag_snapshot(out,63));
        for(unsigned i=0;i<64;i++) CHECK(out[i]==0xa5);
        CHECK(!runtime_diag_snapshot(NULL,64));
    } else if(scenario==1) {
        mui_mem_init(); diagnostic(before);
        void *p=mui_mem_malloc(123); CHECK(p); memset(p,0x5a,123);
        size_t block=tlsf_block_size(p); diagnostic(out);
        CHECK(get32(out+44)==block && get32(out+24)<get32(before+24));
        uint32_t low=get32(out+28),samples=get32(out+56);
        void *failed=mui_mem_realloc(p,MUI_MEM_BUFF_SIZE*2);CHECK(!failed);
        for(unsigned i=0;i<123;i++)CHECK(((uint8_t*)p)[i]==0x5a);
        diagnostic(out);CHECK(get16(out+18)==1 && get32(out+44)==block);
        p=mui_mem_realloc(p,500);CHECK(p); block=tlsf_block_size(p);diagnostic(out);
        CHECK(get32(out+44)==block && get32(out+28)<low);
        p=mui_mem_realloc(p,32);CHECK(p);mui_mem_free(p);
        CHECK(!mui_mem_malloc(MUI_MEM_BUFF_SIZE*2));
        /* Real allocations between snapshots: payload high-water observes them,
         * sampled free minima honestly need not observe the short-lived peak. */
        p=mui_mem_malloc(3000);CHECK(p); block=tlsf_block_size(p); mui_mem_free(p);
        diagnostic(out);CHECK(get16(out+18)==2 && get32(out+44)==block);
        CHECK(get32(out+24)==get32(before+24) && get32(out+28)<get32(before+24));
        CHECK(get32(out+56)==samples+3);
        p=mui_mem_realloc(NULL,128);CHECK(p); CHECK(!mui_mem_realloc(p,0));
        mui_mem_free(NULL); diagnostic(out); CHECK(get16(out+18)==2);
        mui_mem_deinit(); diagnostic(out); CHECK(!(out[6]&1) && (out[6]&2));
        mui_mem_init(); p=mui_mem_malloc(40); CHECK(p); mui_mem_free(p);
        CHECK(state.allocated==0);
    } else if(scenario==2) {
        uint8_t frame[4]={1,0,0,0};
        for(unsigned i=0;i<BLE_WORK_CAPACITY;i++)CHECK(ble_work_receive(frame,4));
        CHECK(!ble_work_receive(frame,4));
        df_frame_t stale_reply={.cmd=1}; df_core_send_frame(&stale_reply);
        reset(mtu);modern();diagnostic(out);
        CHECK(out[7]==RUNTIME_DIAG_QUEUE_OVERFLOW && get16(out+14)==1);
        uint8_t byte=0; packet(6,0,0x8000,&byte,1);clock_tick+=10000;ble_df_driver_poll();
        reset(mtu);modern();diagnostic(out);CHECK(out[7]==RUNTIME_DIAG_FRAGMENT_TIMEOUT && get16(out+16)==1);
        ble_on_received_data(NULL,0);reset(mtu);modern();diagnostic(out);CHECK(out[7]==RUNTIME_DIAG_PROTOCOL);
        send_error_code=19;request(1,NULL,0);reset(mtu);modern();diagnostic(out);CHECK(out[7]==RUNTIME_DIAG_TX_FAILURE);
        runtime_diag_ble_abort(RUNTIME_DIAG_GATT_CLIENT_TIMEOUT);
        runtime_diag_ble_abort(RUNTIME_DIAG_GATT_SERVER_TIMEOUT);
        runtime_diag_ble_disconnected(0x08);diagnostic(out);
        CHECK(out[7]==6 && out[8]==0x08 && (out[6]&32) && get16(out+12)==1 && get16(out+16)==3);
    } else if(scenario==3) {
        open_error=VFS_ERR_NOSPC;
        const uint8_t data[]={4,0,'E',':','/','x',18};
        sends=0; request(0x12,data,sizeof(data)); CHECK(replies[0].status==1 && !replies[0].length);finish_stream();
        diagnostic(out);CHECK((out[6]&64) && out[9]==0x12 && (int32_t)get32(out+20)==VFS_ERR_NOSPC);
        open_error=0;open_file();write_error=VFS_ERR_CRPT;
        const uint8_t write_data[]={0,1,2,3};sends=0;request(0x15,write_data,sizeof(write_data));finish_stream();
        CHECK(replies[0].status==1 && !replies[0].length);
        diagnostic(out);CHECK(out[9]==0x15 && (int32_t)get32(out+20)==VFS_ERR_CRPT);
        write_error=0; uint8_t id=0;request(0x13,&id,1);finish_stream();
        diagnostic(before);CHECK((int32_t)get32(before+20)==VFS_ERR_CRPT);
        /* Invalid OPEN must preserve the wire ERR contract and record syntax. */
        sends=0;request(0x12,NULL,0);finish_stream();CHECK(replies[0].status==1 && !replies[0].length);
        diagnostic(out);CHECK((int32_t)get32(out+20)==RUNTIME_DIAG_BAD_REQUEST);
        CHECK(get32(out+60)>get32(before+60));
    } else if(scenario==4) {
        for(unsigned i=0;i<65537;i++) {
            runtime_diag_ble_abort(RUNTIME_DIAG_QUEUE_OVERFLOW);
            runtime_diag_ble_abort(RUNTIME_DIAG_FRAGMENT_TIMEOUT);
            runtime_diag_ble_disconnected(0x13);
            runtime_diag_heap_change(0,0,true);
        }
        state.vfs_errors=UINT32_MAX;runtime_diag_vfs_error(0x12,-91);
        state.samples=UINT32_MAX; runtime_diag_heap_sample(100,50,25);
        diagnostic(out);
        for(unsigned offset=12;offset<=18;offset+=2)CHECK(get16(out+offset)==UINT16_MAX);
        CHECK(get32(out+56)==UINT32_MAX && get32(out+60)==UINT32_MAX);
        CHECK(!critical_depth);
    } else if(scenario==5) {
        const uint8_t path[]={4,0,'E',':','/','x'};
        const uint8_t rename[]={4,0,'E',':','/','x',4,0,'E',':','/','y'};
        const uint8_t meta[]={4,0,'E',':','/','x',0};
        driver.format=failing_noargs;driver.mount=failing_noargs;driver.create_dir=failing_path;
        driver.stat_file=successful_stat_file;driver.remove_file=failing_path;driver.rename_file=failing_rename;
        driver.update_file_meta=failing_meta;
        uint8_t drive='E';operation_error=VFS_ERR_CRPT;assert_vfs_error(0x11,&drive,1,operation_error);
        operation_error=VFS_ERR_OBJEX;assert_vfs_error(0x17,path,sizeof(path),operation_error);
        operation_error=VFS_ERR_NOOBJ;assert_vfs_error(0x18,path,sizeof(path),operation_error);
        operation_error=VFS_ERR_MAXNM;assert_vfs_error(0x19,rename,sizeof(rename),operation_error);
        operation_error=VFS_ERR_NOSPC;assert_vfs_error(0x1a,meta,sizeof(meta),operation_error);
        fail_read=true;assert_vfs_error(0x16,path,sizeof(path),VFS_ERR_FAIL);fail_read=false;
        open_file();fail_read=true;uint8_t id=0;assert_vfs_error(0x14,&id,1,VFS_ERR_FAIL);fail_read=false;
        close_error=VFS_ERR_NOSPC;assert_vfs_error(0x13,&id,1,close_error);close_error=0;
        sends=0;request(0x13,&id,1);finish_stream();
        assert_vfs_error(0x13,&id,1,RUNTIME_DIAG_BAD_STATE);
        const uint8_t missing_drive[]={4,0,'I',':','/','x',8};
        assert_vfs_error(0x12,missing_drive,sizeof(missing_drive),VFS_ERR_NODEV);
    } else if(scenario==6) {
        memset(out,0xa5,sizeof(out));
        CHECK(!runtime_diag_power_snapshot(NULL,16));
        CHECK(!runtime_diag_power_snapshot(out,15));
        for(unsigned i=0;i<64;i++) CHECK(out[i]==0xa5);
        CHECK(runtime_diag_power_snapshot(out,16));
        CHECK(!memcmp(out,"PXPD",4) && out[4]==1 && out[5]==16 && out[6]==0 && out[7]==0);
        for(unsigned i=16;i<64;i++)CHECK(out[i]==0xa5);
        runtime_diag_boot_capture(0x00050002);
        runtime_diag_boot_capture(0); /* Application must preserve its first observation. */
        runtime_diag_power_sample(4210,true,true,true,180);
        CHECK(runtime_diag_power_snapshot(out,16));
        CHECK(out[6]==31 && get32(out+8)==0x00050002 && get16(out+12)==4210 && get16(out+14)==180);
        /* A failed ADC sample cannot present its old voltage/charge as current. */
        runtime_diag_power_sample(4210,false,true,true,15);
        CHECK(runtime_diag_power_snapshot(out,16));
        CHECK(out[6]==11 && get16(out+12)==0 && get16(out+14)==15 && get32(out+8)==0x00050002);
        runtime_diag_power_sample(2990,true,false,true,65535);
        CHECK(runtime_diag_power_snapshot(out,16));
        CHECK(out[6]==7 && get16(out+12)==2990 && get16(out+14)==65535);
        CHECK(!critical_depth);
    } else if(scenario==7) {
        /* Exercise the real dispatcher and MTU23 framing with the optional query. */
        runtime_diag_boot_capture(0); /* Observed zero is distinct from unavailable. */
        runtime_diag_power_sample(4001,true,true,false,180);
        sends=attempts=0;request(8,NULL,0);finish_stream();
        CHECK(merge(out,16,8)==16 && out[6]==15 && get32(out+8)==0 && get16(out+12)==4001);
        memcpy(before,out,16);
        for(unsigned field=0;field<3;field++) {
            df_frame_t invalid={0};
            if(field==0)invalid.length=1;
            if(field==1)invalid.status=1;
            if(field==2)invalid.chunk=1;
            df_event_t event={.type=DF_EVENT_DATA_RECEVIED,.df=&invalid};
            sends=attempts=0;df_proto_handler_info_power_diagnostic(&event);
            CHECK(sends==1 && replies[0].status==1 && !replies[0].length);finish_stream();
        }
        unsigned count=sends;df_event_t ready_event={.type=DF_EVENT_DATA_TRANSMIT_READY,.df=NULL};
        df_proto_handler_info_power_diagnostic(&ready_event);CHECK(sends==count);
        CHECK(runtime_diag_power_snapshot(out,16) && !memcmp(out,before,16));
        diagnostic(out); /* Original 64-byte PXDG v1 still works unmodified. */
    } else if(scenario==8) {
        memset(out,0xa5,sizeof(out));
        CHECK(!runtime_diag_startup_snapshot(NULL,32));
        CHECK(!runtime_diag_startup_snapshot(out,31));
        for(unsigned i=0;i<64;i++)CHECK(out[i]==0xa5);
        CHECK(runtime_diag_startup_snapshot(out,32));
        CHECK(!memcmp(out,"PXST",4) && out[4]==1 && out[5]==32 && !out[6] && !out[7]);
        for(unsigned i=32;i<64;i++)CHECK(out[i]==0xa5);
        runtime_diag_startup_mark(6,100);
        runtime_diag_startup_mark(UINT32_MAX,100);
        runtime_diag_startup_mark(1,100); /* Cannot invent phase zero. */
        runtime_diag_startup_mark(0,1); /* Origin must be zero. */
        CHECK(runtime_diag_startup_snapshot(out,32) && !out[6]);
        runtime_diag_startup_mark(0,0);
        runtime_diag_startup_mark(1,4500);
        runtime_diag_startup_mark(1,9999); /* Repeated calls cannot overwrite. */
        runtime_diag_startup_mark(2,4499); /* Reversed/wrapped observation rejected. */
        CHECK(runtime_diag_startup_snapshot(out,32) && out[6]==3 && get32(out+12)==4500);
        runtime_diag_startup_mark(2,4500);
        runtime_diag_startup_mark(3,4600);
        runtime_diag_startup_mark(4,4700);
        runtime_diag_startup_mark(5,UINT32_MAX);
        CHECK(runtime_diag_startup_snapshot(out,32) && out[6]==63 && !out[7]);
        CHECK(get32(out+8)==0 && get32(out+12)==4500 && get32(out+16)==4500 &&
              get32(out+20)==4600 && get32(out+24)==4700 && get32(out+28)==UINT32_MAX);
        CHECK(!critical_depth);
    } else if(scenario==9) {
        for(unsigned phase=0;phase<6;phase++)runtime_diag_startup_mark(phase,phase*100);
        sends=attempts=0;request(9,NULL,0);finish_stream();
        CHECK(merge(out,32,9)==32 && !memcmp(out,"PXST",4) && out[6]==63 && get32(out+28)==500);
        memcpy(before,out,32);
        for(unsigned field=0;field<3;field++) {
            df_frame_t invalid={0};
            if(field==0)invalid.length=1;
            if(field==1)invalid.status=1;
            if(field==2)invalid.chunk=1;
            df_event_t event={.type=DF_EVENT_DATA_RECEVIED,.df=&invalid};
            sends=attempts=0;df_proto_handler_info_startup_diagnostic(&event);
            CHECK(sends==1 && replies[0].status==1 && !replies[0].length);finish_stream();
        }
        unsigned count=sends;df_event_t ready_event={.type=DF_EVENT_DATA_TRANSMIT_READY,.df=NULL};
        df_proto_handler_info_startup_diagnostic(&ready_event);CHECK(sends==count);
        CHECK(runtime_diag_startup_snapshot(out,32) && !memcmp(out,before,32));
        diagnostic(out); /* Existing diagnostic wire contract remains intact. */
    } else CHECK(false);
    if(scenario==3) {
        printf("WIRE ");for(unsigned i=0;i<64;i++)printf("%02x",out[i]);printf("\n");
    }
    printf("PASS runtime diagnostic scenario %u MTU%u\n",scenario,mtu);
    return 0;
}
