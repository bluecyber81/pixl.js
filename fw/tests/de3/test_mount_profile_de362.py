"""Actual mount instrumentation against an independent NOR counter; no device."""
from pathlib import Path
import subprocess
import tempfile
import unittest
from test_packed_vfs_persistence_de344 import HERE, FW


class MountProfileTests(unittest.TestCase):
    def test_actual_adapter_counts_oom_errors_and_warm_mount(self):
        core = FW / 'application/src/mod/vfs'
        lfs = FW / 'components/littlefs'
        with tempfile.TemporaryDirectory(prefix='mount-profile-de362-') as temporary:
            folder = Path(temporary)
            (folder / 'boards.h').write_text('#pragma once\n#define VFS_PACKED_LFS_ENABLE 1\n')
            (folder / 'mui_mem.h').write_text('''#pragma once
#include <stddef.h>
#include <stdint.h>
void *mui_mem_malloc(size_t);void mui_mem_free(void*);
typedef struct { uint32_t total_size,free_size,free_biggest_size; } mui_mem_monitor_t;
void mui_mem_monitor(mui_mem_monitor_t*);
''')
            (folder / 'app_util_platform.h').write_text('#define CRITICAL_REGION_ENTER() do {\n#define CRITICAL_REGION_EXIT() } while(0)\n')
            (folder / 'app_timer.h').write_text('''#pragma once
#include <stdint.h>
#define APP_TIMER_CONFIG_RTC_FREQUENCY 1u
#define APP_TIMER_CLOCK_FREQ 32768u
uint32_t app_timer_cnt_get(void);
static inline uint32_t app_timer_cnt_diff_compute(uint32_t a,uint32_t b){return (a-b)&0xffffffu;}
''')
            header = (HERE / 'test_packed_vfs_persistence_de344.py').read_text().split("(folder/'hal_spi_flash.h').write_text('''")[1].split("'''")[0]
            (folder / 'hal_spi_flash.h').write_text(header)
            contract = (HERE / 'packed_vfs_persistence_de344.c').read_text()
            contract = contract[:contract.index('static void boundary_api(')]
            contract = contract.replace('uint32_t hal_spi_flash_info(flash_info_t *out){', 'static bool bad_geometry;\nuint32_t hal_spi_flash_info(flash_info_t *out){if(bad_geometry)return 1;')
            source = contract + r'''
uint32_t app_timer_cnt_get(void){return read_calls*32u;}
void mui_mem_monitor(mui_mem_monitor_t*m){memset(m,0,sizeof(*m));}
static uint32_t word(const uint8_t*p){return (uint32_t)p[0]|(uint32_t)p[1]<<8|(uint32_t)p[2]<<16|(uint32_t)p[3]<<24;}
static void check_profile(bool cache){
 uint8_t p[80];REQUIRE(runtime_diag_startup_mount_snapshot(p,sizeof(p)));
 REQUIRE(word(p+40)==(cache?23u:19u) && !word(p+44));
 REQUIRE(word(p+56)==read_calls && word(p+60)==media.stats.reads*256);
 REQUIRE(word(p+68)+word(p+72)==word(p+56) && !word(p+76));
 REQUIRE(word(p+48)==0 && word(p+52)==read_calls*32000u/16384u);
 if(!cache)REQUIRE(!word(p+64));
}
int main(void){
 uint8_t before[80],after[80];
 REQUIRE(runtime_diag_startup_mount_snapshot(before,80) && !word(before+40));
 for(unsigned i=0;i<2048;i++){old_data[i]=(uint8_t)(i*7+3);new_data[i]=(uint8_t)(i*13+5);}
 for(unsigned i=0;i<128;i++)meta[i]=(uint8_t)(i*9+17);
 baseline();nor_reset_observation(&media);read_calls=0;
 REQUIRE(driver()->mount()==0);check_profile(true);
 REQUIRE(runtime_diag_startup_mount_snapshot(before,80));
 REQUIRE(state()==0 && driver()->mount()==0);
 REQUIRE(runtime_diag_startup_mount_snapshot(after,80) && !memcmp(before,after,80));
 for(unsigned fault=1;fault<=2;fault++){
  drop();REQUIRE(configure()==0);alloc_calls=0;fail_at=fault;read_calls=0;nor_reset_observation(&media);
  REQUIRE(driver()->mount()==0);check_profile(fault!=1);fail_at=0;REQUIRE(state()==0);
 }
 drop();REQUIRE(configure()==0);read_calls=0;read_fail_at=1;nor_reset_observation(&media);
 REQUIRE(driver()->mount()<0 && !mount_pages);
 REQUIRE(runtime_diag_startup_mount_snapshot(after,80));
 REQUIRE(word(after+40)==21 && (int32_t)word(after+44)<0 && word(after+56)==1 && word(after+76)==1 && !word(after+60));
 read_calls=read_fail_at=0;nor_reset_observation(&media);REQUIRE(driver()->mount()==0);check_profile(true);
 drop();bad_geometry=true;read_calls=0;REQUIRE(driver()->mount()==VFS_ERR_NODEV);
 REQUIRE(runtime_diag_startup_mount_snapshot(after,80));
 REQUIRE(word(after+40)==17 && (int32_t)word(after+44)==VFS_ERR_NODEV);
 for(unsigned i=48;i<80;i++)REQUIRE(after[i]==0);
 REQUIRE(!live && !media.stats.programs && !media.stats.erases);
 puts("PASS mount profile: physical counts/bytes, OOM cache/index, I/O/configure failure, retry, warm/read stability and no leaks");
 return 0;
}
'''
            (folder / 'contract.c').write_text(source)
            command = ['gcc', '-std=c11', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                       '-Wno-unused-function', '-Wno-unused-variable', '-Wno-misleading-indentation', '-Wno-sign-compare',
                       '-DLFS_NO_MALLOC', '-DLFS_NO_DEBUG', '-DLFS_NO_WARN', '-DLFS_NO_ERROR',
                       '-DVFS_PACKED_LFS_ENABLE', '-DPIXL_RUNTIME_DIAGNOSTICS=1',
                       '-DSTORE_CORE="'+(core/'packed_fs.c').as_posix()+'"',
                       '-DSTORE_ADAPTER="'+(core/'vfs_driver_packed.c').as_posix()+'"']
            for include in (folder, core, lfs, HERE):
                command += ['-I', str(include)]
            exe = folder / 'contract.exe'
            command += [str(folder/'contract.c'), str(HERE/'packed_vfs_nor_de344.c'),
                        str(core/'vfs_persist.c'), str(core.parent/'runtime_diag.c'),
                        str(lfs/'lfs.c'), str(lfs/'lfs_util.c'), '-o', str(exe)]
            built = subprocess.run(command, capture_output=True, text=True, timeout=60)
            self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
            ran = subprocess.run([str(exe)], capture_output=True, text=True, timeout=60)
            self.assertEqual(ran.returncode, 0, ran.stdout + ran.stderr)
            self.assertIn('PASS mount profile:', ran.stdout)
            print(ran.stdout.strip())


if __name__ == '__main__':
    unittest.main()
