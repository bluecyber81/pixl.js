"""Run the supplied ARM BL8 observer machine code; the IRQ activation and return are explicitly injected.
LCD communication, hardware startup and the scheduler are stubbed at their public entry points.
Machine code for state transitions, drawing, glyphs and the framebuffer executes unmodified.
"""
from hashlib import sha256
from pathlib import Path
import json, struct, subprocess
from unicorn import Uc, UC_ARCH_ARM, UC_MODE_THUMB, UC_MODE_MCLASS, UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_R0, UC_ARM_REG_R2, UC_ARM_REG_LR, UC_ARM_REG_SP, UC_ARM_REG_PC

STOP = 0x6ff00
EVENT = {"initialize": 0, "connect": 1, "disconnect": 2, "receiving": 3, "error": 5}

class Probe:
    def __init__(self, fname):
        data = fname.read_bytes()
        self.uc = Uc(UC_ARCH_ARM, UC_MODE_THUMB | UC_MODE_MCLASS)
        self.sym = {}
        for line in subprocess.check_output(["nm","-an",str(fname)],text=True).splitlines():
            fields = line.split()
            if len(fields) == 3 and len(fields[0]) == 8:
                val = int(fields[0],16)
                self.sym.setdefault(fields[-1], val & ~1 if fields[1] in "tT" else val)
        for start, size in [(0,0x80000),(0x20000000,0x10000),(0x10001000,0x1000),(0x40000000,0x1000),(0x50000000,0x1000)]:
            self.uc.mem_map(start, size)
        phoff = struct.unpack_from("<I",data,28)[0]
        size, count = struct.unpack_from("<HH",data,42)
        boot_region = bytearray(b'\xff' * 28672)
        for i in range(count):
            typ, off, addr, phys, nbytes, *_ = struct.unpack_from("<IIIIIIII",data,phoff+i*size)
            if typ == 1 and nbytes:
                self.uc.mem_write(addr, data[off:off+nbytes])
                start, end = max(0x77000, phys), min(0x7e000, phys+nbytes)
                if start < end:
                    boot_region[start-0x77000:end-0x77000] = data[off+start-phys:off+end-phys]
        self.uc.reg_write(UC_ARM_REG_SP,0x2000ef00)
        self.queue = []
        self.reject_queue = False
        self.lto = "dfu_observer" not in self.sym
        if self.lto:
            # Bind instruction offsets to the exact loaded production image.
            # Native and Docker debug paths differ, but loaded bytes must match.
            assert sha256(boot_region).hexdigest() == "5fec8c8495978afcd340e6b42db7fc9ba4fa9f216aad2b2a597cc7282877d584"
            self.sym["dfu_observer"] = self.sym["dfu_observer.lto_priv.0"]
            self.sym["delay_machine_code.0"] = self.sym["delay_machine_code.0.lto_priv.0"]
            self.sym["nrf_bootloader_init"] = 0x7b946
            self.skips = {self.sym[k] for k in ("lcd_write_command","lcd_spi_write.isra.0")}
        else:
            self.skips = {self.sym[k] for k in ("lcd_init","lcd_uninit","lcd_write_command","lcd_write_data","nrf_bootloader_flash_protect","nrf_bootloader_mbr_addrs_populate")}
        self.uc.hook_add(UC_HOOK_CODE,self.hook)
        self.stop_at = None
        self.cut = None
        self.button = None

    def hook(self, uc, pc, size, unused):
        if pc == self.stop_at:
            self.cut = pc
            uc.emu_stop()
        elif self.lto and pc == 0x79db4:
            # Model successful inlined LCD peripheral setup after DFU state init.
            uc.mem_write(self.sym["m_lcd_spi"], b"\x01")
            uc.reg_write(UC_ARM_REG_PC, 0x79d78 | 1)
        elif pc in self.skips or pc == self.sym["app_sched_event_put"]:
            if pc == self.sym["app_sched_event_put"]:
                if not self.reject_queue:
                    self.queue.append(uc.reg_read(UC_ARM_REG_R2)&~1)
            uc.reg_write(UC_ARM_REG_R0,4 if pc == self.sym["app_sched_event_put"] and self.reject_queue else 0)
            uc.reg_write(UC_ARM_REG_PC,uc.reg_read(UC_ARM_REG_LR))
        elif self.button:
            self.button(pc)

    def execute(self, addr, r0=0, cut=None):
        self.stop_at = cut
        self.cut = None
        self.uc.reg_write(UC_ARM_REG_R0, r0)
        self.uc.reg_write(UC_ARM_REG_LR, STOP | 1)
        self.uc.emu_start(addr | 1, STOP, count=400000)
        assert self.uc.reg_read(UC_ARM_REG_PC) == (cut or STOP),hex(self.uc.reg_read(UC_ARM_REG_PC))

    def event(self,key,cut=None):
        self.execute(self.sym["dfu_observer"], EVENT[key], cut)

    def drain(self):
        while self.queue:
            callback = self.queue.pop(0)
            assert callback == self.sym["display_update_deferred"]
            self.execute(callback)

    def frame(self):
        return sha256(self.uc.mem_read(self.sym["m_display_content"],1024)).hexdigest()

from unicorn import UC_HOOK_MEM_WRITE, UC_HOOK_MEM_READ
from unicorn.arm_const import UC_ARM_REG_PRIMASK
irq_bit=1<<22
ISER,ICER=0xe000e100,0xe000e180

class IRQProbe(Probe):
    def __init__(self, elf, inject_at=None, reconnect=False, force_bypass=False):
        super().__init__(elf)
        self.uc.mem_map(0xe000e000,0x1000)
        self.enabled = irq_bit
        self.uc.hook_add(UC_HOOK_MEM_READ,self.nvic_read,begin=ISER,end=ICER+7)
        self.uc.hook_add(UC_HOOK_MEM_WRITE,self.nvic_write,begin=ISER,end=ICER+7)
        self.uc.hook_add(UC_HOOK_CODE,self.irq_check)
        self.inject_at = inject_at
        self.reconnect = reconnect
        self.force_bypass = force_bypass
        self.armed = False
        self.pending = False
        self.delivered_before = None
        self.request_masked = None
        self.drawing = ({self.sym["display_draw"]} | self.skips) if self.lto else {self.sym[n] for n in ("display_draw","lcd_draw_dfu_status","lcd_write_command","lcd_write_data")}

    def nvic_read(self,uc,access,addr,size,value,unused):
        if addr in (ISER,ICER):
            uc.mem_write(addr,struct.pack("<I",self.enabled))
    def nvic_write(self,uc,access,addr,size,value,unused):
        if addr==ISER:
            self.enabled |= value
        elif addr==ICER:
            self.enabled &= ~value
    def masked(self):
        return bool(self.uc.reg_read(UC_ARM_REG_PRIMASK) or not self.enabled & irq_bit)
    def irq_check(self,uc,pc,size,unused):
        if pc in self.drawing:
            assert not self.masked(), (hex(pc),"would draw under mask")
        if self.armed and pc == self.inject_at:
            self.armed = False
            self.pending = True
            self.request_masked = self.masked()
        if self.pending and (not self.masked() or self.force_bypass):
            self.delivered_before = pc
            self.pending = False
            uc.emu_stop()

def run_case(elf,event,pc,reconnect,force_bypass=False):
    probe=IRQProbe(elf,pc,reconnect,force_bypass)
    probe.event("initialize"); waiting=probe.frame()
    probe.event("connect"); probe.drain(); ready=probe.frame()
    probe.event(event); request_frame=probe.frame()
    probe.event("disconnect"); probe.drain(); probe.event("connect"); probe.drain()
    probe.armed=True
    uc=probe.uc
    import unicorn.arm_const as arm
    uc.reg_write(arm.UC_ARM_REG_R0,EVENT[event]); uc.reg_write(arm.UC_ARM_REG_LR,STOP|1)
    uc.emu_start(probe.sym["dfu_observer"]|1,STOP,count=400000)
    assert probe.delivered_before is not None
    assert uc.reg_read(UC_ARM_REG_PC)==probe.delivered_before
    saved=uc.context_save()
    uc.reg_write(UC_ARM_REG_SP,uc.reg_read(UC_ARM_REG_SP)-32)
    probe.event("disconnect")
    if reconnect:
        probe.event("connect")
    uc.context_restore(saved)
    uc.emu_start(probe.delivered_before|1,STOP,count=400000)
    assert uc.reg_read(UC_ARM_REG_PC)==STOP
    probe.drain()
    state={waiting:"waiting",ready:"ready",request_frame:event}[probe.frame()]
    return {"event":event,"irqRequestedBefore":hex(pc),"disconnectThenReconnect":reconnect,"maskBypassedForNegativeControl":force_bypass,
        "irqMaskedAtRequest":probe.request_masked,"irqActuallyDeliveredBefore":hex(probe.delivered_before),"finalFramebuffer":state}

