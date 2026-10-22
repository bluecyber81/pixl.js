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
    def test_real_id_callbacks_and_malformed_inputs(self):
        source = (SRC / 'app/chameleon/scene/chameleon_scene_menu_card_advanced_id_edit.c').read_text()
        code = '\n'.join(function(source, name) for name in
                         ('chameleon_id_hex_digit', 'chameleon_id_parse_bytes', 'handle_id_edit_cb', 'format_id_edit_text'))
        self.compile_run(PREFIX + code + r'''
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
