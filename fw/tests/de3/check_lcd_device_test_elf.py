"""Run actual linked LCD diagnostic UI, cleanup, ST7567 SPI and PWM SDK.

Hardware registers/completion are modeled; no physical display, light, radio
or settings persistence is tested. Actual settings destructor is executed.
"""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import struct
from subprocess import run
from tempfile import TemporaryDirectory
import unicorn
import lcd_device_model
from check_stack_watermark_elf import tool
from lcd_device_model import Model
from unicorn.arm_const import UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3


def verify(directory, frames=None):
    elf,binary=directory/'pixljs.out',directory/'pixljs.bin'
    with TemporaryDirectory(prefix='lcd-device-elf-') as tmp:
        extracted=Path(tmp)/'from-elf.bin'
        run([tool('objcopy'),'-O','binary',elf,extracted],check=True)
        assert extracted.read_bytes()==binary.read_bytes()
    m=Model(elf,binary)
    assert 'u8g2_Setup_st7567_enh_dg128064_f' in m.symbols
    assert 'u8g2_Setup_sh1106_128x64_noname_f' not in m.symbols
    m.call('hal_spi_bus_init')
    scratch=m.symbols['__HeapBase'];m.write32(scratch,18);m.call('hal_spi_bus_attach',scratch)
    settings=m.call('settings_get_data')
    m.cpu.mem_write(settings+10,b'\x41');m.cpu.mem_write(settings+11,b'\x50')
    fb=m.call('mui')+4;m.call('mui_u8g2_init',fb);m.call('mui_mem_init')
    assert m.u32(0x40009548)==3200  # actual SDK: 16MHz, 200us period
    canvas,event,instance=scratch+512,scratch+528,scratch+544
    m.cpu.mem_write(canvas,struct.pack('<IBBBB',fb,0,0,128,64))
    selected_view=0
    def registered():
        nonlocal selected_view
        if m.cpu.reg_read(UC_ARM_REG_R1)==4:selected_view=m.cpu.reg_read(UC_ARM_REG_R2)
    m.hook('mui_view_dispatcher_add_view',registered)
    font=0;text_rows=[]
    def font_set():
        nonlocal font
        font=m.cpu.reg_read(UC_ARM_REG_R1)
    def text_draw():
        ptr=m.cpu.reg_read(UC_ARM_REG_R3);raw=bytearray()
        while m.cpu.mem_read(ptr+len(raw),1)!=b'\0':
            raw+=m.cpu.mem_read(ptr+len(raw),1);assert len(raw)<128
        text_rows.append((font,m.cpu.reg_read(UC_ARM_REG_R1),m.cpu.reg_read(UC_ARM_REG_R2),ptr,raw.decode()))
    m.hook('mui_canvas_set_font',font_set);m.hook('mui_canvas_draw_utf8',text_draw)
    m.hook('settings_save',lambda:m.respond(0))
    def input(key,kind):
        m.cpu.mem_write(event,bytes([key,kind]));m.call('device_test_input',selected_view,event)
    def click(key):
        for kind in (0,1,2):input(key,kind)
    def pwm(value):
        assert m.call('mui_u8g2_get_backlight_level')==value
        assert m.cpu.mem_read(settings+10,2)==b'\x41\x50','preview changed settings'
        assert not m.transfers,'PWM change must not issue LCD contrast commands'
        if 0<value<100:assert m.u32(0x40009540)==value*32
    def draw(name):
        m.call('mui_canvas_clear',canvas);text_rows.clear()
        m.call('device_test_draw',selected_view,canvas)
        labels=[row[-1] for row in text_rows]
        for face,x,y,ptr,text in text_rows:
            m.call('mui_canvas_set_font',canvas,face)
            assert 0<x and x+m.call('mui_canvas_get_utf8_width',canvas,ptr)<127,(text,x)
            for letter in text:assert m.call('u8g2_font_get_glyph_data',fb,ord(letter)),text
        m.clear();m.call('u8g2_SendBuffer',fb)
        pixels=b''.join(bytes.fromhex(t['hex']) for t in m.transfers if t['data'])
        assert len(pixels)==1024
        if frames:
            frames.mkdir(parents=True,exist_ok=True);(frames/(name+'.raw')).write_bytes(pixels)
        return pixels,labels
    results=[]
    for rotation in (0,1):
        m.call('mui_u8g2_set_flip_display',rotation)
        for language in (0,1):
            m.call('setLanguage',language)
            app=m.call('mui_mem_malloc',256);assert app;m.cpu.mem_write(app,bytes(256))
            dispatcher=m.call('mui_view_dispatcher_create');m.write32(app+12,dispatcher)
            main_view=m.call('mui_view_create');m.call('mui_view_dispatcher_add_view',dispatcher,0,main_view)
            m.call('settings_device_test_open',app);assert m.u32(selected_view)==app
            prefix=f'lang{language}-r{rotation}'
            _,info=draw(prefix+'-info')
            assert any(s.startswith('VFS:') for s in info)
            m.clear();input(1,2);pwm(65)  # stale entry event ignored
            click(1);_,remote=draw(prefix+'-remote')
            assert ('Remote: aus' if language==0 else 'Remote: off') in remote
            m.clear();click(1);pwm(5)
            dim,dim_labels=draw(prefix+'-dim')
            m.clear();input(1,2);input(2,2);pwm(5)
            # Auto-dim must not overwrite the diagnostic preview.
            m.cpu.mem_write(settings,b'\xd4');m.call('mui_u8g2_poll_dim',1);pwm(5)
            click(2);pwm(100);assert m.pwm_events,'actual PWM peripheral path bypassed'
            bright,bright_labels=draw(prefix+'-bright')
            def pixel(data,x,y):
                if rotation:x,y=127-x,63-y
                return(data[(y//8)*128+x]>>(y%8))&1
            assert all(pixel(dim,x,y)==pixel(bright,x,y) for y in range(28,42) for x in range(8,120))
            m.clear();click(0);pwm(5);click(1);pwm(65)
            click(1);click(1);pwm(5);input(1,0);input(1,3);pwm(65)
            m.call('settings_device_test_open',app);click(1);click(1);pwm(5)
            m.call('mui_view_dispatcher_switch_to_view',dispatcher,0);pwm(65)
            m.call('settings_device_test_open',app);click(1);click(1);pwm(5)
            m.write32(instance+8,app);m.call('app_settings_on_kill',instance);pwm(65)
            assert m.u32(instance+8)==0;m.call('mui_view_free',main_view)
            results.append({'language':language,'rotation':rotation,'info':info,'remote':remote,
                            'dim':dim_labels,'bright':bright_labels,'dimFrameSha256':sha256(dim).hexdigest(),
                            'brightFrameSha256':sha256(bright).hexdigest()})
    # A direct display shutdown also drops preview/retry, then wake uses saved PWM.
    m.call('mui_u8g2_backlight_preview',100);m.call('mui_u8g2_deinit',fb)
    assert m.call('mui_u8g2_get_backlight_level')==0
    m.call('mui_u8g2_init',fb);m.clear();pwm(65)
    assert m.call('mui_u8g2_backlight_restore')==0;pwm(65)
    # The real public setter must supersede a pending failed preview restore.
    # Only the failed SDK calls are injected; success uses the actual PWM SDK.
    for chosen in (0,80):
        assert m.call('mui_u8g2_set_backlight_level',30)==0;pwm(30)
        assert m.call('mui_u8g2_backlight_preview',5)==0;pwm(5)
        fail=m.hook('app_pwm_channel_duty_set',lambda:m.respond(8))
        assert m.call('mui_u8g2_backlight_restore')==8
        assert m.call('mui_u8g2_set_backlight_level',80)==8;pwm(5)
        m.cpu.hook_del(fail)
        assert m.call('mui_u8g2_set_backlight_level',chosen)==0;pwm(chosen)
        m.rtc+=32768;m.call('mui_u8g2_poll_dim',0);pwm(chosen)
        assert m.call('mui_u8g2_backlight_restore')==0;pwm(chosen)
    assert m.call('mui_u8g2_set_backlight_level',30)==0
    assert m.call('mui_u8g2_backlight_preview',5)==0
    fail=m.hook('app_pwm_channel_duty_set',lambda:m.respond(8))
    assert m.call('mui_u8g2_backlight_restore')==8
    assert m.call('mui_u8g2_set_backlight_level',80)==8
    m.cpu.hook_del(fail);m.rtc+=32768
    m.call('mui_u8g2_poll_dim',0);pwm(30)
    assert m.call('mui_u8g2_set_backlight_level',65)==0;pwm(65)
    # Negative control must catch a silently successful but inert PWM SDK call.
    hook=m.hook('app_pwm_channel_duty_set',lambda:m.respond(0))
    m.call('mui_u8g2_backlight_preview',5)
    rejected=False
    try:pwm(5)
    except AssertionError:rejected=True
    m.cpu.hook_del(hook);assert rejected
    m.call('mui_u8g2_backlight_restore');pwm(65)
    # Changing only the modeled register must still be caught at the actual
    # SPIM TASKS_START boundary. This guards the native-MMIO model against
    # accidentally treating a normal store as an accepted display transfer.
    m.write32(0x4000350c,24)
    rejected=False
    try:m.call('u8g2_SendBuffer',fb)
    except AssertionError as error:rejected='LCD SPI pins' in str(error)
    assert rejected,'incorrect MOSI register was not rejected'
    return {'passed':True,'binarySha256':sha256(binary.read_bytes()).hexdigest(),
            'elfSha256':sha256(elf.read_bytes()).hexdigest(),
            'unicornVersion':unicorn.__version__,
            'modelSha256':sha256(Path(lcd_device_model.__file__).read_bytes()).hexdigest(),
            'validationScriptSha256':sha256(Path(__file__).read_bytes()).hexdigest(),
            'peripheralModel':{'interface':'native Unicorn mmio_map with shadow register banks',
                               'ranges':['0x40000000..0x400fffff','0x50000000..0x50000fff'],
                               'memoryAccessHooks':False,'instructionLimitPerCall':m.instruction_limit},
            'elfMatchesBin':True,'cases':results,'fixedPatternPixels':1568,
            'savedPwmUnchanged':65,'savedContrastUnchanged':80,'pwmPeriodTicks':3200,
            'newerPwmWinsOverFailedRestore':[0,80],
            'failedNewPwmKeepsRestoreTarget':30,
            'restoration':['short center','long center','forced view change','actual settings destructor','display shutdown/wake'],
            'negativeControlRejected':'no-op app_pwm_channel_duty_set',
            'negativeControlsRejected':['no-op app_pwm_channel_duty_set','incorrect SPIM MOSI register'],
            'boundary':'linked UI, ST7567/HAL/Nordic SPIM DMA and actual PWM SDK/TIMER1/PPI/GPIOTE registers',
            'notTested':['physical LCD brightness','electrical timing','real hardware sleep','settings filesystem writes']}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory',type=Path)
    p.add_argument('--out',type=Path);p.add_argument('--frames',type=Path)
    args=p.parse_args();result=verify(args.directory,args.frames)
    if args.out:args.out.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
