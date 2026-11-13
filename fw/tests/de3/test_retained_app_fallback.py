"""Defensive launch behavior for a stale retained app ID, using actual init C.

The fixture deliberately enters after cache CRC validation. It proves the
defensive boundary, not that corrupt cache naturally reaches it on hardware.
"""
from root_host import SRC, HostTests, function
import unittest


class RetainedAppFallbackTests(HostTests):
    def test_actual_init_checks_registry_before_using_retained_app(self):
        body = function((SRC / 'core/mini_app_launcher.c').read_text(), 'mini_app_launcher_init')
        self.compile_run(r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
typedef struct {unsigned placeholder;} mini_app_launcher_t;
typedef struct {bool deamon, hibernate_enabled;} mini_app_t;
typedef struct {uint32_t id;bool enabled;uint8_t retain_data[312];} cache_data_t;
typedef struct {bool hibernate_enabled;} settings_data_t;
enum {MINI_APP_ID_DESKTOP=1,MINI_APP_ID_STATUS_BAR=9,MINI_APP_ID_CHAMELEON=8};
#define NRF_POWER_RESETREAS_NFC_MASK 4
#define NRF_LOG_INFO(...)
static cache_data_t cache;
static settings_data_t settings;
static bool default_slot;
static unsigned first,last,calls;
static uint8_t *retained;
static const mini_app_t normal={false,true},daemon={true,true},unsupported={false,false};
static cache_data_t *cache_get_data(void){return &cache;}
static settings_data_t *settings_get_data(void){return &settings;}
static bool tag_helper_valid_default_slot(void){return default_slot;}
static const mini_app_t *mini_app_registry_find_by_id(uint32_t id){
    return id==2 || id==3 ? &normal : id==9 ? &daemon : id==7 ? &unsupported : NULL;
}
static void mini_app_launcher_run(mini_app_launcher_t*l,uint32_t id){assert(!calls);first=id;++calls;}
static void mini_app_launcher_run_with_retain_data(mini_app_launcher_t*l,uint32_t id,uint8_t*r){last=id;retained=r;++calls;}
''' + body + r'''
int main(void){
    mini_app_launcher_t launcher;
    const uint32_t ids[]={2,3,0,0xffffffff,42,9,7};
    unsigned scenarios=0;
    for(unsigned i=0;i<sizeof(ids)/sizeof(ids[0]);i++)for(unsigned enabled=0;enabled<2;enabled++)
    for(unsigned resume=0;resume<2;resume++){
        memset(&cache,0xa5,sizeof(cache));cache.id=ids[i];cache.enabled=enabled;
        settings.hibernate_enabled=resume;default_slot=false;calls=0;retained=(void*)1;
        mini_app_launcher_init(&launcher,0);
        bool valid=ids[i]==2 || ids[i]==3;
        assert(first==MINI_APP_ID_STATUS_BAR && calls==2);
        assert(last==(enabled && resume && valid ? ids[i] : MINI_APP_ID_DESKTOP));
        assert(retained==(enabled && resume && valid ? cache.retain_data : NULL));
        if(enabled && resume && !valid){assert(!cache.enabled);for(unsigned n=0;n<312;n++)assert(cache.retain_data[n]==0);}
        if(enabled && resume && valid){assert(cache.enabled);for(unsigned n=0;n<312;n++)assert(cache.retain_data[n]==0xa5);}
        ++scenarios;
    }
    cache.id=42;cache.enabled=settings.hibernate_enabled=true;default_slot=true;calls=0;
    mini_app_launcher_init(&launcher,NRF_POWER_RESETREAS_NFC_MASK);
    assert(last==MINI_APP_ID_CHAMELEON && !retained && calls==2);++scenarios;
    printf("PASS %u retained-app init cases; registry fallback and NFC precedence\n",scenarios);
}
''')


if __name__ == '__main__':
    unittest.main()
