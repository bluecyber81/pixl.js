"""Actual error-handler/cache functions; no device access.
PIXL_SANITIZE=1 enables ASan/UBSan. PIXL_FAULT_FW selects an isolated patch tree.
The separate baseline reproducer is evidence only, not normal suite discovery.
"""
from pathlib import Path
import os,re,subprocess,tempfile,unittest
FW=Path(os.environ.get('PIXL_FAULT_FW',Path(__file__).resolve().parents[2]))
SRC=FW/'application/src'

def function(source,name):
    match=re.search(r'^[\w *]+\b'+re.escape(name)+r'\([^;]*?\)\s*\{',source,re.M)
    assert match,name
    start=source.index('{',match.start());end=start+1;depth=1
    while depth:
        depth += (source[end]=='{')-(source[end]=='}');end+=1
    return source[match.start():end]

PRELUDE=r"""
#include <assert.h>
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <string.h>
#include <stdio.h>
#include <setjmp.h>
static jmp_buf escape;
static unsigned irq,barriers,resets,breakpoints,io_calls,crc_calls;
static void disable_irq(void){irq=1;}
static void barrier(void){assert(irq);barriers++;}
static void reset(void){resets++;longjmp(escape,1);}
static void breakpoint(void){breakpoints++;longjmp(escape,2);}
#define __disable_irq disable_irq
#define __DSB barrier
#define NVIC_SystemReset reset
#define NRF_BREAKPOINT_COND breakpoint()
#define NRF_SUCCESS 0
#define NRF_LOG_INFO(...) ((void)++io_calls)
#define NRF_LOG_WARNING(...) ((void)++io_calls)
#define NRF_LOG_ERROR(...) ((void)++io_calls)
#define NRF_LOG_FINAL_FLUSH() ((void)++io_calls)
#define _exit firmware_exit
static uint32_t crc32_compute(const void *p,size_t n,const uint32_t *seed){
 const unsigned char *b=p;uint32_t h=seed?*seed:0xFFFFFFFFu;crc_calls++;
 for(size_t i=0;i<n;i++){h^=b[i];for(unsigned j=0;j<8;j++)h=(h>>1)^((h&1u)?0xEDB88320u:0);}
 return h^0xFFFFFFFFu;
}
"""

class FaultResetTests(unittest.TestCase):
    def run_c(self,code,debug=False):
        with tempfile.TemporaryDirectory(prefix='pixl-fault-') as temp:
            folder=Path(temp)
            for name in ('app_error.h','app_util_platform.h','vfs.h'):
                (folder/name).write_text('#pragma once\n')
            path=folder/'test.c';path.write_text(code,encoding='utf-8')
            binary=folder/('test.exe' if os.name=='nt' else 'test')
            arm32=os.environ.get('PIXL_ARM32')=='1'
            command=[('arm-linux-gnueabihf-gcc' if arm32 else os.environ.get('CC','gcc')),'-std=c11','-O1','-g','-fshort-enums','-Wall','-Wextra','-Werror',
                     '-Wno-unused-function','-Wno-unused-variable','-Wno-unused-parameter',
                     '-Wno-sign-compare', # Existing int32 CRC storage vs SDK uint32 result.
                     '-I',str(folder),'-I',str(SRC/'ntag'),'-I',str(SRC/'mod')]
            if debug:command+=['-DDEBUG=1']
            if arm32:command+=['-static']
            if os.environ.get('PIXL_SANITIZE')=='1':command+=['-fsanitize=address,undefined','-fno-omit-frame-pointer']
            built=subprocess.run(command+[str(path),'-o',str(binary)],capture_output=True,text=True,timeout=60)
            self.assertEqual(built.returncode,0,built.stdout+built.stderr)
            ran=subprocess.run((['qemu-arm'] if arm32 else [])+[str(binary)],capture_output=True,text=True,timeout=30)
            self.assertEqual(ran.returncode,0,ran.stdout+ran.stderr)
            self.assertIn('PASS',ran.stdout)
            print(ran.stdout.strip())

    def code(self):
        cache=(SRC/'mod/cache.c').read_text(encoding='utf-8')
        return PRELUDE+'\n#include "'+(SRC/'mod/cache.h').as_posix()+'"\n'+r'''
static cache_data_t m_cache_data;
static int32_t m_cache_crc32;
uint8_t __start_noinit, __stop_noinit;
static size_t cache_noinit_size(void){return sizeof(cache_data_t);}
'''+ '\n'.join(function(cache,name) for name in ('cache_invalidate','cache_valid'))

    def test_fault_reset_release_and_debug(self):
        source=(SRC/'app_error_handler.c').read_text(encoding='utf-8')
        for forbidden in ('__get_MSP(', 'sp[', 'sprintf(', 'printf(', 'mui_panic(', 'cache_clean(',
                          'NRF_LOG_', 'app_error_save_and_stop('):
            clean=re.sub(r'/\*.*?\*/|//[^\n]*','',source,flags=re.S)
            self.assertNotIn(forbidden,clean)
        code=self.code()+'\n#include "'+(SRC/'app_error_handler.c').as_posix()+'"\n'+r'''
static cache_data_t before;
int main(void){
 const uint32_t args[]={0,1,0xFFFFFFFFu,0x20000000u,0xDEADBEEFu};static unsigned cases,op,ai,state;
 for(op=0;op<3;op++)for(ai=0;ai<5;ai++)for(state=0;state<3;state++){
  memset(&m_cache_data,(int)(0x30u+ai),sizeof(m_cache_data));m_cache_data.enabled=(int32_t)state-1;
  before=m_cache_data;int32_t old_crc=m_cache_crc32=(int32_t)args[ai];
  irq=barriers=resets=breakpoints=io_calls=crc_calls=0;
  int terminal=setjmp(escape);
  if(!terminal){
   if(op==0)app_error_fault_handler(args[ai],~args[ai],args[ai]);
   else if(op==1)HardFault_Handler();else _exit((int)args[ai]);
   assert(!"fault handler returned");
  }
#ifdef DEBUG
  assert(terminal==2&&breakpoints==1&&resets==0);
#else
  assert(terminal==1&&resets==1&&breakpoints==0);
#endif
  assert(irq==1&&barriers==1&&io_calls==0&&crc_calls==0);
  assert(m_cache_data.enabled==-1&&m_cache_crc32==old_crc);
  before.enabled=-1;assert(!memcmp(&before,&m_cache_data,sizeof(before)));
  assert(!cache_valid());assert(io_calls==0&&crc_calls==0);cases++;
 }
 printf("PASS: %u fault paths; reset/debug stop; no CRC, logging, UI or metadata dereference\n",cases);
 return 0;
}
'''
        self.run_c(code)
        self.run_c(code,True)

    def test_retained_cache_sentinel_and_compatibility(self):
        self.run_c(self.code()+r'''
int main(void){
 unsigned cases=0;
 _Static_assert(sizeof(ntag_t)==2178,"existing short-enum tag ABI");
 _Static_assert(sizeof(cache_data_t)==2500,"existing short-enum retained ABI");
 _Static_assert(offsetof(cache_data_t,enabled)==0,"existing enabled ABI");
 _Static_assert(offsetof(cache_data_t,id)==4,"existing id ABI");
 _Static_assert(offsetof(cache_data_t,ntag)==8,"existing tag offset");
 _Static_assert(offsetof(cache_data_t,retain_data)==2186,"existing resume offset");
 for(unsigned pattern=0;pattern<256;pattern++)for(int enabled=0;enabled<=1;enabled++){
  memset(&m_cache_data,(int)pattern,sizeof(m_cache_data));m_cache_data.enabled=enabled;
  m_cache_crc32=(int32_t)crc32_compute(&m_cache_data,sizeof(m_cache_data),NULL);
  assert(cache_valid());cases++;
  cache_invalidate();io_calls=crc_calls=0;assert(!cache_valid());assert(io_calls==0&&crc_calls==0);cases++;
  /* Even a matching CRC must not resurrect a fault-invalidated image. */
  m_cache_crc32=(int32_t)crc32_compute(&m_cache_data,sizeof(m_cache_data),NULL);
  io_calls=crc_calls=0;assert(!cache_valid());assert(io_calls==0&&crc_calls==0);cases++;
  cache_invalidate();assert(!cache_valid());cases++;
  /* Normal save/clean rewrites enabled to 0 or 1 before computing the CRC. */
  m_cache_data.enabled=enabled;m_cache_crc32=(int32_t)crc32_compute(&m_cache_data,sizeof(m_cache_data),NULL);
  assert(cache_valid());m_cache_data.retain_data[pattern%312]^=1;assert(!cache_valid());cases+=2;
 }
 const int32_t invalid[]={-1,-2,2,INT32_MIN,INT32_MAX};
 for(unsigned i=0;i<sizeof(invalid)/sizeof(invalid[0]);i++){
  m_cache_data.enabled=invalid[i];m_cache_crc32=(int32_t)crc32_compute(&m_cache_data,sizeof(m_cache_data),NULL);
  io_calls=crc_calls=0;assert(!cache_valid());assert(io_calls==0&&crc_calls==0);cases++;
 }
 printf("PASS: %u retained-cache cases; unchanged 2500-byte short-enum ABI and CRC format\n",cases);return 0;
}
''')

if __name__=='__main__':unittest.main()
