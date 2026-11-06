/* Exact PackedFS + VFS adapter on synthetic NOR, including interrupted writes. */
#define main original_contract_main
#include CONTRACT
#undef main
#include PROTOCOL
static df_frame_t answer;
void runtime_diag_vfs_error(uint8_t command,int32_t error){(void)command;(void)error;}
/* Diagnostics are outside this old atomic-data test's scope. */
void runtime_diag_mount_begin(void){}
void runtime_diag_mount_configured(uint32_t ms){(void)ms;}
void runtime_diag_mount_complete(int32_t result,uint32_t ms,bool cache){(void)result;(void)ms;(void)cache;}
void runtime_diag_mount_cache(bool hit,bool eligible){(void)hit;(void)eligible;}
void runtime_diag_mount_read(uint32_t bytes,bool success){(void)bytes;(void)success;}

void df_core_send_frame(df_frame_t *frame){answer=*frame;}
size_t df_core_max_payload(void){return DF_PAYLOAD_LEN;}
bool vfs_drive_enabled(vfs_drive_t drive){return drive==VFS_DRIVE_EXT;}
vfs_driver_t *vfs_get_driver(vfs_drive_t drive){REQUIRE(drive==VFS_DRIVE_EXT);return driver();}
void ble_disable(void){}
static bool reset_reserved;
bool system_prepare_reset(void){reset_reserved=true;return true;}
bool system_reset_prepared(void){return reset_reserved;}
void system_cancel_reset(void){reset_reserved=false;}
bool system_reboot(void){reset_reserved=false;return true;}
int32_t vfs_packed_layout(uint8_t drive,uint8_t out[72]){(void)drive;(void)out;return VFS_ERR_UNSUPT;}
void vfs_packed_import_status(uint8_t drive,uint8_t out[40]){(void)drive;memset(out,0,40);}
static uint8_t replacement_meta[128];
static unsigned atomic_cases, interrupted_cases;
static void send_request(df_frame_t *f){df_event_t e={.type=DF_EVENT_DATA_RECEVIED,.df=f};
    for(const df_cmd_entry_t *p=df_proto_handler_vfs_entries;p->handler;p++)if(p->cmd==f->cmd){p->handler(&e);return;}
    REQUIRE(0);
}
static df_frame_t open_request(bool atomic,bool wide){
    df_frame_t f={.cmd=DF_PROTO_CMD_VFS_FILE_OPEN};const char *path="E:/saved";
    size_t n=strlen(path);f.data[0]=n;memcpy(f.data+2,path,n);f.length=n+2;
    f.data[f.length++]=VFS_MODE_WRITEONLY|VFS_MODE_CREATE|VFS_MODE_TRUNC;
    if(wide)f.length+=3;
    if(atomic){memcpy(f.data+f.length,replacement_meta,128);f.length+=128;}
    return f;
}
static unsigned exact_state(void);
static void protocol(void){
    for(unsigned variant=0;variant<3;variant++){
        reset_baseline();df_frame_t f=open_request(variant==2,variant==1);send_request(&f);REQUIRE(answer.status==0);
        df_frame_t write={.cmd=DF_PROTO_CMD_VFS_FILE_WRITE,.length=201};memcpy(write.data+1,new_data,200);send_request(&write);REQUIRE(answer.status==0);
        df_frame_t close={.cmd=DF_PROTO_CMD_VFS_FILE_CLOSE,.length=1};send_request(&close);REQUIRE(answer.status==0);
        REQUIRE(driver()->read_file_data("/saved",check,sizeof(check))==200&&!memcmp(check,new_data,200));
        vfs_obj_t obj;REQUIRE(driver()->stat_file("/saved",&obj)==0);REQUIRE(!memcmp(obj.meta,variant==2?replacement_meta:meta,128));atomic_cases++;
    }
    for(unsigned variant=0;variant<6;variant++){
        reset_baseline();df_frame_t f=open_request(true,false);send_request(&f);REQUIRE(answer.status==0);
        df_frame_t write={.cmd=DF_PROTO_CMD_VFS_FILE_WRITE,.length=201};memcpy(write.data+1,new_data,200);send_request(&write);REQUIRE(answer.status==0);
        if(variant==0){df_proto_vfs_cleanup();}
        if(variant==1){f=open_request(true,false);send_request(&f);REQUIRE(answer.status==0);df_proto_vfs_cleanup();}
        if(variant==2){f=open_request(true,false);--f.length;send_request(&f);REQUIRE(answer.status==DF_STATUS_ERR);REQUIRE(file_chunk_state.opened);df_proto_vfs_cleanup();}
        if(variant==3){f=open_request(true,false);f.data[2]='I';send_request(&f);REQUIRE(answer.status==DF_STATUS_ERR);df_proto_vfs_cleanup();}
        if(variant==4){
            nor_arm(&media,NOR_RETURN_IO_BEFORE,1,NULL);
            for(unsigned i=0;i<8&&answer.status==0;i++)send_request(&write);
            REQUIRE(media.fault_triggered&&answer.status==DF_STATUS_ERR);nor_disarm(&media);
            df_frame_t close={.cmd=DF_PROTO_CMD_VFS_FILE_CLOSE,.length=1};send_request(&close);REQUIRE(answer.status==DF_STATUS_ERR);
        }
        if(variant==5){df_frame_t read={.cmd=DF_PROTO_CMD_VFS_FILE_READ,.length=1};send_request(&read);REQUIRE(answer.status==DF_STATUS_ERR);df_proto_vfs_cleanup();}
        REQUIRE(vfs_packed_handles_idle());drop();REQUIRE(driver()->mount()==0);REQUIRE(exact_state()==0);atomic_cases++;
    }
    reset_baseline();df_frame_t info={.cmd=DF_PROTO_CMD_VFS_STORAGE_INFO,.length=1,.data={'E'}};send_request(&info);
    REQUIRE(answer.status==0&&answer.length==8&&answer.data[4]==7);
    info.length=2;info.data[1]=1;send_request(&info);REQUIRE(answer.status==0&&answer.data[4]==15);
    info.data[1]=2;send_request(&info);REQUIRE(answer.status==DF_STATUS_ERR);atomic_cases++;
}
static int replacement(void) {
    vfs_file_t f={0};
    int r=driver()->open_file("/saved",&f,VFS_MODE_WRITEONLY|VFS_MODE_TRUNC|VFS_MODE_CREATE);
    if(!r)r=vfs_packed_stage_meta(&f,replacement_meta);
    if(!r){r=driver()->write_file(&f,new_data,2048);if(r==2048)r=0;}
    if(!r)r=driver()->close_file(&f);
    if(r)REQUIRE(driver()->abort_file(&f)==0);
    return r;
}
static unsigned exact_state(void) {
    REQUIRE(driver()->read_file_data("/saved",check,sizeof(check))==2048);
    vfs_obj_t obj;REQUIRE(driver()->stat_file("/saved",&obj)==0);
    if(!memcmp(check,old_data,2048)){REQUIRE(!memcmp(obj.meta,meta,128));return 0;}
    REQUIRE(!memcmp(check,new_data,2048));REQUIRE(!memcmp(obj.meta,replacement_meta,128));return 1;
}
static void crash_ram(void) {
    /* Simulated reset: discard RAM without flushing or closing a file. */
    for(unsigned i=0;i<128;i++)if(owners[i])mui_mem_free(owners[i]);
    store=NULL;vfs_persist_unmounted(driver());REQUIRE(live==0);
}
static void lifecycle(void) {
    reset_baseline();uint64_t old=vfs_packed_revision();REQUIRE(old);
    vfs_file_t f={0};size_t initial=live;
    REQUIRE(vfs_packed_stage_meta(NULL,replacement_meta)<0);
    REQUIRE(driver()->open_file("/saved",&f,VFS_MODE_READONLY)==0);
    REQUIRE(vfs_packed_stage_meta(&f,replacement_meta)<0);REQUIRE(driver()->close_file(&f)==0);
    REQUIRE(driver()->open_file("/saved",&f,VFS_MODE_WRITEONLY|VFS_MODE_TRUNC|VFS_MODE_CREATE)==0);
    REQUIRE(vfs_packed_stage_meta(&f,NULL)<0);REQUIRE(vfs_packed_stage_meta(&f,replacement_meta)==0);
    REQUIRE(driver()->write_file(&f,new_data,2048)==2048);
    REQUIRE(exact_state()==0);REQUIRE(vfs_packed_revision()==old);
    REQUIRE(driver()->abort_file(&f)==0);REQUIRE(exact_state()==0);REQUIRE(live==initial);
    REQUIRE(replacement()==0);REQUIRE(exact_state()==1);REQUIRE(vfs_packed_revision()!=old);
    old=vfs_packed_revision();drop();REQUIRE(vfs_packed_revision()==0);
    REQUIRE(driver()->mount()==0);REQUIRE(vfs_packed_revision()!=old);REQUIRE(exact_state()==1);
    old=vfs_packed_revision();REQUIRE(driver()->create_dir("/folder")==0);REQUIRE(vfs_packed_revision()!=old);
    old=vfs_packed_revision();REQUIRE(driver()->update_file_meta("/folder",meta,128)==0);REQUIRE(vfs_packed_revision()!=old);
    old=vfs_packed_revision();REQUIRE(driver()->rename_dir("/folder","/moved")==0);REQUIRE(vfs_packed_revision()!=old);
    old=vfs_packed_revision();REQUIRE(driver()->remove_dir("/moved")==0);REQUIRE(vfs_packed_revision()!=old);
    store->poisoned=true;REQUIRE(vfs_packed_revision()==0);store->poisoned=false;
    atomic_cases+=14;
}
static void faults(void) {
    reset_baseline();nor_reset_observation(&media);REQUIRE(replacement()==0);
    unsigned events=media.stats.event_count;REQUIRE(events>2&&events<1000);
    for(unsigned mode=NOR_CUT_AFTER;mode<=NOR_RETURN_IO_BEFORE;mode++) {
        for(volatile unsigned nth=1;nth<=events;nth++) {
            reset_baseline();jmp_buf jump;
            if(!setjmp(jump)) {
                nor_arm(&media,(enum nor_fault_mode)mode,nth,&jump);
                int r=replacement();
                REQUIRE(mode==NOR_RETURN_IO_BEFORE);REQUIRE(r<0 || pfs_poisoned(store));
            }
            REQUIRE(media.fault_triggered);nor_disarm(&media);crash_ram();
            REQUIRE(driver()->mount()==0);exact_state();interrupted_cases++;
        }
    }
    reset_baseline();alloc_calls=0;REQUIRE(replacement()==0);unsigned allocs=alloc_calls;
    for(unsigned nth=1;nth<=allocs;nth++) {
        reset_baseline();alloc_calls=0;fail_at=nth;REQUIRE(replacement()<0);fail_at=0;
        REQUIRE(vfs_packed_handles_idle());drop();REQUIRE(driver()->mount()==0);exact_state();atomic_cases++;
    }
}
static nor_stats_t imported(bool combined) {
    reset_baseline();nor_reset_observation(&media);
    for(unsigned i=0;i<100;i++) {
        char path[32];snprintf(path,sizeof(path),"/amiibo%03u",i);
        vfs_file_t f={0};REQUIRE(driver()->open_file(path,&f,VFS_MODE_WRITEONLY|VFS_MODE_CREATE|VFS_MODE_TRUNC)==0);
        if(combined)REQUIRE(vfs_packed_stage_meta(&f,replacement_meta)==0);
        REQUIRE(driver()->write_file(&f,new_data,540)==540);REQUIRE(driver()->close_file(&f)==0);
        if(!combined)REQUIRE(driver()->update_file_meta(path,replacement_meta,128)==0);
    }
    nor_stats_t stats=media.stats;drop();REQUIRE(driver()->mount()==0);
    for(unsigned i=0;i<100;i++) {
        char path[32];snprintf(path,sizeof(path),"/amiibo%03u",i);vfs_obj_t obj;
        REQUIRE(driver()->stat_file(path,&obj)==0);REQUIRE(obj.size==540&&!memcmp(obj.meta,replacement_meta,128));
        REQUIRE(driver()->read_file_data(path,check,sizeof(check))==540);REQUIRE(!memcmp(check,new_data,540));
    }
    return stats;
}
int main(int argc,char **argv) {
    for(unsigned i=0;i<2048;i++){old_data[i]=(uint8_t)(i*7+3);new_data[i]=(uint8_t)(i*13+5);}
    for(unsigned i=0;i<128;i++){meta[i]=(uint8_t)(i*9+17);replacement_meta[i]=(uint8_t)(i*11+19);}
    baseline();lifecycle();protocol();faults();nor_stats_t before=imported(false),after=imported(true);
    if(argc==2){FILE *f=fopen(argv[1],"wb");REQUIRE(f);REQUIRE(fwrite(media.disk,1,NOR_BYTES,f)==NOR_BYTES);REQUIRE(fclose(f)==0);}
    drop();
    REQUIRE(after.programs<before.programs);REQUIRE(after.erases<before.erases);REQUIRE(live==0);
    printf("{\"passed\":true,\"atomicCases\":%u,\"interruptedCases\":%u,\"pointerBytes\":%zu,\"peakRequestedHeap\":%zu,\"liveAtEnd\":%zu,\"separatePrograms\":%llu,\"combinedPrograms\":%llu,\"separateErases\":%llu,\"combinedErases\":%llu}\n",atomic_cases,interrupted_cases,sizeof(void*),peak,live,(unsigned long long)before.programs,(unsigned long long)after.programs,(unsigned long long)before.erases,(unsigned long long)after.erases);
    puts("PASS staged raw128, old-or-new data plus metadata, revision invalidation, failed allocation and interrupted NOR operations;100 imports");
    return 0;
}
