/* Runs in the actual protocol / PackedFS / LittleFS NOR integration fixture. */
#include "mbedtls/sha256.h"
void mbedtls_platform_zeroize(void *bytes, size_t n) {
    volatile uint8_t *p=bytes; while(n--) *p++=0;
}

static const char work_path[] = "E:/~u12345678";
static const char file_path[] = "E:/~u12345678/a.bin";
static void (*timer_callback)(void *);
static void *timer_context;
static bool recovery_mode;
bool vfs_packed_recovery_required(void) { return recovery_mode; }
int app_timer_create(unsigned *timer, unsigned mode, void (*callback)(void *)) {
    REQUIRE(mode == APP_TIMER_MODE_SINGLE_SHOT);
    *timer = 1; timer_callback = callback; return 0;
}
int app_timer_start(unsigned timer, unsigned ticks, void *context) {
    REQUIRE(timer == 1 && ticks == 30000 && !timer_context);
    timer_context = context; return 0;
}
int app_timer_stop(unsigned timer) { REQUIRE(timer == 1); timer_context = NULL; return 0; }

static uint64_t small_caps(void) {
    df_frame_t req = {.cmd=DF_PROTO_CMD_VFS_SMALL_CAP};
    send_request(&req);
    REQUIRE(answer.status == 0 && answer.length == 16 && !memcmp(answer.data, "PXSC\1", 5) && (answer.data[5] & 3) == 3);
    uint16_t size; uint64_t revision;
    memcpy(&size, answer.data + 6, 2); memcpy(&revision, answer.data + 8, 8);
    REQUIRE(size == 572 && revision == vfs_packed_revision() && revision != 0);
    return revision;
}
static uint64_t small_baseline(void) {
    reset_baseline();
    REQUIRE(driver()->create_dir(work_path + 2) == 0);
    return small_caps();
}
static df_frame_t small_start_at(const char *path, uint16_t size, uint64_t revision, uint16_t first) {
    uint32_t id = 0x803105ac;
    uint16_t path_length = (uint16_t)strlen(path);
    df_frame_t f = {.cmd=DF_PROTO_CMD_VFS_SMALL_CREATE, .length=49 + path_length + first};
    REQUIRE(size <= sizeof(new_data) && first <= size && f.length <= 243);
    memcpy(f.data + 1, &id, 4); memcpy(f.data + 5, &revision, 8); memcpy(f.data + 13, &size, 2);
    REQUIRE(mbedtls_sha256_ret(new_data, size, f.data+15, 0) == 0);
    memcpy(f.data + 47, &path_length, 2); memcpy(f.data + 49, path, path_length);
    memcpy(f.data + 49 + path_length, new_data, first); return f;
}
static df_frame_t small_cont(uint16_t offset, uint16_t count) {
    uint32_t id = 0x803105ac;
    df_frame_t f = {.cmd=DF_PROTO_CMD_VFS_SMALL_CREATE, .length=7 + count, .data={1}};
    REQUIRE(count <= 236 && offset + count <= sizeof(new_data));
    memcpy(f.data + 1, &id, 4); memcpy(f.data + 5, &offset, 2); memcpy(f.data + 7, new_data+offset, count);
    return f;
}
static void partial(uint16_t at) {
    uint16_t acknowledged;
    memcpy(&acknowledged, answer.data+1, 2);
    REQUIRE(!answer.status && answer.length == 3 && !answer.data[0] && acknowledged == at);
    REQUIRE(!df_proto_vfs_is_idle() && !df_proto_vfs_file_transfer_closed());
}
static void small_publish_at(const char *source, const char *target, uint64_t revision) {
    uint16_t a = strlen(source), b = strlen(target);
    df_frame_t f = {.cmd=DF_PROTO_CMD_VFS_SMALL_CREATE, .length=13+a+b, .data={3}};
    memcpy(f.data+1,&revision,8); memcpy(f.data+9,&a,2); memcpy(f.data+11,source,a);
    memcpy(f.data+11+a,&b,2); memcpy(f.data+13+a,target,b);
    send_request(&f);
}
static int32_t corrupt_readback(const char *name, void *bytes, size_t max_size) {
    int32_t count = driver()->read_file_data(name, bytes, max_size);
    if (count > 0) ((uint8_t *)bytes)[0] ^= 1;
    return count;
}
static df_frame_t small_prepare_commit(void) {
    df_frame_t f=small_start_at(file_path,540,small_baseline(),167);
    send_request(&f);partial(167);
    f=small_cont(167,236);send_request(&f);partial(403);
    return small_cont(403,137);
}
static unsigned small_fault_sweep(bool publishing) {
    df_frame_t last=small_prepare_commit();
    if(publishing){send_request(&last); REQUIRE(answer.status==0);}
    nor_reset_observation(&media);
    if(publishing) small_publish_at(work_path,"E:/Visible",small_caps());
    else send_request(&last);
    unsigned events=media.stats.event_count, checks=0;
    REQUIRE(answer.status==0 && events>2 && events<200);
    for(unsigned mode=NOR_CUT_AFTER; mode<=NOR_RETURN_IO_BEFORE; ++mode) {
        for(volatile unsigned nth=1; nth<=events; ++nth) {
            last=small_prepare_commit();
            if(publishing){send_request(&last); REQUIRE(answer.status==0);}
            uint64_t expected=vfs_packed_revision();
            jmp_buf jump;
            if(!setjmp(jump)){
                nor_arm(&media,(enum nor_fault_mode)mode,nth,&jump);
                if(publishing) small_publish_at(work_path,"E:/Visible",expected);
                else send_request(&last);
                REQUIRE(mode==NOR_RETURN_IO_BEFORE);
            }
            REQUIRE(media.fault_triggered); nor_disarm(&media);
            /* Hardware reset drops every RAM-owned stage, descriptor and timer. */
            df_small_create_cancel(); crash_ram();
            REQUIRE(driver()->mount()==0);
            vfs_obj_t obj;
            const char *stored=file_path+2;
            if(publishing){
                int stage=driver()->stat_file(work_path+2,&obj);
                int visible=driver()->stat_file("/Visible",&obj);
                REQUIRE((stage==0 && visible==VFS_ERR_NOOBJ) || (visible==0 && stage==VFS_ERR_NOOBJ));
                if(visible==0) stored="/Visible/a.bin";
            }
            int present=driver()->stat_file(stored,&obj);
            REQUIRE(present==0 || (!publishing && present==VFS_ERR_NOOBJ));
            if(present==0){
                REQUIRE(obj.size==540 && driver()->read_file_data(stored,check,541)==540);
                REQUIRE(!memcmp(check,new_data,540));
                for(unsigned k=0;k<128;++k) REQUIRE((uint8_t)obj.meta[k]==255);
            }
            REQUIRE(driver()->read_file_data("/saved",check,sizeof(check))==2048 && !memcmp(check,old_data,2048));
            ++checks;
        }
    }
    return checks;
}
static void small_create_contract(void) {
    const unsigned sizes[] = {0, 1, 167, 540, 572};
    for (unsigned i=0; i<sizeof(sizes)/sizeof(*sizes); ++i) {
        uint16_t size = sizes[i], used = size < 167 ? size : 167;
        uint64_t before = small_baseline();
        df_frame_t f = small_start_at(file_path, size, before, used);
        uint8_t digest[32]; memcpy(digest, f.data+15,32); send_request(&f);
        unsigned frames=1;
        while (used<size) {
            partial(used);
            uint16_t n = size-used < 236 ? size-used : 236;
            f = small_cont(used,n); used+=n; ++frames; send_request(&f);
        }
        REQUIRE(size!=540 || frames==3);
        REQUIRE(answer.status==0 && answer.length==43 && answer.data[0]==1);
        uint64_t after; memcpy(&after,answer.data+3,8);
        REQUIRE(after==before+1 && after==vfs_packed_revision() && !memcmp(answer.data+11,digest,32));
        REQUIRE(df_proto_vfs_is_idle());
        /* Replaying after a lost ACK rejects both stale revision and fresh exact-name collision. */
        f=small_start_at(file_path,0,before,0);send_request(&f);REQUIRE(answer.status==1);
        f=small_start_at(file_path,0,after,0);send_request(&f);REQUIRE(answer.status==1);
        REQUIRE(vfs_packed_revision()==after);
        drop(); REQUIRE(driver()->mount()==0);
        vfs_obj_t obj; REQUIRE(driver()->stat_file(file_path+2,&obj)==0 && obj.size==size);
        for (unsigned k=0;k<128;++k) REQUIRE((uint8_t)obj.meta[k]==255);
        REQUIRE(driver()->read_file_data(file_path+2,check,sizeof(check))==size && !memcmp(check,new_data,size));
    }
    uint64_t before = small_baseline();
    df_frame_t f = small_start_at(file_path,540,before,100);
    send_request(&f); partial(100);
    df_frame_t cont=small_cont(100,200), invalid=cont;
    invalid.data[1] ^= 1; send_request(&invalid); REQUIRE(answer.status==1);
    invalid=cont; invalid.data[5] = 0; send_request(&invalid); REQUIRE(answer.status==1);
    send_request(&cont); partial(300);
    void *old_context = timer_context;
    df_proto_vfs_cleanup();
    REQUIRE(df_proto_vfs_is_idle() && small_caps()==before);
    send_request(&cont);REQUIRE(answer.status==1);
    send_request(&f);partial(100);
    timer_callback(old_context); REQUIRE(!df_proto_vfs_is_idle());
    timer_callback(timer_context); df_proto_vfs_expire_small(); REQUIRE(df_proto_vfs_is_idle() && small_caps()==before);
    send_request(&f);partial(100);
    df_frame_t abort={.cmd=DF_PROTO_CMD_VFS_SMALL_CREATE,.length=5,.data={2}};
    memcpy(abort.data+1,f.data+1,4);send_request(&abort);REQUIRE(answer.status==0 && answer.length==0);
    REQUIRE(df_proto_vfs_is_idle() && small_caps()==before);
    f=small_start_at(file_path,32,before,32);f.data[15]^=1;send_request(&f);REQUIRE(answer.status==1);
    REQUIRE(small_caps()==before);
    const char *invalid_paths[]={"I:/~u12345678/a","E:/public/a","E:/~u123/a","E:/~u12345678",
        "E:/~u12345678/../a","E:/~u12345678/a.","E:/~u12345678/y\\a","E:/.pixl_txn/~u12345678/a"};
    for(unsigned i=0;i<sizeof(invalid_paths)/sizeof(*invalid_paths);i++){
        f=small_start_at(invalid_paths[i],0,before,0);send_request(&f);REQUIRE(answer.status==1);
    }
    f=small_start_at(file_path,573,before,1);send_request(&f);REQUIRE(answer.status==1);
    recovery_mode=true;f=small_start_at(file_path,1,before,1);send_request(&f);REQUIRE(answer.status==1);
    recovery_mode=false;
    f=small_start_at(file_path,3,before,1);send_request(&f);partial(1);
    REQUIRE(driver()->create_dir("/other")==0);
    cont=small_cont(1,2);send_request(&cont);REQUIRE(answer.status==1);
    vfs_obj_t obj; REQUIRE(driver()->stat_file(file_path+2,&obj)==VFS_ERR_NOOBJ);
    uint8_t flags[128]={2,2,4};
    REQUIRE(driver()->update_file_meta(work_path+2,flags,128)==0);
    uint64_t locked=small_caps();
    f=small_start_at(file_path,3,locked,3);send_request(&f);REQUIRE(answer.status==1);
    small_publish_at(work_path,"E:/Visible",locked);REQUIRE(answer.status==1 && vfs_packed_revision()==locked);
    uint8_t malformed[128]={4,2,4,2,0}; /* Duplicate flags cannot lift the first read-only value. */
    REQUIRE(driver()->update_file_meta(work_path+2,malformed,128)==0);
    locked=small_caps();
    f=small_start_at(file_path,3,locked,3);send_request(&f);REQUIRE(answer.status==1);
    small_publish_at(work_path,"E:/Visible",locked);REQUIRE(answer.status==1 && vfs_packed_revision()==locked);
    before=small_baseline();
    /* Corrupted persisted read refuses the receipt even after a durable create. */
    vfs_driver_t changed=*driver(); changed.read_file_data=corrupt_readback; readback_injection=&changed;
    f=small_start_at(file_path,3,before,3);send_request(&f);REQUIRE(answer.status==1);readback_injection=NULL;
    REQUIRE(driver()->read_file_data(file_path+2,check,sizeof(check))==3 && !memcmp(check,new_data,3));
    before=small_caps();
    REQUIRE(driver()->create_dir("/collision")==0);
    small_publish_at(work_path,"E:/Visible",before); REQUIRE(answer.status==1);
    REQUIRE(driver()->stat_file("/Visible",&obj)==VFS_ERR_NOOBJ && driver()->stat_file(work_path+2,&obj)==0);
    before=small_caps(); small_publish_at(work_path,"E:/collision",before); REQUIRE(answer.status==1);
    small_publish_at(work_path,"E:/collision/Visible",before); REQUIRE(answer.status==1);
    small_publish_at("E:/collision","E:/Visible",before); REQUIRE(answer.status==1);
    small_publish_at(work_path,"E:/~uaaaaaaaa",before); REQUIRE(answer.status==1);
    small_publish_at(work_path,"E:/Visible",before); REQUIRE(!answer.status && answer.length==9 && answer.data[0]==3);
    uint64_t after;memcpy(&after,answer.data+1,8); REQUIRE(after==before+1);
    small_publish_at(work_path,"E:/Visible",before); REQUIRE(answer.status==1);
    drop(); REQUIRE(driver()->mount()==0);
    REQUIRE(driver()->stat_file(work_path+2,&obj)==VFS_ERR_NOOBJ);
    REQUIRE(driver()->read_file_data("/Visible/a.bin",check,4)==3 && !memcmp(check,new_data,3));
    unsigned create_cuts=small_fault_sweep(false);
    unsigned publish_cuts=small_fault_sweep(true);
    printf("Small protocol synthetic NOR fault cases: %u create, %u publish\n",create_cuts,publish_cuts);
    puts("PASS verified small create and conditional publish: framed 0..572, exact persisted SHA, metadata, exclusive name, stale revision, readonly and timeout/disconnect");
}
