"""Database NFC save lifecycle. Actual callback, API and metadata codec.

Persistence is a deterministic boundary stub. Set PIXL_SANITIZE=1 or
PIXL_ARM32=1 for instrumented host or32-bit ARM/QEMU execution.
"""
from pathlib import Path
from types import SimpleNamespace
import hashlib,json,os,shutil,subprocess,tempfile,unittest

FW=Path(__file__).resolve().parents[2]
SRC=FW/'application/src'

def function(source, name):
    begin=source.rfind('\n',0,source.index(name+'('))+1
    pos=source.index('{',begin)+1; depth=1
    while depth:
        depth+=(source[pos]=='{')-(source[pos]=='}');pos+=1
    return source[begin:pos]


class SlotPersistenceTests(unittest.TestCase):
    def test_database_nfc_preserves_metadata_and_original_format(self):
        args=SimpleNamespace(candidate=True,sanitize=os.environ.get('PIXL_SANITIZE')=='1',arm32=os.environ.get('PIXL_ARM32')=='1')
        use=SRC
        api=use/'app/amiidb/api'
        detail=use/'app/amiidb/scene/amiidb_scene_amiibo_detail.c'
        files=[api/'amiidb_api_slot.c',api/'amiidb_api_slot.h',detail,SRC/'mod/vfs/vfs_meta.c',SRC/'mod/vfs/vfs_meta.h']
        hashes={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
        stubs={
            'boards.h':'',
            'settings.h':'''#pragma once
        #include <stdint.h>
        #include <stdbool.h>
        typedef struct {uint8_t amiidb_data_slot_num;bool auto_gen_amiibo;} settings_data_t;
        settings_data_t *settings_get_data(void);
        ''',
            'amiibo_helper.h':'''#pragma once
        #include <stdbool.h>
        #include <stdint.h>
        #define NRF_SUCCESS 0
        static uint32_t to_little_endian_int32(const uint8_t *p){return ((uint32_t)p[0]<<24)|((uint32_t)p[1]<<16)|((uint32_t)p[2]<<8)|p[3];}
        static bool amiibo_helper_is_key_loaded(void){return false;}
        '''
        }
        program=r'''
        #include <assert.h>
        #include <stdio.h>
        #include <string.h>
        #include "amiidb_api_slot.h"
        #include "vfs.h"
        #include "vfs_meta.h"
        #include "vfs_persist.h"
        #include "settings.h"
        static settings_data_t settings={.amiidb_data_slot_num=50};
        settings_data_t *settings_get_data(void){return &settings;}
        static unsigned char stored_data[2048],stored_meta[128],expected_meta[128];
        static unsigned file_size,store_type=VFS_TYPE_REG;
        static int recovery_error,stat_error,write_error,short_write,no_driver,writes,metawrites,save_errors;
        static int stat_file(const char*p,vfs_obj_t*o){assert(strncmp(p,"/amiibo/data/",13)==0);o->size=file_size;o->type=store_type;memcpy(o->meta,stored_meta,128);return stat_error;}
        static int read_data(const char*p,void*b,size_t n){(void)p;assert(n==file_size);memcpy(b,stored_data,n);return (int)n;}
        static int update_meta(const char*p,void*b,size_t n){(void)p;assert(n==128);memcpy(stored_meta,b,n);return 0;}
        static vfs_driver_t driver={.stat_file=stat_file,.read_file_data=read_data,.update_file_meta=update_meta};
        vfs_driver_t *vfs_get_driver(vfs_drive_t d){assert(d==VFS_DRIVE_EXT);return no_driver?NULL:&driver;}
        int32_t vfs_persist_recover(vfs_driver_t*d){assert(d==&driver);return recovery_error;}
        int32_t vfs_persist_write(vfs_driver_t*d,const char*p,const void*b,size_t n){
         assert(d==&driver && p && b && n<=2048);writes++;
         if(write_error)return write_error;if(short_write)return (int32_t)n-1;
         memcpy(stored_data,b,n);file_size=n;return (int32_t)n;
        }
        int32_t vfs_persist_write_meta(vfs_driver_t*d,const char*p,const void*b,size_t n,const uint8_t*m){
         metawrites++;int32_t r=vfs_persist_write(d,p,b,n);if(r==(int32_t)n)memcpy(stored_meta,m,128);return r;
        }
        bool is_valid_amiibo_v3(uint32_t h,uint32_t t){return h==1 && t==3;}
        #include "vfs_meta.c"
        #include "amiidb_api_slot.c"
        typedef enum {NTAG_EVENT_TYPE_WRITTEN,NTAG_EVENT_TYPE_READ} ntag_event_type_t;
        typedef struct {ntag_t ntag;} app_amiidb_t;
        static unsigned m_amiibo_gen_delay_timer,m_generate_generation;
        static bool m_active_slot_persist=true;
        static uint8_t m_active_slot;
        static void app_timer_stop(unsigned x){(void)x;}
        static void app_timer_start(unsigned x,unsigned y,void*z){(void)x;(void)y;(void)z;}
        #define APP_TIMER_TICKS(x) (x)
        static unsigned ntag_emu_get_generation(void){return 1;}
        static void ntag_emu_save_failed(void){save_errors++;}
        static void* mui(void){return NULL;}
        static void mui_update(void*p){(void)p;}
        CALLBACK
        static void reset(unsigned size){
         file_size=size;store_type=VFS_TYPE_REG;recovery_error=stat_error=write_error=short_write=no_driver=writes=metawrites=save_errors=0;
         for(unsigned i=0;i<2048;i++)stored_data[i]=(i*37+13)&255;
         stored_data[84]=0;stored_data[85]=0;stored_data[86]=0;stored_data[87]=1;
         stored_data[88]=0;stored_data[89]=0;stored_data[90]=0;stored_data[91]=3;
         vfs_meta_t m={.has_notes=true,.has_flags=true,.has_amiibo_id=true,.flags=0x83,.amiibo_head=1,.amiibo_tail=3};
         strcpy(m.notes,"my note / Spielstand 2");vfs_meta_encode(stored_meta,128,&m);
         /* All bytes outside the parsed record are still user Raw128 metadata. */
         for(unsigned i=stored_meta[0]+1;i<128;i++)stored_meta[i]=(i*13+19)&255;
         memcpy(expected_meta,stored_meta,128);
        }
        int main(void){
         unsigned lost_metadata=0,changed_size=0,lost_signature=0,cases=0;
         const unsigned sizes[]={532,540,572,2048};
         for(unsigned i=0;i<4;i++){
          reset(sizes[i]);ntag_t tag;app_amiidb_t app;
          assert(amiidb_api_slot_read(0,&tag)==0);
          assert(strcmp((char*)tag.notes,"my note / Spielstand 2")==0);
          unsigned char signature[32];memcpy(signature,tag.data+540,32);
          tag.data[100]^=0x5a;ntag_update_cb(NTAG_EVENT_TYPE_WRITTEN,&app,&tag);
          assert(save_errors==0 && writes==1 && stored_data[100]==tag.data[100]);
          lost_metadata+=memcmp(stored_meta,expected_meta,128)!=0;
          changed_size+=file_size!=sizes[i];
          lost_signature+=(sizes[i]==572 && (file_size!=572 || memcmp(stored_data+540,signature,32)!=0));cases++;
         }
         if(!CANDIDATE){
          assert(lost_metadata==4 && changed_size==2 && lost_signature==1);
          printf("{\"baselineReproduced\":true,\"metadataLostCases\":%u,\"changedLengthCases\":%u,\"signatureLossCases\":%u,\"cases\":%u}\n",lost_metadata,changed_size,lost_signature,cases);
          return 0;
         }
        #if CANDIDATE
         assert(lost_metadata==0 && changed_size==0 && lost_signature==0);
         /* Unknown metadata, duplicate fields and arbitrary padding remain byte exact. */
         for(unsigned mode=0;mode<4;mode++){
          reset(540);ntag_t tag;app_amiidb_t app;
          if(mode==0){stored_meta[0]=3;stored_meta[1]=0x7e;}
          else if(mode==1)stored_meta[0]=0xff;
          else if(mode==2){stored_meta[0]=4;stored_meta[1]=2;stored_meta[2]=0;stored_meta[3]=2;stored_meta[4]=3;}
          else memset(stored_meta,0xcc,128);
          memcpy(expected_meta,stored_meta,128);assert(amiidb_api_slot_read(0,&tag)==0);
          ntag_update_cb(NTAG_EVENT_TYPE_WRITTEN,&app,&tag);assert(writes==1 && save_errors==0 && memcmp(stored_meta,expected_meta,128)==0);cases++;
         }
         /* 2K data viewed as classic when its ID is not a v3 figure stays supported. */
         reset(2048);stored_data[91]=4;stored_meta[0]=0;memcpy(expected_meta,stored_meta,128);
         ntag_t tag;app_amiidb_t app;assert(amiidb_api_slot_read(0,&tag)==0 && tag.type==NTAG_215);
         ntag_update_cb(NTAG_EVENT_TYPE_WRITTEN,&app,&tag);assert(file_size==2048 && writes==1 && save_errors==0 && memcmp(stored_meta,expected_meta,128)==0);cases++;
         const int errors[]={VFS_ERR_FAIL,VFS_ERR_NODEV,VFS_ERR_CRPT,VFS_ERR_NOSPC};
         for(unsigned i=0;i<4;i++){
          reset(540);assert(amiidb_api_slot_read(0,&tag)==0);stat_error=errors[i];
          ntag_update_cb(NTAG_EVENT_TYPE_WRITTEN,&app,&tag);assert(writes==0 && save_errors==1 && memcmp(stored_meta,expected_meta,128)==0);cases++;
          reset(540);assert(amiidb_api_slot_read(0,&tag)==0);recovery_error=errors[i];
          ntag_update_cb(NTAG_EVENT_TYPE_WRITTEN,&app,&tag);assert(writes==0 && save_errors==1);cases++;
          reset(540);assert(amiidb_api_slot_read(0,&tag)==0);write_error=errors[i];
          ntag_update_cb(NTAG_EVENT_TYPE_WRITTEN,&app,&tag);assert(writes==1 && save_errors==1 && memcmp(stored_meta,expected_meta,128)==0);cases++;
         }
         reset(540);assert(amiidb_api_slot_read(0,&tag)==0);short_write=1;ntag_update_cb(NTAG_EVENT_TYPE_WRITTEN,&app,&tag);assert(save_errors==1);cases++;
         reset(540);assert(amiidb_api_slot_read(0,&tag)==0);no_driver=1;ntag_update_cb(NTAG_EVENT_TYPE_WRITTEN,&app,&tag);assert(writes==0 && save_errors==1);cases++;
         reset(540);assert(amiidb_api_slot_read(0,&tag)==0);store_type=VFS_TYPE_DIR;ntag_update_cb(NTAG_EVENT_TYPE_WRITTEN,&app,&tag);assert(writes==0 && save_errors==1);cases++;
         reset(540);assert(amiidb_api_slot_read(0,&tag)==0);file_size=539;ntag_update_cb(NTAG_EVENT_TYPE_WRITTEN,&app,&tag);assert(writes==0 && save_errors==1);cases++;
         reset(540);assert(amiidb_api_slot_read(0,&tag)==0);tag.type=NTAG_I2C_PLUS_2K;ntag_update_cb(NTAG_EVENT_TYPE_WRITTEN,&app,&tag);assert(writes==0 && save_errors==1);cases++;
         reset(540);assert(amiidb_api_slot_read(0,&tag)==0);stat_error=VFS_ERR_NOOBJ;ntag_update_cb(NTAG_EVENT_TYPE_WRITTEN,&app,&tag);assert(writes==1 && metawrites==1 && save_errors==0);cases++;
         reset(540);assert(amiidb_api_slot_read(0,&tag)==0);assert(amiidb_api_slot_update(50,&tag)==VFS_ERR_FAIL && amiidb_api_slot_update(0,NULL)==VFS_ERR_FAIL && writes==0);cases++;
         /* Explicitly selecting a different figure still deliberately replaces metadata. */
         reset(540);assert(amiidb_api_slot_read(0,&tag)==0);tag.data[91]=5;assert(amiidb_api_slot_write(0,&tag)==0 && metawrites==1);
         vfs_meta_t m;vfs_meta_decode(stored_meta,128,&m);assert(!m.has_notes && m.amiibo_tail==5);cases++;
         printf("{\"passed\":true,\"cases\":%u,\"metadataLostCases\":%u,\"changedLengthCases\":%u,\"signatureLossCases\":%u,\"pointerBytes\":%u}\n",cases,lost_metadata,changed_size,lost_signature,(unsigned)sizeof(void*));
        #endif
         return 0;
        }
        '''.replace('CALLBACK',function(detail.read_text(),'ntag_update_cb')).replace('CANDIDATE','1' if args.candidate else '0')
        with tempfile.TemporaryDirectory(prefix='de347-slot-audit-') as td:
            temp=Path(td)
            for name,data in stubs.items():(temp/name).write_text(data)
            c=temp/'test.c';c.write_text(program)
            exe=temp/'test.exe'
            compiler=shutil.which('arm-linux-gnueabihf-gcc' if args.arm32 else 'gcc')
            assert compiler
            cmd=[compiler,'-std=c11','-O1','-g','-Wall','-Wextra','-Werror','-Wno-unused-parameter','-Wno-unused-function','-Wno-misleading-indentation']
            for path in [temp,api,SRC/'amiidb',SRC/'mod/vfs',SRC/'ntag',SRC/'mod/df']:cmd+=['-I',str(path)]
            cmd +=[str(c),'-o',str(exe)]
            if args.arm32:cmd+=['-static']
            elif args.sanitize:cmd+=['-fsanitize=address,undefined','-fno-sanitize-recover=all','-fno-omit-frame-pointer','-fno-pie','-no-pie']
            built=subprocess.run(cmd,capture_output=True,text=True,timeout=60)
            assert built.returncode==0,built.stdout+built.stderr
            ran=subprocess.run((['qemu-arm'] if args.arm32 else [])+[str(exe)],capture_output=True,text=True,timeout=30)
            assert ran.returncode==0,ran.stdout+ran.stderr
            result=json.loads(ran.stdout.strip());print(ran.stdout.strip())
            assert hashes=={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
            report={'candidate':args.candidate,'sanitize':args.sanitize,'arm32':args.arm32,'deviceAccess':False,'sourceHashes':hashes,'sourcesUnchanged':True,'observations':result,'limits':['Actual NFC callback, slot API and metadata codec; fake persistence boundary.','Atomic persistence verified by independent Packed filesystem suites, not this isolated test.','No actual NFC radio, physical flash, full firmware RAM watermark or timing measured.']}
            label=('candidate' if args.candidate else 'baseline')+('-arm32' if args.arm32 else '-asan' if args.sanitize else '-native')
            destination=os.environ.get('PIXL_SLOT_SAVE_REPORT')
            if destination:Path(destination).write_text(json.dumps(report,indent=2)+'\n')
            print('PASS: actual database NFC save preserves raw metadata and original formats;29cases')

if __name__=="__main__":unittest.main()
