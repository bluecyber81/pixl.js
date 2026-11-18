"""Execute linked OLED diagnostic input/drawing/cleanup down to SPI DMA.

No OLED/radio is attached. Peripheral timing and settings persistence are not
tested. The actual app destructor runs with only settings_save replaced; the
sleep launcher uses this same destructor before display power-down.
"""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import struct
from check_oled_brightness_spi_elf import Model
from unicorn.arm_const import UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3


def verify(directory, frames=None):
    m = Model(directory/'pixljs.out', directory/'pixljs.bin')
    m.call('hal_spi_bus_init')
    scratch = m.symbols['__HeapBase']
    m.write32(scratch,18)
    m.call('hal_spi_bus_attach',scratch)
    settings = m.call('settings_get_data')
    m.cpu.mem_write(settings+11,b'\x41')  # saved 65%, never overwritten by test
    fb = m.call('mui')+4
    m.call('mui_u8g2_init',fb)
    m.call('mui_mem_init')
    canvas, event, instance = scratch+512, scratch+528, scratch+544
    m.cpu.mem_write(canvas,struct.pack('<IBBBB',fb,0,0,128,64))
    selected_view = 0
    def registered():
        nonlocal selected_view
        if m.cpu.reg_read(UC_ARM_REG_R1) == 4:
            selected_view = m.cpu.reg_read(UC_ARM_REG_R2)
    m.hook('mui_view_dispatcher_add_view',registered)
    font = 0
    text_rows = []
    def font_set():
        nonlocal font
        font = m.cpu.reg_read(UC_ARM_REG_R1)
    def text_draw():
        ptr = m.cpu.reg_read(UC_ARM_REG_R3)
        raw = bytearray()
        while m.cpu.mem_read(ptr+len(raw),1) != b'\0':
            raw += m.cpu.mem_read(ptr+len(raw),1)
            assert len(raw)<128
        text_rows.append((font, m.cpu.reg_read(UC_ARM_REG_R1),m.cpu.reg_read(UC_ARM_REG_R2),ptr,raw.decode()))
    m.hook('mui_canvas_set_font',font_set)
    m.hook('mui_canvas_draw_utf8',text_draw)
    m.hook('settings_save',lambda:m.respond(0))
    def input(key,kind):
        m.cpu.mem_write(event,bytes([key,kind]))
        m.call('device_test_input',selected_view,event)
    def click(key):
        for kind in (0,1,2): input(key,kind)
    def assert_saved():
        assert m.cpu.mem_read(settings+11,1)==b'\x41'
    def draw(name):
        m.call('mui_canvas_clear',canvas)
        text_rows.clear()
        m.call('device_test_draw',selected_view,canvas)
        labels = [row[-1] for row in text_rows]
        for face,x,y,ptr,text in text_rows:
            m.call('mui_canvas_set_font',canvas,face)
            width = m.call('mui_canvas_get_utf8_width',canvas,ptr)
            assert x>0 and x+width<127, (text,x,width)
            for letter in text:
                assert m.call('u8g2_font_get_glyph_data',fb,ord(letter)), ('missing glyph',text,letter)
        m.clear(); m.call('u8g2_SendBuffer',fb)
        data = b''.join(bytes.fromhex(x['hex']) for x in m.transfers if x['data'])
        assert len(data)==1024
        assert [x['hex'] for x in m.transfers if not x['data']] == [v for p in range(8) for v in ('40','10','02',f'{0xb0+p:02x}')]
        if frames:
            frames.mkdir(parents=True,exist_ok=True)
            (frames/(name+'.raw')).write_bytes(data)
        return data,labels
    output=[]
    for rotation in (0,1):
        m.call('mui_u8g2_set_flip_display',rotation)
        for language in (0,1):
            m.call('setLanguage',language)
            # Genuine constructors/allocator/dispatcher; only absent app fields
            # are NULL, as they are during an aborted constructor cleanup.
            app=m.call('mui_mem_malloc',256)
            assert app
            m.cpu.mem_write(app,bytes(256))
            dispatcher=m.call('mui_view_dispatcher_create')
            m.write32(app+12,dispatcher)
            main_view=m.call('mui_view_create')
            m.call('mui_view_dispatcher_add_view',dispatcher,0,main_view)
            m.call('settings_device_test_open',app)
            assert selected_view and m.u32(selected_view)==app
            prefix=f'lang{language}-r{rotation}'
            _,info=draw(prefix+'-info')
            m.clear(); input(1,2); assert not m.transfers, 'stale entry SHORT opened contrast'
            m.clear(); click(1); m.expect_contrast(5); assert_saved()
            dim,dim_labels=draw(prefix+'-dim')
            m.clear(); input(1,2); assert not m.transfers, 'duplicate SHORT changed page'
            m.clear(); click(2); m.expect_contrast(100); assert_saved()
            bright,bright_labels=draw(prefix+'-bright')
            def pixel(data,x,y):
                if rotation: x,y=127-x,63-y
                return (data[(y//8)*128+x]>>(y%8))&1
            assert all(pixel(dim,x,y)==pixel(bright,x,y) for y in range(28,42) for x in range(8,120)), 'comparison pattern changed'
            m.clear(); click(0); m.expect_contrast(5)
            m.clear(); click(1); m.expect_contrast(65); assert_saved()
            m.clear(); click(1); m.expect_contrast(5)
            m.clear(); input(1,0); input(1,3); m.expect_contrast(65)
            m.call('settings_device_test_open',app)
            m.clear(); click(1); m.expect_contrast(5)
            m.clear(); m.call('mui_view_dispatcher_switch_to_view',dispatcher,0); m.expect_contrast(65)
            m.call('settings_device_test_open',app)
            m.clear(); click(1); m.expect_contrast(5)
            m.write32(instance+8,app)
            m.clear(); m.call('app_settings_on_kill',instance); m.expect_contrast(65)
            assert m.u32(instance+8)==0; assert_saved()
            m.call('mui_view_free',main_view)
            output.append({'language':language,'rotation':rotation,'infoLabels':info,
                           'dimLabels':dim_labels,'brightLabels':bright_labels,
                           'dimFrameSha256':sha256(dim).hexdigest(),'brightFrameSha256':sha256(bright).hexdigest()})
    return {'passed':True,'binarySha256':sha256((directory/'pixljs.bin').read_bytes()).hexdigest(),
            'cases':output,'fixedPatternPixels':1568,'savedPercentUnchanged':65,
            'restoration':['short center','long center','forced view change','actual settings app destructor'],
            'boundary':'actual linked UI/SH1106/board SPI/HAL/Nordic SPIM DMA',
            'notTested':['physical OLED brightness','electrical timing','hardware sleep','settings filesystem writes']}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('directory',type=Path); p.add_argument('--out',type=Path); p.add_argument('--frames',type=Path)
    args=p.parse_args(); result=verify(args.directory,args.frames)
    if args.out: args.out.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
