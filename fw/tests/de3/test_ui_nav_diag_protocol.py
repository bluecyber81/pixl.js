"""Exercise the actual diagnostic command handler; peripherals are mocked."""
from root_host import HostTests, SRC, function
import unittest


class DiagnosticProtocolTests(HostTests):
    def test_read_only_snapshot_command_validation_and_error_paths(self):
        handler = function((SRC / 'mod/df/df_proto_info.c').read_text(),
                           'df_proto_handler_info_ui_diagnostic')
        self.compile_run(r'''
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include <assert.h>
#include <stdio.h>
#include <string.h>
#define DF_EVENT_DATA_RECEVIED 1
#define DF_PROTO_CMD_INFO_UI_DIAGNOSTIC 4
#define DF_STATUS_OK 0
#define DF_STATUS_ERR 1
#define MUI_NAV_DIAG_SNAPSHOT_SIZE 104u
#define MUI_FIRST_MENU_DIAG
#define MUI_MENU_DIAG_SIZE 16u
#define MUI_MENU_DIAG_V2_SIZE 32u
typedef struct { uint8_t cmd, status; uint16_t chunk, length; uint8_t data[243]; } df_frame_t;
typedef struct { int type; df_frame_t *df; } df_event_t;
#define OUT_FRAME_NO_DATA(f,c,s) do { (f).cmd=(c); (f).status=(s); (f).length=0; (f).chunk=0; } while(0)
static unsigned reads, sends, menu_reads, menu_v2_reads;
static bool available = true;
static df_frame_t reply;
static bool mui_nav_diag_snapshot(uint8_t *out, size_t cap) {
    ++reads; assert(cap >= 104);
    if (!available) return false;
    for (unsigned i=0;i<104;i++) out[i]=(uint8_t)i;
    return true;
}
static bool mui_menu_diag_snapshot(uint8_t *out, size_t cap) {
    ++menu_reads; assert(cap>=16); if (!available) return false;
    memset(out,0,16); memcpy(out,"PXMI",4); return true;
}
static bool mui_menu_diag_snapshot_v2(uint8_t *out, size_t cap) {
    ++menu_v2_reads; assert(cap>=32); if (!available) return false;
    memset(out,0,32); memcpy(out,"PXMI",4); out[4]=2;out[5]=32; return true;
}
static void df_core_send_frame(df_frame_t *out) { ++sends; reply=*out; }
''' + handler + r'''
int main(void) {
    df_frame_t request = {0}; df_event_t event = {1, &request};
    for (unsigned i=0;i<2;i++) {
        df_proto_handler_info_ui_diagnostic(&event);
        assert(reads==i+1 && sends==i+1);
        assert(reply.cmd==4 && reply.status==0 && reply.chunk==0 && reply.length==104);
        for(unsigned j=0;j<104;j++) assert(reply.data[j]==j);
    }
    assert(!menu_reads);
    request.length=1; request.data[0]=1;
    df_proto_handler_info_ui_diagnostic(&event);
    assert(reply.status==0 && reply.length==16 && !memcmp(reply.data,"PXMI",4) && menu_reads==1 && reads==2);
    available=false; df_proto_handler_info_ui_diagnostic(&event);
    assert(reply.status==1 && reply.length==0 && menu_reads==2 && menu_v2_reads==0 && reads==2);
    available=true;request.data[0]=2;
    df_proto_handler_info_ui_diagnostic(&event);
    assert(reply.status==0 && reply.length==32 && reply.data[4]==2 && reply.data[5]==32 && menu_v2_reads==1);
    available=false;df_proto_handler_info_ui_diagnostic(&event);
    assert(reply.status==1 && reply.length==0 && menu_v2_reads==2);
    available=true;
    for(unsigned field=0;field<4;field++) {
        request.length=field==0?2:1; request.data[0]=field==1?3:1;
        request.chunk=field==2; request.status=field==3;
        df_proto_handler_info_ui_diagnostic(&event);
        assert(reply.status==1 && reply.length==0 && menu_reads==2 && menu_v2_reads==2 && reads==2);
    }
    unsigned previous=reads;
    for(unsigned field=0;field<3;field++) {
        memset(&request,0,sizeof(request));
        if(field==0) request.length=1;
        if(field==1) request.status=1;
        if(field==2) request.chunk=1;
        df_proto_handler_info_ui_diagnostic(&event);
        assert(reads==previous && reply.status==1 && reply.length==0 && reply.chunk==0);
    }
    memset(&request,0,sizeof(request)); available=false;
    df_proto_handler_info_ui_diagnostic(&event);
    assert(reads==previous+1 && reply.status==1 && reply.length==0);
    previous=sends;
    event.type=2; event.df=NULL;
    df_proto_handler_info_ui_diagnostic(&event);
    assert(sends==previous);
    puts("PASS read-only diagnostic request validation, repeated reads, error and non-RX events");
    return 0;
}
''')


if __name__ == '__main__':
    unittest.main()
