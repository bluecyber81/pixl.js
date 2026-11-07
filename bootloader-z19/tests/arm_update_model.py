"""Run init-execute, bank selection and image hash checks in the two actual bootloader ELFs."""
import argparse
from pathlib import Path
import hashlib, json, sys, struct, zipfile, zlib
from unicorn import Uc, UC_MODE_MCLASS, UC_MODE_THUMB, UC_ARCH_ARM, UC_PROT_READ, UC_PROT_EXEC
from unicorn.arm_const import UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3
from unicorn.arm_const import UC_ARM_REG_PC, UC_ARM_REG_SP, UC_ARM_REG_LR, UC_ARM_REG_XPSR

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT.parent
sys.path.insert(0, str(ROOT / 'tests'))
from elf_crypto_regression import elf_load, signed_input, proto
SOFTDEVICE = SHARED / '04_SDK_und_SoftDevice/S112_7_3_0/s112_nrf52_7.3.0.zip'
COPY_START=0x19000
SHA=lambda b:hashlib.sha256(b).hexdigest()
I=lambda x:struct.pack('<I',x)
REGS=(UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3)

def sd_image():
    assert SHA(SOFTDEVICE.read_bytes())=='af3e558dd752311fb71e3623d12c37711b9664d485b8bc5cd9164620c0ae1ca4'
    z=zipfile.ZipFile(SOFTDEVICE)
    hexfile,=[n for n in z.namelist() if n.endswith('.hex')]
    blob=z.read(hexfile)
    assert SHA(blob)=='92bcdc1aa51142ed212bb0dbcdf57093a1bad391f1cf5adca60effe14bdb7ec6'
    image=bytearray(b'\xff'*COPY_START)
    offset=0
    for line in blob.splitlines():
        rec=bytes.fromhex(line[1:].decode())
        assert line[0:1]==b':' and sum(rec)%256==0
        size,addr,kind=struct.unpack_from('>BHB',rec)
        data=rec[4:-1]; assert len(data)==size
        if kind==4: offset=int.from_bytes(data,'big')<<16
        if kind==0:
            assert offset+addr+size<=len(image)
            image[offset+addr:offset+addr+size]=data
    assert struct.unpack_from('<H',image,0x300c)==(0x126,)
    return bytes(image)

def package(path,kind):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        entry=json.loads(z.read('manifest.json'))['manifest'][kind]
        dat=z.read(entry['dat_file']); payload=z.read(entry['bin_file'])
    _,ini=signed_input(dat); fields=proto(ini)
    embedded=proto(fields[8])[2]
    assert hashlib.sha256(payload).digest()[::-1]==embedded
    return dict(dat=dat,payload=payload,expected_hash=embedded,counter=fields[1])

class Machine:
    def __init__(self,model,sd,counter,application,fwid):
        _,sections,self.sym,_=model
        self.u=Uc(UC_ARCH_ARM,UC_MODE_THUMB|UC_MODE_MCLASS)
        for a,n in ((0,0x80000),(0x20000000,0x10000),(0x10001000,0x1000)):
            self.u.mem_map(a,n)
        self.u.mem_write(0,sd)
        self.u.mem_write(COPY_START,application)
        for address,data in sections: self.u.mem_write(address,data)
        self.u.mem_write(0x300c,struct.pack('<H',fwid))
        self.settings=self.sym['s_dfu_settings']; self.put(self.settings+4,2)
        self.put(self.settings+8,632); self.put(self.settings+12,counter)
        self.put(self.settings+24,len(application));self.put(self.settings+28,zlib.crc32(application));self.put(self.settings+32,1)
        self.u.mem_write(0x18000,b'\x00\xbe')
        self.u.mem_protect(0,0x80000,UC_PROT_READ|UC_PROT_EXEC)

    def put(self,addr,x):
        self.u.mem_write(addr,I(x))

    def read(self,addr):
        return struct.unpack('<I',bytes(self.u.mem_read(addr,4)))[0]

    def call(self,fn,args):
        sp=0x2000fff8
        for i,r in enumerate(REGS):
            self.u.reg_write(r,args[i] if i<len(args) else 0)
        self.u.mem_write(sp,I(args[4] if len(args)>4 else 0))
        self.u.reg_write(UC_ARM_REG_SP,sp);self.u.reg_write(UC_ARM_REG_LR,0x18001)
        self.u.reg_write(UC_ARM_REG_XPSR,1<<24)
        self.u.emu_start(self.sym[fn]|1,0x18000,timeout=20000000,count=125000000)
        assert self.u.reg_read(UC_ARM_REG_PC)==0x18000 and self.u.reg_read(UC_ARM_REG_SP)==sp,(fn,hex(self.u.reg_read(UC_ARM_REG_PC)))
        return self.u.reg_read(UC_ARM_REG_R0)

    def execute(self,dat):
        # s_dfu_settings.progress and init_command from nrf_dfu_types.h, pack(4).
        self.put(self.settings+56,len(dat));self.put(self.settings+60,len(dat));self.put(self.settings+64,zlib.crc32(dat))
        self.u.mem_write(self.settings+92,dat)
        addr=self.sym['m_firmware_start_addr'];size=self.sym['m_firmware_size_req']
        fn='nrf_dfu_validation_init_cmd_execute'
        if fn not in self.sym:fn+='.constprop.0' # GCC baked in the same two addresses
        code=self.call(fn,[addr,size])
        return {'code':code,'destination':self.read(addr),'dataBytes':self.read(size),'bank0Code':self.read(self.settings+32)}
