"""Actual file-loader/writer C functions with synthetic files and bounded decoder output."""
from pathlib import Path
import unittest
import test_player_v3 as host


class FilePersistenceTests(unittest.TestCase):
    compile_run = host.NativeTests.compile_run

    def test_loader_with_real_metadata_decoder_rejects_malformed_records(self):
        source = (host.SRC / "app/amiibo/scene/amiibo_scene_amiibo_detail.c").read_text(encoding="utf-8")
        read = host.function(source, "ntag_read")
        self.compile_run(r'''
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "vfs.h"
static int32_t vfs_persist_recover(vfs_driver_t*d) {(void)d;return VFS_OK;}
#include "ntag_def.h"
#include "vfs_meta.c"
#define NRF_ERR_NOT_AMIIBO -1000
#define NRF_ERR_READ_ERROR -1001
#define NRF_SUCCESS 0
#define NRF_LOG_INFO(...) ((void)0)
static uint8_t wire[128];
static int stat_fake(const char *p,vfs_obj_t *o) {(void)p;memset(o,0,sizeof(*o));o->size=540;o->type=VFS_TYPE_REG;memcpy(o->meta,wire,128);return 0;}
static int read_fake(const char *p,void *data,size_t n) {(void)p;memset(data,4,n);return (int)n;}
''' + read + r'''
int main(void) {
 vfs_driver_t driver={.stat_file=stat_fake,.read_file_data=read_fake};
 struct {uint8_t before[32];ntag_t tag;uint8_t after[32];} guarded;
 memset(&guarded,0xa5,sizeof(guarded));
 wire[0]=1;wire[1]=VFS_META_TYPE_NOTES;
 assert(ntag_read(&driver,"/short-meta",&guarded.tag)==0 && guarded.tag.notes[0]==0);
 wire[0]=254;assert(ntag_read(&driver,"/long-meta",&guarded.tag)==0 && guarded.tag.notes[0]==0);
 memset(wire,0,sizeof(wire));wire[0]=5;wire[1]=VFS_META_TYPE_NOTES;wire[2]=100;
 assert(ntag_read(&driver,"/bad-len",&guarded.tag)==0 && guarded.tag.notes[0]==0);
 memset(wire,0,sizeof(wire));wire[0]=102;wire[1]=VFS_META_TYPE_NOTES;wire[2]=100;memset(wire+3,'A',100);
 assert(ntag_read(&driver,"/valid-long-notes",&guarded.tag)==0);
 assert(strlen((char*)guarded.tag.notes)==89);
 for(unsigned j=0;j<32;j++)assert(guarded.before[j]==0xa5 && guarded.after[j]==0xa5);
 puts("PASS: real metadata decoder plus real loader reject malformed notes without overwriting tag bounds");return 0;
}
''', {"boards.h": ""}, [host.SRC / "mod/vfs", host.SRC / "mod/df", host.SRC / "ntag"])

    def test_exact_formats_notes_signature_tail_and_short_io(self):
        source = (host.SRC / "app/amiibo/scene/amiibo_scene_amiibo_detail.c").read_text(encoding="utf-8")
        read = host.function(source, "ntag_read")
        write = host.function(source, "ntag_write")
        self.compile_run(r'''
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "vfs.h"
static int32_t vfs_persist_recover(vfs_driver_t*d) {(void)d;return VFS_OK;}
static int32_t vfs_persist_write(vfs_driver_t*d,const char*p,const void*b,size_t n) {return d->write_file_data(p,(void*)b,n);}
#include "ntag_def.h"
#include "vfs_meta.h"
#define NRF_ERR_NOT_AMIIBO -1000
#define NRF_ERR_READ_ERROR -1001
#define NRF_ERR_WRITE_ERROR -1002
#define NRF_SUCCESS 0
#define NRF_LOG_INFO(...) ((void)0)
static size_t file_size,requested_read,requested_write;
static int read_delta,write_delta,stat_result,note_mode,writes;
static uint8_t file_data[2048],saved[2048],wire_meta[128];
static int stat_fake(const char *p,vfs_obj_t *o) {(void)p;memset(o,0,sizeof(*o));o->type=VFS_TYPE_REG;o->size=file_size;memcpy(o->meta,wire_meta,128);return stat_result;}
static int read_fake(const char *p,void *data,size_t n) {(void)p;requested_read=n;assert(n<=sizeof(file_data));memcpy(data,file_data,n);return (int)n+read_delta;}
static int write_fake(const char *p,void *data,size_t n) {(void)p;requested_write=n;writes++;assert(n<=sizeof(saved));memcpy(saved,data,n);return (int)n+write_delta;}
/* Decoder is separately tested by its owner. Exercise even its maximum-sized
   non-terminated output here, so the loader has an independent copy bound. */
void vfs_meta_decode(uint8_t *data,uint8_t size,vfs_meta_t *out) {
 (void)data;(void)size;memset(out,0,sizeof(*out));
 if(note_mode){out->has_notes=true;memset(out->notes,'N',sizeof(out->notes));}
}
''' + read + "\n" + write + r'''
int main(void) {
 vfs_driver_t driver={.stat_file=stat_fake,.read_file_data=read_fake,.write_file_data=write_fake};
 struct {uint8_t before[32];ntag_t tag;uint8_t after[32];} guarded;
 memset(&guarded,0xa5,sizeof(guarded));
 const size_t sizes[]={532,540,572,2048};
 for(unsigned k=0;k<4;k++) {
  file_size=sizes[k];for(size_t j=0;j<file_size;j++)file_data[j]=(uint8_t)(j*17+3);
  memset(saved,0,sizeof(saved));memset(wire_meta,0,128);wire_meta[0]=1;note_mode=0;
  assert(ntag_read(&driver,"/file",&guarded.tag)==0);
  assert(requested_read==file_size && memcmp(guarded.tag.data,file_data,file_size)==0);
  assert(guarded.tag.type==_ntag_type(file_size) && guarded.tag.notes[0]==0);
  assert(ntag_write(&driver,"/file",&guarded.tag)==0);
  assert(requested_write==file_size && memcmp(saved,file_data,file_size)==0);
  read_delta=-1;assert(ntag_read(&driver,"/file",&guarded.tag)==NRF_ERR_READ_ERROR);read_delta=0;
  write_delta=-1;assert(ntag_write(&driver,"/file",&guarded.tag)==NRF_ERR_WRITE_ERROR);write_delta=0;
 }
 for(unsigned j=0;j<32;j++)assert(guarded.before[j]==0xa5 && guarded.after[j]==0xa5);
 file_size=540;note_mode=1;wire_meta[0]=254;
 assert(ntag_read(&driver,"/notes",&guarded.tag)==0);
 for(unsigned j=0;j<VFS_META_MAX_NOTES_SIZE;j++)assert(guarded.tag.notes[j]=='N');
 assert(guarded.tag.notes[VFS_META_MAX_NOTES_SIZE]==0);
 file_size=2048;read_delta=532-2048;assert(ntag_read(&driver,"/short-v3",&guarded.tag)==NRF_ERR_READ_ERROR);read_delta=0;
 file_size=533;assert(ntag_read(&driver,"/bad-size",&guarded.tag)==NRF_ERR_NOT_AMIIBO);
 int prior=writes;assert(ntag_write(&driver,"/bad-size",&guarded.tag)==NRF_ERR_WRITE_ERROR && writes==prior);
 file_size=2048;guarded.tag.type=NTAG_215;assert(ntag_write(&driver,"/wrong-type",&guarded.tag)==NRF_ERR_WRITE_ERROR && writes==prior);
 stat_result=-1;assert(ntag_read(&driver,"/missing",&guarded.tag)==NRF_ERR_READ_ERROR);
 puts("PASS: exact 532/540/572/2048-byte IO, signature preservation, bounded notes, short IO rejection");return 0;
}
''', {"boards.h": ""}, [host.SRC / "mod/vfs", host.SRC / "ntag"])


if __name__ == "__main__":
    unittest.main()
