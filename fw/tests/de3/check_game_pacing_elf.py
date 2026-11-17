"""Count actual Cortex-M page/HAL instructions and check Tris's linked RTC pacing.

The accepted transfer completes at the nrfx boundary immediately. No radio,
DMA wait, external LCD response, physical FPS, or software clock cycles inferred.
"""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import struct
from subprocess import check_output

from unicorn import Uc, UC_ARCH_ARM, UC_MODE_MCLASS, UC_MODE_THUMB, UC_HOOK_CODE
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_MSP, UC_ARM_REG_LR,
                               UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_PC)
from check_stack_watermark_elf import tool


def run(folder):
    image = (folder / "pixljs.bin").read_bytes()
    lines = check_output([tool("nm"), "-n", folder / "pixljs.out"],text=True).splitlines()
    symbols = {a[2]:int(a[0],16) for line in lines if len(a:=line.split())==3}
    cpu = Uc(UC_ARCH_ARM, UC_MODE_MCLASS | UC_MODE_THUMB)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    spim, rtc = 0x40003000, 0x40011000
    for base, size in ((0,0x80000),(0x20000000,0x10000),(spim,0x1000),(rtc,0x1000),(0x50000000,0x1000)):
        cpu.mem_map(base,size)
    cpu.mem_write(symbols["__isr_vector"],image)
    n = symbols["__data_end__"]-symbols["__data_start__"]
    cpu.mem_write(symbols["__data_start__"],bytes(cpu.mem_read(symbols["__etext"],n)))
    spi_mhz = 2 if "u8g2_Setup_sh1106_128x64_noname_f" in symbols else 8
    data_addr = symbols["__HeapBase"]
    top = symbols["__StackTop"]
    count = calls = wire = 0
    ticks = delay_ms = 0
    stalled = False
    def word(address,value):
        cpu.mem_write(address,struct.pack("<I",value))
    def ret(value=0):
        cpu.reg_write(UC_ARM_REG_R0,value)
        cpu.reg_write(UC_ARM_REG_PC,cpu.reg_read(UC_ARM_REG_LR))
    def hook(name,fn):
        addr=symbols[name]
        cpu.hook_add(UC_HOOK_CODE,fn,begin=addr,end=addr)
    def instruction(*_):
        nonlocal count
        count+=1
    def dma(*_):
        nonlocal calls,wire
        buf, ntx, rx, nrx=struct.unpack("<IIII",cpu.mem_read(cpu.reg_read(UC_ARM_REG_R1),16))
        assert buf and 0<ntx<=128 and nrx==0
        expected_clock = 0x20000000 if spi_mhz == 2 else 0x80000000
        if spi_mhz == 2:
            assert struct.unpack("<I", cpu.mem_read(spim+0x524, 4))[0] == expected_clock
        calls+=1
        wire+=ntx
        word(spim+0x54c,ntx); word(spim+0x53c,0); word(spim+0x118,1)
        ret()
    def call(name,*args):
        for r,arg in zip((UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2),args):
            cpu.reg_write(r,arg)
        cpu.reg_write(UC_ARM_REG_LR,0x101); cpu.reg_write(UC_ARM_REG_MSP,top)
        cpu.emu_start(symbols[name]|1,0x100,count=260000)
        assert cpu.reg_read(UC_ARM_REG_PC)==0x100 and cpu.reg_read(UC_ARM_REG_MSP)==top,name
        return cpu.reg_read(UC_ARM_REG_R0)
    cpu.hook_add(UC_HOOK_CODE,instruction)
    for name in ("app_util_critical_region_enter","app_util_critical_region_exit"):
        hook(name,lambda *_:ret())
    hook("nrfx_spim_xfer",dma)
    # Board setup assigns P0.27 before any game calls. Use the linked owning
    # object so real HAL clock switching observes the correct chip select.
    device = call("mui_u8g2_get_spi_device")
    word(device, 27)
    rows={}
    batched="JOY_OLED_write_page" in symbols
    for width in (128,82):
        calls=wire=count=0
        for page in range(8):
            values = bytes((page+x)%256 for x in range(width))
            if batched:
                cpu.mem_write(data_addr,values)
                call("JOY_OLED_write_page",page,data_addr,width)
            else:
                call("JOY_OLED_data_start",page)
                for value in values: call("JOY_OLED_send",value)
                call("JOY_OLED_end")
        assert calls==(16 if batched else 8*(width+3)) and wire==8*(width+3)
        rows[width]=dict(halTransfers=calls,wireBytes=wire,spiMHz=spi_mhz,idealWireMicroseconds=wire*8/spi_mhz,
                         modelInstructions=count)
    pacing=[]
    if "JOY_pace_tris_step" in symbols:
        def delay(*_):
            nonlocal delay_ms
            assert cpu.reg_read(UC_ARM_REG_R0)==64000
            delay_ms+=1
            if not stalled: word(rtc+0x504,(ticks+round(delay_ms*16384/1000)) & 0xffffff)
            ret()
        for line in lines:
            parts=line.split()
            if len(parts)==3 and parts[2].startswith("delay_machine_code."):
                addr=int(parts[0],16)
                cpu.hook_add(UC_HOOK_CODE,delay,begin=addr,end=addr)
        for start,elapsed,stalled,expected in ((0,0,False,8),(0,3,False,5),(0,8,False,0),
                                              (0,13,False,0),(0xfffff0,3,False,5),(0,0,True,8)):
            ticks=(start+round(elapsed*16384/1000)) & 0xffffff
            word(rtc+0x504,ticks)
            assert call("JOY_clock_ticks")==ticks
            delay_ms=0
            call("JOY_pace_tris_step",start)
            assert delay_ms==expected,(start,elapsed,delay_ms)
            pacing.append(dict(startTick=start,modeledWorkMs=elapsed,clockStalled=stalled,delaysOf1ms=delay_ms))
    return dict(binSha256=sha256(image).hexdigest(),rows=rows,rtcCases=pacing)


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("old",type=Path); p.add_argument("candidate",type=Path)
    p.add_argument("--output",type=Path,required=True)
    a=p.parse_args()
    earlier,later=run(a.old),run(a.candidate)
    assert not earlier["rtcCases"] and len(later["rtcCases"])==6
    for width in (128,82):
        assert later["rows"][width]["modelInstructions"] < earlier["rows"][width]["modelInstructions"]
    report={"hardware":False,"scope":"R0 linked page/byte primitives and actual SPI HAL. Mock immediate DMA success, critical-region entry/exit, no game pixel rendering or per-byte caller loop. Instruction counts are not cycles or FPS.",
            "older":earlier,"candidate":later}
    text=json.dumps(report,indent=2)+"\n"
    a.output.write_text(text)
    print(text)
