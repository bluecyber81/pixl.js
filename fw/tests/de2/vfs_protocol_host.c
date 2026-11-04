/* Actual protocol/core/BLE driver sources; only hardware and VFS are mocked. */
#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
/* ACTUAL_PROTOCOL_INCLUDES */

static df_frame_t reply;
static unsigned sends, closes, writes, reads, dir_closes, opens, mutations, mounts, formats, stats[2];
static int close_result, write_result, read_result, dir_result, dir_entries, dir_close_result;
static bool internal_enabled, external_available;
static vfs_driver_t drivers[2];
static unsigned link_session_resets, transport_aborts;
static bool allow_transport_abort;
void ble_amiibolink_reset_transfer(void) { link_session_resets++; }
size_t ble_nus_max_data_length(void) { return DF_MAX_LEN; }
void ble_nus_abort_transfer(void) {
    /* Intentionally malformed raw-frame tests expect a connection abort now.
     * Ordinary VFS requests must still never trigger this boundary. */
    assert(allow_transport_abort); transport_aborts++;
}

uint32_t ble_nus_tx_data(void *data, size_t length) {
    assert(length >= DF_HEADER_LEN && length <= DF_MAX_LEN);
    memset(&reply, 0, sizeof(reply));
    memcpy(&reply, data, length);
    reply.length = length - DF_HEADER_LEN;
    sends++;
    return 0;
}
bool vfs_drive_enabled(vfs_drive_t d) { return d == VFS_DRIVE_EXT || internal_enabled; }
vfs_driver_t *vfs_get_driver(vfs_drive_t d) { assert(d < VFS_DRIVE_MAX); return &drivers[d]; }
static int32_t mock_mount(void) { mounts++; return 0; }
static int32_t mock_format(void) { formats++; return 0; }
static int32_t mock_int_stat(vfs_stat_t *s) { stats[0]++; *s=(vfs_stat_t){1,1000,700}; return 0; }
static int32_t mock_ext_stat(vfs_stat_t *s) { stats[1]++; *s=(vfs_stat_t){external_available,2000,1200}; return 0; }
static int32_t mock_open(const char *p, vfs_file_t *f, uint32_t flags) {
    (void)p; (void)flags; opens++; f->handle=(void*)1; return 0;
}
static int32_t mock_close(vfs_file_t *f) { (void)f; closes++; return close_result; }
static int32_t mock_read(vfs_file_t *f, void *b, size_t n) {
    (void)f; reads++; memset(b,0x57,n); return read_result;
}
static int32_t mock_write(vfs_file_t *f, void *b, size_t n) {
    (void)f; (void)b; writes++; return write_result == 999 ? (int)n : write_result;
}
static int32_t mock_open_dir(const char *p, vfs_dir_t *d) { (void)p; d->handle=(void*)2; return 0; }
static int32_t mock_read_dir(vfs_dir_t *d, vfs_obj_t *o) {
    (void)d;
    if (dir_entries-- > 0) {
        memset(o,0,sizeof(*o)); strcpy(o->name,"synthetic.bin");
        o->size=12; o->meta[0]=127; memset(o->meta+1,0x33,127); return 0;
    }
    return dir_result;
}
static int32_t mock_close_dir(vfs_dir_t *d) { (void)d; dir_closes++; return dir_close_result; }
static int32_t mock_path(const char *p) { (void)p; mutations++; return 0; }
static int32_t mock_rename(const char *p, const char *n) { (void)p; (void)n; mutations++; return 0; }
static int32_t mock_stat_file(const char *p, vfs_obj_t *o) { (void)p; memset(o,0,sizeof(*o)); return 0; }
static int32_t mock_meta(const char *p, void *m, size_t n) {
    (void)p; assert(n<=128 && ((uint8_t*)m)[0]+1u==n); mutations++; return 0;
}
static void info_handler(df_event_t *e) {
    if(e->type==DF_EVENT_DATA_RECEVIED) { df_frame_t o={.cmd=1}; df_core_send_frame(&o); }
}
const df_cmd_entry_t df_proto_handler_info_entries[]={{1,info_handler},{0,NULL}};
/* INFO is a deliberate mock in this VFS-only suite. */
void df_proto_info_cancel_pending(void) {}

static void reset(void) {
    close_result=0; df_proto_vfs_cleanup();
    closes=writes=reads=dir_closes=opens=mutations=mounts=formats=sends=0;
    stats[0]=stats[1]=0; close_result=dir_close_result=0;
    write_result=999; read_result=0; dir_result=VFS_ERR_EOF; dir_entries=0;
    internal_enabled=false; external_available=true;
    allow_transport_abort=false; transport_aborts=0;
    memset(&reply,0,sizeof(reply)); df_core_init();
}
static void request(uint8_t cmd, const void *data, size_t n) {
    /* Model delivery/acknowledgement of all prior notifications before the
     * central issues its next command. Stream tests can still step TX_READY
     * explicitly; this helper must not overwrite a pending device reply. */
    for(unsigned budget=0;m_tx_active;budget++) {
        assert(budget<1000);ble_on_transmit_ready();
    }
    uint8_t wire[DF_MAX_LEN]={cmd,0,0,0}; assert(n<=DF_PAYLOAD_LEN);
    if(n) memcpy(wire+4,data,n);
    ble_on_received_data(wire,n+4);
}
static size_t path(uint8_t *b,const char *p) {
    uint16_t n=(uint16_t)strlen(p); memcpy(b,&n,2); memcpy(b+2,p,n); return n+2;
}
static void open_file(void) {
    uint8_t b[80]; size_t n=path(b,"E:/test.bin"); uint32_t flags=VFS_MODE_CREATE|VFS_MODE_WRITEONLY;
    memcpy(b+n,&flags,4); request(DF_PROTO_CMD_VFS_FILE_OPEN,b,n+4);
    assert(reply.status==0 && file_chunk_state.opened);
}
static uint32_t u32(const uint8_t *p) { uint32_t n; memcpy(&n,p,4); return n; }

int main(void) {
    drivers[0]=(vfs_driver_t){.mount=mock_mount,.format=mock_format,.stat=mock_int_stat,
        .open_file=mock_open,.close_file=mock_close,.read_file=mock_read,.write_file=mock_write,
        .open_dir=mock_open_dir,.read_dir=mock_read_dir,.close_dir=mock_close_dir,
        .create_dir=mock_path,.remove_dir=mock_path,.remove_file=mock_path,
        .rename_dir=mock_rename,.rename_file=mock_rename,.stat_file=mock_stat_file,.update_file_meta=mock_meta};
    drivers[1]=drivers[0]; drivers[1].stat=mock_ext_stat;
    uint8_t b[243]={0}; size_t n;

    reset();n=path(b,"E:/test.bin");b[n]=VFS_MODE_READONLY;
    request(DF_PROTO_CMD_VFS_FILE_OPEN,b,n+1);assert(reply.status==0 && opens==1);
    request(DF_PROTO_CMD_VFS_FILE_OPEN,b,n+2);assert(reply.status==1 && opens==1 && !closes);
    request(DF_PROTO_CMD_VFS_FILE_OPEN,b,n+3);assert(reply.status==1 && opens==1 && !closes);
    b[0]=0;
    puts("PASS official web u8 OPEN flags; u32 covered by all other opens; reject u16/u24");

    reset(); open_file(); request(DF_PROTO_CMD_VFS_FILE_CLOSE,b,1);
    assert(reply.status==0 && !file_chunk_state.opened && closes==1);
    request(DF_PROTO_CMD_VFS_FILE_READ,b,1); assert(reply.status==1 && reads==0);
    request(DF_PROTO_CMD_VFS_FILE_WRITE,b,2); assert(reply.status==1 && writes==0);
    puts("PASS close invalidates handle; read/write after close rejected");

    reset(); open_file(); write_result=2; request(DF_PROTO_CMD_VFS_FILE_WRITE,b,5);
    assert(reply.status==1 && writes==1); request(DF_PROTO_CMD_VFS_FILE_WRITE,b,5);
    assert(reply.status==1 && writes==1);
    puts("PASS short write produces sticky error");

    reset(); open_file(); close_result=VFS_ERR_FAIL; request(DF_PROTO_CMD_VFS_FILE_CLOSE,b,1);
    assert(reply.status==1 && file_chunk_state.opened);
    close_result=0; request(DF_PROTO_CMD_VFS_FILE_CLOSE,b,1); assert(reply.status==0);
    puts("PASS close failure reported; explicit retry can close");

    reset(); open_file(); request(1,NULL,0); unsigned before=sends;
    unsigned resets_before_disconnect=link_session_resets;
    ble_on_disconnected(); assert(closes==1 && !file_chunk_state.opened && m_df_ctx.cmd==NULL);
    assert(link_session_resets==resets_before_disconnect+1);
    ble_on_transmit_ready(); assert(sends==before); ble_on_disconnected(); assert(closes==1);
    puts("PASS real BLE disconnect cleans up after another command; no stale TX");

    reset(); internal_enabled=true; request(DF_PROTO_CMD_VFS_DRIVE_LIST,NULL,0);
    assert(reply.status==0 && reply.data[0]==2 && stats[0]==1 && stats[1]==1 && !mounts && !formats);
    assert(reply.data[2]=='I' && u32(reply.data+19)==1000 && u32(reply.data+23)==700);
    assert(reply.data[28]=='E' && u32(reply.data+45)==2000 && u32(reply.data+49)==1200);
    reset(); external_available=false; request(DF_PROTO_CMD_VFS_DRIVE_LIST,NULL,0);
    assert(reply.data[0]==1 && reply.data[1]==1 && u32(reply.data+19)==0 && !mounts && !formats);
    b[0]='E'; request(DF_PROTO_CMD_VFS_DRIVE_FORMAT,b,1); assert(reply.status==0 && mounts==1 && formats==1);
    b[0]='I'; request(DF_PROTO_CMD_VFS_DRIVE_FORMAT,b,1); assert(reply.status==1 && formats==1);
    puts("PASS DRIVE_LIST read-only, correct internal/external driver; explicit format remounts");

    reset(); n=path(b,"E:/"); dir_result=VFS_ERR_FAIL; request(DF_PROTO_CMD_VFS_DIR_READ,b,n);
    assert(reply.status==1 && reply.length==0 && dir_closes==1);
    reset(); n=path(b,"E:/"); request(DF_PROTO_CMD_VFS_DIR_READ,b,n);
    assert(reply.status==0 && reply.length==0 && dir_closes==1);
    reset(); n=path(b,"E:/"); dir_close_result=VFS_ERR_FAIL; request(DF_PROTO_CMD_VFS_DIR_READ,b,n);
    assert(reply.status==1);
    reset(); n=path(b,"E:/"); dir_entries=3; request(DF_PROTO_CMD_VFS_DIR_READ,b,n);
    assert(reply.status==0 && (reply.chunk&0x8000) && !dir_closes);
    ble_on_transmit_ready(); ble_on_transmit_ready();
    assert(reply.status==0 && !(reply.chunk&0x8000) && dir_closes==1);
    reset(); n=path(b,"E:/"); dir_entries=3; request(DF_PROTO_CMD_VFS_DIR_READ,b,n);
    request(1,NULL,0); ble_on_disconnected(); assert(dir_closes==1);
    puts("PASS directory error vs EOF, chunk continuation, close error and disconnect");

    reset(); open_file(); request(DF_PROTO_CMD_VFS_FILE_OPEN,NULL,0);
    assert(reply.status==1 && !closes && file_chunk_state.opened && opens==1);
    const uint8_t path_commands[]={0x12,0x16,0x17,0x18,0x19,0x1a};
    for(size_t i=0;i<sizeof(path_commands);i++) {
        request(path_commands[i],NULL,0); assert(reply.status==1);
        b[0]=255; b[1]=255; request(path_commands[i],b,2); assert(reply.status==1);
        memset(b,'x',68); b[0]=66;b[1]=0;b[2]='E';b[3]=':';b[4]='/';
        request(path_commands[i],b,68); assert(reply.status==1);
        n=path(b,"E:/abc"); b[5]=0; request(path_commands[i],b,n); assert(reply.status==1);
    }
    assert(!mutations && !closes && opens==1);
    for(uint8_t c=0x13;c<=0x15;c++) { request(c,NULL,0); assert(reply.status==1); b[0]=1;request(c,b,1); assert(reply.status==1); }
    n=path(b,"E:/a"); b[n]=128; memset(b+n+1,0,128); request(0x1a,b,n+129); assert(reply.status==1);
    b[n]=127; request(0x1a,b,n+127); assert(reply.status==1);
    request(0x1a,b,n+128); assert(reply.status==0 && mutations==1);
    n=path(b,"I:/a"); request(0x17,b,n); assert(reply.status==1 && mutations==1);
    allow_transport_abort=true;
    before=sends; uint8_t oversized[248]={0x17}; ble_on_received_data(oversized,sizeof(oversized));
    ble_on_received_data(NULL,4); ble_on_received_data(oversized,3); assert(sends==before);
    assert(transport_aborts==3);
    puts("PASS malformed/truncated/oversize paths, handle and metadata bounds; no mutation");

    reset(); open_file(); memset(b,0x66,sizeof(b)); b[0]=0;
    request(0x15,b,sizeof(b)); assert(reply.status==0 && writes==1);
    read_result=VFS_ERR_NOSPC; request(0x14,b,1); assert(reply.status==1 && reply.length==0);
    puts("PASS 242-byte upload ACK and read error mapping");
    uint32_t random_state=0x21de2u;
    for(unsigned trial=0;trial<40000;trial++) {
        uint8_t wire[248];
        for(size_t i=0;i<sizeof(wire);i++) {
            random_state=random_state*1664525u+1013904223u;
            wire[i]=(uint8_t)(random_state>>24);
        }
        reset();
        allow_transport_abort=true;
        wire[0]=0x10+(trial%11);
        ble_on_received_data(wire,trial%249);
        ble_on_transmit_ready();
        ble_on_disconnected();
    }
    puts("PASS 40000 deterministic malformed BLE/VFS frames with host mocks");
    puts("PASS all protocol/core/BLE host regression groups");
    return 0;
}
