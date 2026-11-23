"""Actual DE3 input callbacks: bounded 4/7/10-byte UIDs, ATS and nicknames."""
import unittest
from root_host import HostTests, SRC, function

PREFIX = r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define ATS_MAX_LENGTH 16
#define NFC_TAG_14A_UID_SINGLE_SIZE 4
#define NFC_TAG_14A_UID_DOUBLE_SIZE 7
#define NFC_TAG_14A_UID_TRIPLE_SIZE 10
typedef uint8_t nfc_tag_14a_uid_size;
typedef enum { APP_CHAMELEON_ID_EDIT_TYPE_UID, APP_CHAMELEON_ID_EDIT_TYPE_SAK,
 APP_CHAMELEON_ID_EDIT_TYPE_ATQA, APP_CHAMELEON_ID_EDIT_TYPE_ATS } app_chameleon_id_edit_type_t;
typedef struct {app_chameleon_id_edit_type_t id_edit_type;} app_chameleon_t;
typedef struct {uint8_t length, data[16];} ats_t;
typedef struct {uint8_t *size,*uid,*sak,*atqa;ats_t *ats;} nfc_tag_14a_coll_res_reference_t;
static struct {uint8_t uid[10],size,sak,atqa[2];ats_t ats;uint8_t guard[16];} state;
static nfc_tag_14a_coll_res_reference_t refs={&state.size,state.uid,&state.sak,state.atqa,&state.ats};
static bool missing;
static const nfc_tag_14a_coll_res_reference_t *tag_helper_get_active_coll_res_ref(void) {return missing?NULL:&refs;}
'''


class ChameleonInputTests(HostTests):
    def test_lcd_packed_nickname_cache_revisions_and_boundaries(self):
        source = (SRC / 'app/chameleon/port/tag_helper.c').read_text()
        code = '\n'.join(function(source, n) for n in ('tag_helper_get_nickname', 'tag_helper_set_nickname'))
        self.compile_run(r'''
#include <assert.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include "vfs_meta.h"
#define LCD_SCREEN 1
#define VFS_PACKED_LFS_ENABLE 1
#define FDS_SLOT_TAG_DUMP_FILE_ID_BASE 10
#define TAG_SENSE_HF 1
typedef struct {int id;} vfs_driver_t;
static const vfs_driver_t vfs_driver_fs={1}, foreign_driver={2};
static vfs_driver_t *active_driver=(vfs_driver_t *)&vfs_driver_fs;
static vfs_driver_t *vfs_get_default_driver(void) {return active_driver;}
static uint64_t revision=1;
static uint64_t vfs_packed_revision(void) {return revision;}
static const char *fallback="Slot";
#define _T(x) fallback
static vfs_meta_t stored[3];
static int read_error, write_error, reads, writes;
static bool change_revision_during_read, change_driver_during_read;
static uint8_t slot;
static uint8_t tag_emulation_get_slot(void) {return slot;}
static int fds_read_meta(int id,int key,vfs_meta_t *m) {
    (void)key; reads++; *m=stored[id-FDS_SLOT_TAG_DUMP_FILE_ID_BASE];
    if(change_revision_during_read) {revision++;change_revision_during_read=false;}
    if(change_driver_during_read) {active_driver=(vfs_driver_t *)&foreign_driver;change_driver_during_read=false;}
    return read_error;
}
static int fds_write_meta(int id,int key,vfs_meta_t *m) {
    (void)key; writes++;
    if(!write_error) {stored[id-FDS_SLOT_TAG_DUMP_FILE_ID_BASE]=*m;revision++;}
    return write_error;
}
''' + code + r'''
int main(void) {
    char out[100];
    stored[0].has_notes=true;memset(stored[0].notes,'n',89);stored[0].notes[89]=0;
    tag_helper_get_nickname(out,4);assert(!strcmp(out,"nnn") && reads==1);
    tag_helper_get_nickname(out,sizeof(out));assert(strlen(out)==89 && reads==1);
    for(size_t cap=1;cap<=sizeof(out);cap++) {
        memset(out,0x5a,sizeof(out));tag_helper_get_nickname(out,cap);
        size_t len=cap<90?cap-1:89;
        assert(strlen(out)==len);
        for(size_t j=cap;j<sizeof(out);j++) assert(out[j]==0x5a);
    }
    assert(reads==1);
    tag_helper_get_nickname(NULL,10);tag_helper_get_nickname(out,0);assert(reads==1);
    slot=1;stored[1].has_notes=true;strcpy(stored[1].notes,"Second");
    tag_helper_get_nickname(out,sizeof(out));assert(!strcmp(out,"Second") && reads==2);
    slot=0;tag_helper_get_nickname(out,sizeof(out));assert(strlen(out)==89 && reads==3);
    assert(tag_helper_set_nickname("Renamed")==0 && writes==1);
    int before=reads;tag_helper_get_nickname(out,sizeof(out));assert(!strcmp(out,"Renamed") && reads==before+1);
    tag_helper_get_nickname(out,sizeof(out));assert(reads==before+1);
    /* Failed edits must keep the previously committed name, not cache the
       requested replacement or needlessly invalidate a still-valid token. */
    uint64_t committed_revision=revision;int committed_reads=reads, committed_writes=writes;
    write_error=-9;assert(tag_helper_set_nickname("Not committed")==-9);
    assert(revision==committed_revision && reads==committed_reads+1 && writes==committed_writes+1);
    tag_helper_get_nickname(out,sizeof(out));
    assert(!strcmp(out,"Renamed") && reads==committed_reads+1);
    write_error=0;read_error=-7;committed_reads=reads;committed_writes=writes;
    assert(tag_helper_set_nickname("Unreadable edit")==-7);
    assert(revision==committed_revision && reads==committed_reads+1 && writes==committed_writes);
    tag_helper_get_nickname(out,sizeof(out));
    assert(!strcmp(out,"Renamed") && reads==committed_reads+1);
    read_error=0;
    stored[0].has_notes=false;revision++;fallback="Steckplatz";
    tag_helper_get_nickname(out,sizeof(out));assert(!strcmp(out,"Steckplatz 01"));before=reads;
    fallback="Slot";tag_helper_get_nickname(out,sizeof(out));assert(!strcmp(out,"Slot 01") && reads==before);
    tag_helper_get_nickname(out,1);assert(out[0]==0 && reads==before);
    stored[0].has_notes=true;stored[0].notes[0]=0;revision++;
    tag_helper_get_nickname(out,sizeof(out));assert(!strcmp(out,"Slot 01"));
    revision++;read_error=-7;before=reads;
    tag_helper_get_nickname(out,sizeof(out));tag_helper_get_nickname(out,sizeof(out));
    assert(!strcmp(out,"Slot 01") && reads==before+2);
    read_error=0;strcpy(stored[0].notes,"Recovered");
    tag_helper_get_nickname(out,sizeof(out));assert(!strcmp(out,"Recovered") && reads==before+3);
    tag_helper_get_nickname(out,sizeof(out));assert(reads==before+3);
    uint64_t previous=revision;revision=0;before=reads;
    tag_helper_get_nickname(out,sizeof(out));tag_helper_get_nickname(out,sizeof(out));assert(reads==before+2);
    revision=previous;strcpy(stored[0].notes,"After zero");
    tag_helper_get_nickname(out,sizeof(out));assert(!strcmp(out,"After zero") && reads==before+3);
    revision=(UINT64_C(9)<<32)|1;strcpy(stored[0].notes,"After remount");
    tag_helper_get_nickname(out,sizeof(out));assert(!strcmp(out,"After remount") && reads==before+4);
    active_driver=(vfs_driver_t *)&foreign_driver;before=reads;
    tag_helper_get_nickname(out,sizeof(out));tag_helper_get_nickname(out,sizeof(out));assert(reads==before+2);
    active_driver=(vfs_driver_t *)&vfs_driver_fs;strcpy(stored[0].notes,"After driver");
    tag_helper_get_nickname(out,sizeof(out));assert(!strcmp(out,"After driver") && reads==before+3);
    active_driver=NULL;tag_helper_get_nickname(out,sizeof(out));
    active_driver=(vfs_driver_t *)&vfs_driver_fs;before=reads;
    tag_helper_get_nickname(out,sizeof(out));assert(reads==before+1);
    revision++;change_revision_during_read=true;before=reads;
    tag_helper_get_nickname(out,sizeof(out));tag_helper_get_nickname(out,sizeof(out));assert(reads==before+2);
    tag_helper_get_nickname(out,sizeof(out));assert(reads==before+2);
    revision++;change_driver_during_read=true;before=reads;
    tag_helper_get_nickname(out,sizeof(out));active_driver=(vfs_driver_t *)&vfs_driver_fs;
    tag_helper_get_nickname(out,sizeof(out));assert(reads==before+2);
    memset(stored[0].notes,'x',sizeof(stored[0].notes));revision++;
    tag_helper_get_nickname(out,sizeof(out));assert(strlen(out)==90);
    tag_helper_get_nickname(out,4);assert(!strcmp(out,"xxx"));
    puts("PASS LCD PackedFS nickname cache: full notes, bounds, dynamic language, slot/revision/driver/zero/error invalidation");
}
''', [SRC / 'mod/vfs'])

    def test_nickname_cache_excludes_oled_and_other_backends(self):
        source = (SRC / 'app/chameleon/port/tag_helper.c').read_text()
        code = function(source, 'tag_helper_get_nickname')
        for defines in ('#define VFS_PACKED_LFS_ENABLE 1\n', '#define LCD_SCREEN 1\n', ''):
            with self.subTest(defines=defines):
                self.compile_run(defines + r'''
#include <assert.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include "vfs_meta.h"
#define FDS_SLOT_TAG_DUMP_FILE_ID_BASE 10
#define TAG_SENSE_HF 1
#define _T(x) "Slot"
static int reads;
static uint8_t tag_emulation_get_slot(void) {return 0;}
static int fds_read_meta(int id,int key,vfs_meta_t *m) {
    (void)id;(void)key;reads++;m->has_notes=true;strcpy(m->notes,reads==1?"Old":"New");return 0;
}
''' + code + r'''
int main(void) {
    char out[16];tag_helper_get_nickname(out,sizeof(out));assert(!strcmp(out,"Old"));
    tag_helper_get_nickname(out,sizeof(out));assert(!strcmp(out,"New") && reads==2);
    puts("PASS non-LCD/non-PackedFS keeps uncached reads without revision API dependency");
}
''', [SRC / 'mod/vfs'])

    def test_display_uid_lengths_and_boundaries(self):
        helper = (SRC / 'app/chameleon/port/tag_helper.c').read_text()
        self.compile_run(PREFIX + function(helper, 'tag_helper_format_hex') + function(helper, 'tag_helper_format_uid') + r'''
int main(void) {
    uint8_t uid[10] = {0x04,0x0a,0x9f,0x80,0xff,0x00,0x11,0x22,0x33,0x44};
    const char *expected = "04:0a:9f:80:ff:00:11:22:33:44";
    for (unsigned length = 0; length <= 255; ++length) {
        char text[32];
        memset(text, 0x5a, sizeof(text));
        size_t count = length == 4 || length == 7 || length == 10 ? 3 * length - 1 : 0;
        tag_helper_format_uid(text, count ? uid : NULL, length);
        assert(strncmp(text, expected, count) == 0);
        assert(text[count] == 0 && text[count + 1] == 0x5a);
    }
    puts("PASS: valid display UIDs and all invalid lengths with output bounds");
    return 0;
}
''')

    def test_real_id_callbacks_and_malformed_inputs(self):
        source = (SRC / 'app/chameleon/scene/chameleon_scene_menu_card_advanced_id_edit.c').read_text()
        code = '\n'.join(function(source, name) for name in
                         ('chameleon_id_hex_digit', 'chameleon_id_parse_bytes', 'handle_id_edit_cb', 'format_id_edit_text'))
        helper = (SRC / 'app/chameleon/port/tag_helper.c').read_text()
        self.compile_run(PREFIX + function(helper, 'tag_helper_format_hex') + code + r'''
int main(void) {
 app_chameleon_t app={APP_CHAMELEON_ID_EDIT_TYPE_UID};
 memset(&state,0xa5,sizeof(state));
 const char *uids[]={"04.12.34.56","04.12.34.56.78.9a.BC","04.12.34.56.78.9a.BC.de.F0.11"};
 const unsigned sizes[]={4,7,10};
 const uint8_t expected[]={4,0x12,0x34,0x56,0x78,0x9a,0xbc,0xde,0xf0,0x11};
 for(unsigned i=0;i<3;i++) {
  state.size=sizes[i];assert(handle_id_edit_cb(&app,uids[i]));
  assert(memcmp(state.uid,expected,sizes[i])==0);
  for(unsigned j=0;j<16;j++)assert(state.guard[j]==0xa5);
 }
 state.size=7;
 const char *invalid[]={"","0","04.12.34","04.12.34.56.78.9A.BC.","04.12.34.56.78.9A.BCzz",
   "04:12:34:56:78:9A:BC","+4.12.34.56.78.9A.BC","04.12.34.56.78.9A.ZZ"};
 uint8_t before[sizeof(state)];memcpy(before,&state,sizeof(state));
 for(unsigned i=0;i<sizeof(invalid)/sizeof(*invalid);i++) {
  assert(!handle_id_edit_cb(&app,invalid[i]));assert(memcmp(before,&state,sizeof(state))==0);
 }
 state.size=8;assert(!handle_id_edit_cb(&app,uids[2]));state.size=7;
 assert(!handle_id_edit_cb(NULL,uids[1]) && !handle_id_edit_cb(&app,NULL));
 missing=true;assert(!handle_id_edit_cb(&app,uids[1]));missing=false;
 app.id_edit_type=APP_CHAMELEON_ID_EDIT_TYPE_SAK;assert(handle_id_edit_cb(&app,"aF") && state.sak==0xaf);
 assert(!handle_id_edit_cb(&app,"aFxx") && state.sak==0xaf);
 app.id_edit_type=APP_CHAMELEON_ID_EDIT_TYPE_ATQA;assert(handle_id_edit_cb(&app,"12.34"));
 assert(state.atqa[0]==0x34 && state.atqa[1]==0x12);
 app.id_edit_type=APP_CHAMELEON_ID_EDIT_TYPE_ATS;
 const char *ats="00.01.02.03.04.05.06.07.08.09.0a.0b.0c.0d.0e.0f";
 assert(handle_id_edit_cb(&app,ats) && state.ats.length==16);
 for(unsigned i=0;i<16;i++)assert(state.ats.data[i]==i);
 char formatted[49];memset(formatted,0x7e,sizeof(formatted));
 format_id_edit_text(app.id_edit_type,formatted);assert(strcmp(formatted,ats)==0 && formatted[48]==0x7e);
 assert(!handle_id_edit_cb(&app,"00.01.02.03.04.05.06.07.08.09.0a.0b.0c.0d.0e.0f.10"));
 assert(state.ats.length==16);assert(handle_id_edit_cb(&app,"") && state.ats.length==0);
 uint32_t rng=19;
 for(unsigned test=0;test<40000;test++) {
  char text[80];unsigned length=test%79;
  for(unsigned i=0;i<length;i++){rng=rng*1664525u+1013904223u;text[i]=(char)(33+(rng%90));}text[length]=0;
  app.id_edit_type=(app_chameleon_id_edit_type_t)(test%4);state.size=sizes[test%3];
  memcpy(before,&state,sizeof(state));
  if(!handle_id_edit_cb(&app,text))assert(memcmp(before,&state,sizeof(state))==0);
  for(unsigned i=0;i<16;i++)assert(state.guard[i]==0xa5);
 }
 puts("PASS: exact UID/SAK/ATQA/ATS, unchanged on failure, guards and 40000 malformed inputs");
}
''')

    def test_real_nickname_limits_and_output_termination(self):
        source = (SRC / 'app/chameleon/port/tag_helper.c').read_text()
        code = '\n'.join(function(source, n) for n in ('tag_helper_get_nickname', 'tag_helper_set_nickname'))
        self.compile_run(r'''
#include <assert.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include "vfs_meta.h"
#define FDS_SLOT_TAG_DUMP_FILE_ID_BASE 10
#define TAG_SENSE_HF 1
#define _T(x) "Slot"
static vfs_meta_t stored;
static int read_error,write_error,writes,reads;
static uint8_t tag_emulation_get_slot(void) {return 2;}
static int fds_read_meta(int a,int b,vfs_meta_t *m) {reads++;*m=stored;return read_error;}
static int fds_write_meta(int a,int b,vfs_meta_t *m) {writes++;stored=*m;return write_error;}
''' + code + r'''
int main(void) {
 char name[91];memset(name,'n',90);name[90]=0;
 assert(tag_helper_set_nickname(name)<0 && writes==0 && reads==0);
 assert(tag_helper_set_nickname(NULL)<0 && writes==0);
 name[89]=0;assert(tag_helper_set_nickname(name)==0 && writes==1 && stored.notes[89]==0);
 struct {char out[4];char guard[8];} output;memset(&output,0xa5,sizeof(output));
 tag_helper_get_nickname(output.out,4);assert(strcmp(output.out,"nnn")==0);
 for(unsigned i=0;i<8;i++)assert((unsigned char)output.guard[i]==0xa5);
 int old_reads=reads;tag_helper_get_nickname(NULL,10);tag_helper_get_nickname(output.out,0);assert(reads==old_reads);
 stored.has_notes=false;tag_helper_get_nickname(output.out,1);assert(output.out[0]==0);
 tag_helper_get_nickname(output.out,4);assert(strcmp(output.out,"Slo")==0);
 read_error=-7;assert(tag_helper_set_nickname("valid")==-7 && writes==1);
 read_error=0;write_error=-9;assert(tag_helper_set_nickname("valid")==-9);
 memset(stored.notes,'x',sizeof(stored.notes));stored.has_notes=true;
 tag_helper_get_nickname(output.out,4);assert(strcmp(output.out,"xxx")==0);
 puts("PASS: nickname limits, terminating short outputs, invalid metadata and IO failures");
}
''', [SRC / 'mod/vfs'])


if __name__ == '__main__':
    unittest.main()
