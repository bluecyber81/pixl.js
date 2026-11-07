#include "host_sdk.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <string.h>

#define main bl8_firmware_entry
#include BL8_MAIN_SOURCE
#undef main
#include BL8_LCD_DRV_SOURCE
#include BL8_LCD_COMM_SOURCE

static unsigned pins[64], pin_outputs[64], irq_depth;
static unsigned spi_frequency, spi_transfers, spi_bytes, command_bytes, data_bytes;
static unsigned spi_abort_count, spi_uninit_count, reset_count, delay_ms;
static unsigned injected_init_error, injected_transfer_error, suppress_completion;
static unsigned queued_fail, queue_puts;
static uint8_t wire_page, wire_column, wire_ram[8][132];
static host_spi_handler_t spi_handler;
static void (*queued_handler)(void *, uint16_t);
static unsigned tests_passed;

void host_log(const char *format, ...) { (void)format; }
void nrf_gpio_cfg_default(unsigned pin) { assert(pin<64);pin_outputs[pin]=0; }
void nrf_gpio_cfg_output(unsigned pin) { assert(pin<64);pin_outputs[pin]=1; }
void nrf_gpio_cfg_input(unsigned pin,unsigned pull) { assert(pin<64);(void)pull;pin_outputs[pin]=0; }
void nrf_gpio_pin_write(unsigned pin,unsigned value) { assert(pin<64);pins[pin]=!!value; }
void nrf_gpio_pin_set(unsigned pin) { nrf_gpio_pin_write(pin,1); }
void nrf_gpio_pin_clear(unsigned pin) { nrf_gpio_pin_write(pin,0); }
unsigned nrf_gpio_pin_read(unsigned pin) { assert(pin<64);return pins[pin]; }
void nrf_delay_ms(uint32_t value) { delay_ms+=value; }
void NVIC_SystemReset(void) { ++reset_count; }
void nrf_bootloader_mbr_addrs_populate(void) {}
uint32_t nrf_bootloader_flash_protect(uint32_t a,uint32_t b) { (void)a;(void)b;return 0; }
uint32_t nrf_bootloader_init(nrf_dfu_observer_t observer) { (void)observer;return 0; }
uint32_t nrf_bootloader_dfu_timer_counter_get(void) { return 0; }

uint32_t nrf_drv_spi_init(nrf_drv_spi_t const *instance,nrf_drv_spi_config_t const *config,host_spi_handler_t handler,void *context) {
    assert(instance->instance==0);assert(context==NULL);spi_handler=handler;
    spi_frequency=config->frequency;
    assert(config->mode==0&&config->sck_pin==26&&config->mosi_pin==25);
    return injected_init_error;
}
void nrf_drv_spi_uninit(nrf_drv_spi_t const *instance) { (void)instance;assert(!irq_depth && !host_critical_depth);++spi_uninit_count; }
void nrf_drv_spi_abort(nrf_drv_spi_t const *instance) { (void)instance;++spi_abort_count; }
uint32_t nrf_drv_spi_transfer(nrf_drv_spi_t const *instance,const uint8_t *tx,uint8_t len,uint8_t *rx,uint8_t rxlen) {
    (void)instance;assert(!irq_depth && !host_critical_depth);assert(rx==NULL&&rxlen==0);assert(pins[LCD_SPI_CS_PIN]==0);
    ++spi_transfers;spi_bytes+=len;
    if(injected_transfer_error)return injected_transfer_error;
    if(pins[LCD_DC_RS_PIN]==LCD_RS) {
        command_bytes+=len;
        for(unsigned i=0;i<len;++i) {
            uint8_t c=tx[i];
            if((c&0xf8)==0xb0)wire_page=c&7;
            else if((c&0xf0)==0x10)wire_column=(wire_column&15)|((c&15)<<4);
            else if((c&0xf0)==0x00)wire_column=(wire_column&0xf0)|(c&15);
        }
    } else {
        data_bytes+=len;
        assert(wire_page<8&&wire_column+len<=LCD_X_SIZE);
        memcpy(&wire_ram[wire_page][wire_column],tx,len);wire_column+=len;
    }
    if(!suppress_completion) { nrf_drv_spi_evt_t event={0};spi_handler(&event,NULL); }
    return NRF_SUCCESS;
}
uint32_t app_sched_event_put(void *data,uint16_t length,void (*handler)(void *,uint16_t)) {
    assert(data==NULL&&length==0);++queue_puts;
    if(queued_fail)return NRF_ERROR_NO_MEM;
    assert(queued_handler==NULL);queued_handler=handler;return NRF_SUCCESS;
}
static void drain_queue(void) { if(queued_handler){void(*handler)(void*,uint16_t)=queued_handler;queued_handler=NULL;handler(NULL,0);} }
static void event_irq(nrf_dfu_evt_type_t event) { ++irq_depth;dfu_observer(event);--irq_depth; }
static void zero_counts(void) { spi_transfers=spi_bytes=command_bytes=data_bytes=delay_ms=0; }
static void initialize(void) {
    injected_init_error=injected_transfer_error=suppress_completion=0;
    queued_fail=0;queued_handler=NULL;m_display_queued=false;
    if(m_lcd_spi.enable)lcd_uninit();
    memset(wire_ram,0,sizeof(wire_ram));zero_counts();dfu_observer(NRF_DFU_EVT_DFU_INITIALIZED);
    assert(m_lcd_spi.enable&&spi_frequency==8000000u);
}
static void assert_wire_matches(void) {
    for(unsigned p=0;p<8;++p)assert(memcmp(m_display_content[p],wire_ram[p],LCD_X_SIZE)==0);
}
static void snapshot(const char *out,const char *name) {
    assert_wire_matches();char file[1024];snprintf(file,sizeof(file),"%s/%s.pbm",out,name);
    FILE *f=fopen(file,"wb");assert(f);fprintf(f,"P4\n128 64\n");
    unsigned pixels=0,xmin=128,xmax=0,ymin=64,ymax=0;
    for(unsigned y=0;y<64;++y)for(unsigned x=0;x<128;x+=8) {
        uint8_t byte=0;
        for(unsigned bit=0;bit<8;++bit)if(m_display_content[y/8][x+bit]&(1u<<(y%8))){
            byte|=0x80u>>bit;++pixels;if(x+bit<xmin)xmin=x+bit;if(x+bit>xmax)xmax=x+bit;if(y<ymin)ymin=y;if(y>ymax)ymax=y;
        }
        fputc(byte,f);
    }
    assert(fclose(f)==0);
    printf("{\"frame\":\"%s\",\"spiTransfers\":%u,\"wireBytes\":%u,\"commandBytes\":%u,\"dataBytes\":%u,\"delayMs\":%u,\"setPixels\":%u,\"bbox\":[%u,%u,%u,%u]}\n",name,spi_transfers,spi_bytes,command_bytes,data_bytes,delay_ms,pixels,xmin,ymin,xmax,ymax);
}

static void test_bitmap_clipping(void) {
    uint32_t random=0x35315926u;
    for(unsigned sample=0;sample<2048;++sample) {
        random=random*1664525u+1013904223u;uint8_t x=random>>24;
        random=random*1664525u+1013904223u;uint8_t y=(random>>24)%80;
        random=random*1664525u+1013904223u;uint8_t w=random>>24;
        random=random*1664525u+1013904223u;uint8_t h=(random>>24)%80;
        size_t length=(size_t)w*((h+7)/8);uint8_t *source=malloc(length?length:1);assert(source);
        for(size_t i=0;i<length;++i){random=random*1664525u+1013904223u;source[i]=random>>24;}
        memset(m_display_content,0x5a,sizeof(m_display_content));
        uint8_t expected[8][LCD_X_SIZE];memcpy(expected,m_display_content,sizeof(expected));
        bool clear=(sample%7)==0;
        for(unsigned dy=0;dy<h&&y+dy<64;++dy)for(unsigned dx=0;dx<w&&x+dx<LCD_X_SIZE;++dx){
            bool on=!clear&&(source[(dy/8)*w+dx]&(1u<<(dy%8)));
            uint8_t mask=1u<<((y+dy)%8),*p=&expected[(y+dy)/8][x+dx];*p=(*p&~mask)|(on?mask:0);
        }
        lcd_show_pic(x,y,w,h,clear?NULL:source);assert(memcmp(expected,m_display_content,sizeof(expected))==0);free(source);
    }
    ++tests_passed;
}
static void test_font_and_string_bounds(void) {
    for(unsigned c=0;c<256;++c){unsigned index=font_index((uint8_t)c);assert(index<BOOT_FONT_GLYPH_COUNT);
        bool present=false;for(unsigned i=0;i<BOOT_FONT_GLYPH_COUNT;++i)if(boot_font_chars[i]==c)present=true;
        if(!present)assert(index==0);
    }
    for(unsigned x=0;x<128;++x)for(unsigned width=6;width<=8;width+=2){
        unsigned length=(128-x+width-1)/width;char *str=malloc(length);assert(str);memset(str,'W',length);
        if(width==6)lcd_draw_str_0608(x,63,str);else lcd_draw_str_1608(x,63,str);free(str);
    }
    const char *messages[]={"DFU Update","Waiting...","Receiving...","DFU Error","Retry...","Ready"};
    for(unsigned s=0;s<sizeof(messages)/sizeof(messages[0]);++s)for(const char*p=messages[s];*p;++p)assert(font_index(*p)!=0);
    zero_counts();lcd_draw_str_1608(0,0,NULL);lcd_draw_str_0608(0,64,"W");assert(spi_transfers==0);++tests_passed;
}
static void text_metrics(void) {
    char *messages[]={"DFU Update","Waiting...","Receiving...","DFU Error","Retry...","Ready"};
    initialize();
    for(unsigned i=0;i<sizeof(messages)/sizeof(messages[0]);++i) {
        lcd_clear();lcd_draw_str_1608(0,0,messages[i]);
        unsigned xmin=128,xmax=0,ymin=64,ymax=0;
        for(unsigned y=0;y<64;++y)for(unsigned x=0;x<128;++x)if(m_display_content[y/8][x]&(1u<<(y%8))){
            if(x<xmin)xmin=x;
            if(x>xmax)xmax=x;
            if(y<ymin)ymin=y;
            if(y>ymax)ymax=y;
        }
        printf("{\"textMetric\":\"%s\",\"cellsWidth\":%zu,\"inkBounds\":[%u,%u,%u,%u]}\n",messages[i],strlen(messages[i])*8,xmin,ymin,xmax,ymax);
    }
}
static void test_deferred_and_failure_states(void) {
    initialize();zero_counts();event_irq(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);assert(spi_transfers==0&&queued_handler);
    unsigned puts=queue_puts;event_irq(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);assert(queue_puts==puts);
    drain_queue();assert(m_display_state==DISPLAY_WAITING);
    zero_counts();dfu_observer(NRF_DFU_EVT_DFU_STARTED);dfu_observer(NRF_DFU_EVT_DFU_FAILED);assert(spi_transfers==0);++tests_passed;

    initialize();event_irq(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);event_irq(NRF_DFU_EVT_TRANSPORT_ACTIVATED);
    dfu_observer(NRF_DFU_EVT_DFU_STARTED);uint8_t receiving[8][LCD_X_SIZE];memcpy(receiving,m_display_content,sizeof(receiving));
    drain_queue();assert(memcmp(receiving,m_display_content,sizeof(receiving))==0);++tests_passed;

    initialize();event_irq(NRF_DFU_EVT_TRANSPORT_ACTIVATED);dfu_observer(NRF_DFU_EVT_DFU_FAILED);
    uint8_t error[8][LCD_X_SIZE];memcpy(error,m_display_content,sizeof(error));drain_queue();assert(memcmp(error,m_display_content,sizeof(error))==0);++tests_passed;

    initialize();event_irq(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);zero_counts();unsigned uninit=spi_uninit_count;
    event_irq(NRF_DFU_EVT_DFU_COMPLETED);assert(spi_transfers==0&&spi_uninit_count==uninit);drain_queue();
    assert(m_display_state==DISPLAY_INACTIVE&&spi_uninit_count==uninit+1);++tests_passed;

    initialize();queued_fail=1;zero_counts();event_irq(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);
    assert(!m_display_queued&&!queued_handler&&spi_transfers==0);queued_fail=0;event_irq(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);drain_queue();++tests_passed;

    initialize();unsigned aborted=spi_abort_count;suppress_completion=1;lcd_draw_str_1608(0,0,"W");
    assert(m_lcd_spi.faulted&&spi_abort_count==aborted+1);unsigned calls=spi_transfers;lcd_clear();assert(spi_transfers==calls);
    nrf_drv_spi_evt_t late_completion={0};spi_handler(&late_completion,NULL);lcd_clear();
    assert(m_lcd_spi.faulted&&spi_transfers==calls);++tests_passed;

    initialize();aborted=spi_abort_count;injected_transfer_error=NRF_ERROR_BUSY;lcd_clear();
    assert(m_lcd_spi.faulted&&spi_abort_count==aborted+1);calls=spi_transfers;lcd_clear();assert(spi_transfers==calls);++tests_passed;

    initialize();zero_counts();uninit=spi_uninit_count;
    event_irq(NRF_DFU_EVT_TRANSPORT_ACTIVATED);event_irq(NRF_DFU_EVT_DFU_ABORTED);
    event_irq(NRF_DFU_EVT_TRANSPORT_ACTIVATED);
    assert(spi_transfers==0&&spi_uninit_count==uninit);drain_queue();
    assert(m_display_state==DISPLAY_INACTIVE&&spi_uninit_count==uninit+1&&spi_transfers==0);++tests_passed;

    initialize();event_irq(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);event_irq(NRF_DFU_EVT_TRANSPORT_ACTIVATED);
    dfu_observer(NRF_DFU_EVT_DFU_FAILED);memcpy(error,m_display_content,sizeof(error));zero_counts();drain_queue();
    assert(memcmp(error,m_display_content,sizeof(error))==0&&spi_transfers==0);++tests_passed;

    initialize();lcd_uninit();injected_init_error=NRF_ERROR_INVALID_STATE;zero_counts();
    dfu_observer(NRF_DFU_EVT_DFU_INITIALIZED);dfu_observer(NRF_DFU_EVT_DFU_STARTED);
    assert(!m_lcd_spi.enable&&spi_transfers==0);++tests_passed;
    assert(reset_count==0);
}

/* These requirements intentionally fail against the unmodified original:
 * they describe the requested visible connection feedback, optical layout,
 * and avoidance of duplicate full refreshes, not a claimed DFU core failure. */
static bool centered_ink(unsigned top,unsigned bottom) {
    unsigned xmin=128,xmax=0;
    for(unsigned y=top;y<bottom;++y)for(unsigned x=0;x<128;++x)
        if(m_display_content[y/8][x]&(1u<<(y%8))) {
            if(x<xmin)xmin=x;
            if(x>xmax)xmax=x;
        }
    if(xmin==128)return false;
    int imbalance=(int)xmin-(int)(127-xmax);
    return imbalance>=-1&&imbalance<=1;
}
static bool improvement_requirement(const char *name) {
    initialize();
    if(strcmp(name,"connected_ready")==0) {
        zero_counts();event_irq(NRF_DFU_EVT_TRANSPORT_ACTIVATED);assert(spi_transfers==0);drain_queue();
        uint8_t expected[4][LCD_X_SIZE]={0};
        const char *ready="Ready";
        for(unsigned i=0;ready[i];++i) {
            unsigned index=font_index((uint8_t)ready[i]);assert(index!=0);
            memcpy(&expected[0][45+8*i],ascii_1608[index],8);
            memcpy(&expected[1][45+8*i],ascii_1608[index]+8,8);
        }
        return memcmp(expected,&m_display_content[4],sizeof(expected))==0;
    }
    if(strcmp(name,"receiving_centered")==0) {
        dfu_observer(NRF_DFU_EVT_DFU_STARTED);
        return centered_ink(0,32)&&centered_ink(32,64);
    }
    if(strcmp(name,"error_centered")==0) {
        dfu_observer(NRF_DFU_EVT_DFU_FAILED);
        return centered_ink(0,32)&&centered_ink(32,64);
    }
    if(strcmp(name,"duplicate_receiving_no_spi")==0) {
        dfu_observer(NRF_DFU_EVT_DFU_STARTED);uint8_t before[8][LCD_X_SIZE];memcpy(before,m_display_content,sizeof(before));
        zero_counts();dfu_observer(NRF_DFU_EVT_DFU_STARTED);
        return spi_transfers==0&&memcmp(before,m_display_content,sizeof(before))==0;
    }
    assert(!"unknown improvement requirement");return false;
}

int main(int argc,char **argv) {
    assert(argc==2||argc==3);
    if(argc==3) {
        bool passed=improvement_requirement(argv[2]);
        printf("{\"improvementRequirement\":\"%s\",\"passed\":%s,\"resetCalls\":%u}\n",argv[2],passed?"true":"false",reset_count);
        return passed?0:3;
    }
    text_metrics();
    initialize();snapshot(argv[1],"waiting");
    zero_counts();event_irq(NRF_DFU_EVT_TRANSPORT_ACTIVATED);assert(spi_transfers==0);drain_queue();snapshot(argv[1],"connected");
    zero_counts();dfu_observer(NRF_DFU_EVT_DFU_STARTED);snapshot(argv[1],"receiving");
    zero_counts();dfu_observer(NRF_DFU_EVT_OBJECT_RECEIVED);snapshot(argv[1],"object_received");
    zero_counts();dfu_observer(NRF_DFU_EVT_DFU_FAILED);snapshot(argv[1],"error");
    zero_counts();dfu_observer(NRF_DFU_EVT_DFU_STARTED);snapshot(argv[1],"retry_started");
    zero_counts();event_irq(NRF_DFU_EVT_TRANSPORT_DEACTIVATED);assert(spi_transfers==0);drain_queue();snapshot(argv[1],"disconnected");
    zero_counts();event_irq(NRF_DFU_EVT_DFU_COMPLETED);assert(spi_transfers==0);drain_queue();snapshot(argv[1],"completed_last_frame");
    test_deferred_and_failure_states();initialize();test_bitmap_clipping();test_font_and_string_bounds();
    printf("{\"testGroupsPassed\":%u,\"bitmapCases\":2048,\"byteGlyphLookups\":256,\"guardedStringCases\":256,\"physicalDevice\":false,\"resetCalls\":%u}\n",tests_passed,reset_count);
    return 0;
}
