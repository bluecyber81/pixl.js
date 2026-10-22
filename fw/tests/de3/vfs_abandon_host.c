/* Real SPIFFS, extracted production VFS wrappers, complete DF handler and
 * persistence implementation. Only physical NOR and DF replies are modelled. */
@@NOR@@
#include "vfs.h"
#include "vfs_persist.h"
#include "cwalk.h"
#include "cwalk2.h"
#define NRF_LOG_INFO(...) ((void)0)
#define IFS_MAX_FD 4
static void *writer_handles[IFS_MAX_FD];
static bool writer_used[IFS_MAX_FD];
extern const vfs_driver_t vfs_driver_fs;
static bool fail_on_close;
static unsigned aborts;
static int close_with_fault(spiffs *f,spiffs_file h) {
    int saved=write_failure;
    if(fail_on_close)write_failure=-12345;
    int result=SPIFFS_close(f,h);write_failure=saved;return result;
}
static int counted_abort(spiffs *f,spiffs_file h) {
    unsigned before=writes;
    int result=SPIFFS_abort(f,h);
    assert(writes==before);if(!result)aborts++;return result;
}
#define SPIFFS_close close_with_fault
#define SPIFFS_abort counted_abort
@@WRAPPERS@@
#undef SPIFFS_close
#undef SPIFFS_abort
@@PERSIST@@
static int32_t raw_stat(const char *p,vfs_obj_t *obj) {
    spiffs_stat st;int result=SPIFFS_stat(&fs,p,&st);
    if(result)return vfs_spiffs_map_error_code(result);
    memset(obj,0,sizeof(*obj));obj->type=VFS_TYPE_REG;obj->size=st.size;
    memcpy(obj->meta,st.meta,sizeof(obj->meta));return VFS_OK;
}
static int32_t raw_meta(const char *p,void *data,size_t size) {
    assert(size==128);return vfs_spiffs_map_error_code(SPIFFS_update_meta(&fs,p,data));
}
static int32_t raw_remove(const char *p) {return vfs_spiffs_map_error_code(SPIFFS_remove(&fs,p));}
static const vfs_driver_t lifecycle_raw={.stat_file=raw_stat,.open_file=vfs_spiffs_open_file,
    .close_file=vfs_spiffs_close_file,.abort_file=vfs_spiffs_abort_file,
    .read_file=vfs_spiffs_read_file,.write_file=vfs_spiffs_write_file,
    .read_file_data=vfs_spiffs_read_file_data,.write_file_data=vfs_spiffs_write_file_data,
    .update_file_meta=raw_meta,.remove_file=raw_remove};
const vfs_driver_t vfs_driver_fs={.open_file=guarded_open,.close_file=guarded_close,
    .abort_file=guarded_abort,.read_file=vfs_spiffs_read_file,.write_file=vfs_spiffs_write_file};
static vfs_driver_t protocol_driver;
bool vfs_drive_enabled(vfs_drive_t drive){return drive==VFS_DRIVE_EXT;}
vfs_driver_t *vfs_get_driver(vfs_drive_t drive){assert(drive==VFS_DRIVE_EXT);return &protocol_driver;}
@@PROTOCOL@@
static df_frame_t last_reply;
void df_core_send_frame(df_frame_t *out){last_reply=*out;}
size_t df_core_max_payload(void){return DF_PAYLOAD_LEN;}
static unsigned open_fds(void){
    unsigned n=0;spiffs_fd *all=(spiffs_fd*)fs.fd_space;
    for(unsigned i=0;i<fs.fd_count;i++)n+=all[i].file_nbr!=0;
    return n;
}
static unsigned tracked_writers(void){unsigned n=0;for(unsigned i=0;i<IFS_MAX_FD;i++)n+=writer_used[i];return n;}
static void empty_owners(void){assert(open_fds()==0 && tracked_writers()==0 && external_writers==0);}
static void request(uint8_t command,const void *payload,size_t size){
    df_frame_t frame={.cmd=command,.length=(uint8_t)size};assert(size<=sizeof(frame.data));
    if(size)memcpy(frame.data,payload,size);df_event_t event={DF_EVENT_DATA_RECEVIED,&frame};
    switch(command){
        case DF_PROTO_CMD_VFS_FILE_OPEN:df_proto_handler_vfs_file_open(&event);break;
        case DF_PROTO_CMD_VFS_FILE_CLOSE:df_proto_handler_vfs_file_close(&event);break;
        case DF_PROTO_CMD_VFS_FILE_READ:df_proto_handler_vfs_file_read(&event);break;
        case DF_PROTO_CMD_VFS_FILE_WRITE:df_proto_handler_vfs_file_write(&event);break;
        case DF_PROTO_CMD_VFS_DRIVE_FORMAT:df_proto_handler_vfs_drive_format(&event);break;
        default:assert(0);
    }
}
static void protocol_open(void){
    const char *path="E:/lifecycle.bin";uint8_t data[80];uint16_t n=(uint16_t)strlen(path);
    memcpy(data,&n,2);memcpy(data+2,path,n);data[n+2]=VFS_MODE_WRITEONLY|VFS_MODE_CREATE|VFS_MODE_TRUNC;
    request(DF_PROTO_CMD_VFS_FILE_OPEN,data,n+3);
}
static void cached_payload(void){
    uint8_t data[21];memset(data,0x63,sizeof(data));data[0]=0;
    request(DF_PROTO_CMD_VFS_FILE_WRITE,data,sizeof(data));assert(last_reply.status==DF_STATUS_OK);
}
static void verify_payload(void){
    uint8_t data[21];int count=vfs_spiffs_read_file_data("/lifecycle.bin",data,sizeof(data));assert(count==20);
    for(unsigned i=0;i<20;i++)assert(data[i]==0x63);
}
static int32_t abort_failure(vfs_file_t *f){(void)f;return VFS_ERR_FAIL;}
int main(void){
    capacity=4u*1024u*1024u;flash=malloc(capacity);assert(flash);memset(flash,255,capacity);
    assert(mount_fs()==0);SPIFFS_unmount(&fs);assert(SPIFFS_format(&fs)==0);assert(mount_fs()==0);
    vfs_persist_bind(&vfs_driver_fs,&lifecycle_raw);protocol_driver=vfs_driver_fs;
    uint8_t zero=0;
    protocol_open();assert(last_reply.status==0);cached_payload();
    void *saved=file_chunk_state.vfs_fd.handle;fail_on_close=true;
    request(DF_PROTO_CMD_VFS_FILE_CLOSE,&zero,1);
    assert(last_reply.status==DF_STATUS_ERR && file_chunk_state.opened && !file_chunk_state.abandoned);
    assert(file_chunk_state.vfs_fd.handle==saved && open_fds()==1 && tracked_writers()==1 && external_writers==1 && !aborts);
    fail_on_close=false;request(DF_PROTO_CMD_VFS_FILE_CLOSE,&zero,1);
    assert(last_reply.status==0 && !file_chunk_state.opened);empty_owners();verify_payload();
    puts("PASS transient normal CLOSE retains bytes/FD/writer; explicit retry commits exact bytes");

    for(unsigned run=0;run<20;run++){
        protocol_open();assert(last_reply.status==0);cached_payload();fail_on_close=true;
        unsigned before=aborts;df_proto_vfs_cleanup();
        assert(aborts==before+1 && !file_chunk_state.opened);empty_owners();
        df_proto_vfs_cleanup();assert(aborts==before+1);fail_on_close=false;
        protocol_open();assert(last_reply.status==0);cached_payload();
        request(DF_PROTO_CMD_VFS_FILE_CLOSE,&zero,1);assert(last_reply.status==0);empty_owners();verify_payload();
    }
    puts("PASS 20 permanent disconnect close errors abandon without writes; no FD/writer leak; next transfer works");

    /* Legacy callbacks cannot silently leak or expose a previous connection's
     * descriptor. Unsupported/failed abandonment remains explicitly owned. */
    protocol_driver.abort_file=NULL;protocol_open();assert(last_reply.status==0);cached_payload();fail_on_close=true;
    df_proto_vfs_cleanup();assert(file_chunk_state.opened && file_chunk_state.abandoned);
    assert(vfs_abort_file(NULL,NULL)==VFS_ERR_UNSUPT);
    request(DF_PROTO_CMD_VFS_FILE_READ,&zero,1);assert(last_reply.status==DF_STATUS_ERR);
    request(DF_PROTO_CMD_VFS_FILE_WRITE,&zero,1);assert(last_reply.status==DF_STATUS_ERR);
    request(DF_PROTO_CMD_VFS_FILE_CLOSE,&zero,1);assert(last_reply.status==DF_STATUS_ERR);
    protocol_open();assert(last_reply.status==DF_STATUS_ERR && open_fds()==1);
    uint8_t drive='E';request(DF_PROTO_CMD_VFS_DRIVE_FORMAT,&drive,1);
    assert(last_reply.status==DF_STATUS_ERR && open_fds()==1);
    protocol_driver.abort_file=abort_failure;df_proto_vfs_cleanup();assert(file_chunk_state.abandoned && open_fds()==1);
    protocol_driver.abort_file=guarded_abort;fail_on_close=false;
    protocol_open();assert(last_reply.status==DF_STATUS_OK && !file_chunk_state.abandoned);
    cached_payload();
    request(DF_PROTO_CMD_VFS_FILE_CLOSE,&zero,1);assert(last_reply.status==0);empty_owners();
    puts("PASS absent/failing optional abort retains isolated ownership, blocks stale operations and recovers after abort");

    uint8_t payload[20];memset(payload,0x75,sizeof(payload));
    for(unsigned run=0;run<12;run++){
        fail_on_close=true;unsigned before=aborts;
        assert(vfs_spiffs_write_file_data("/short.bin",payload,sizeof(payload))==VFS_ERR_FAIL);
        assert(aborts==before+1);empty_owners();fail_on_close=false;
    }
    assert(vfs_spiffs_write_file_data("/short.bin",payload,sizeof(payload))==20);empty_owners();
    puts("PASS 12 failed short-operation closes retain original failure and release all descriptors");

    vfs_file_t local;assert(vfs_spiffs_open_file("/persist.bin",&local,VFS_MODE_CREATE|VFS_MODE_WRITEONLY)==0);
    assert(vfs_spiffs_write_file(&local,payload,sizeof(payload))==20);fail_on_close=true;
    unsigned before=aborts;assert(close_result(&local,VFS_ERR_NOSPC)==VFS_ERR_NOSPC);
    assert(aborts==before+1 && (intptr_t)local.handle==-1);empty_owners();fail_on_close=false;
    assert(vfs_spiffs_open_file("/persist.bin",&local,VFS_MODE_WRITEONLY)==0);
    assert(vfs_spiffs_write_file(&local,payload,sizeof(payload))==20);fail_on_close=true;
    assert(close_result(&local,VFS_OK)==VFS_ERR_FAIL);empty_owners();fail_on_close=false;
    puts("PASS actual persistence close_result abandons local FD and preserves earlier error over close/abort result");

    /* A read-only descriptor can share a failed object's write cache. Its final
     * abort must not discard bytes still owned by the independent writer. */
    assert(guarded_open("/shared.bin",&local,VFS_MODE_WRITEONLY|VFS_MODE_CREATE)==0);
    assert(vfs_spiffs_write_file(&local,payload,sizeof(payload))==20);write_failure=-12345;
    before=aborts;assert(vfs_spiffs_read_file_data("/shared.bin",payload,sizeof(payload))==VFS_ERR_FAIL);
    assert(aborts==before+1 && open_fds()==1 && tracked_writers()==1);write_failure=0;
    assert(guarded_close(&local)==0);empty_owners();
    assert(vfs_spiffs_read_file_data("/shared.bin",payload,sizeof(payload))==20);
    for(unsigned i=0;i<20;i++)assert(payload[i]==0x75);
    puts("PASS short read failure releases its FD while preserving another handle's dirty cache for retry");
    SPIFFS_unmount(&fs);assert(mount_fs()==0);verify_payload();SPIFFS_unmount(&fs);free(flash);
    puts("PASS remount preserves successful transfer; failed transfers are never reported committed");
}
