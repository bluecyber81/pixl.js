"""Verify AES with known answers and an independent OpenSSL-backed reference on the linked Cortex-M4 code."""
import argparse
from hashlib import sha256
from pathlib import Path
import struct
from subprocess import check_output
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from unicorn import Uc, UC_ARCH_ARM, UC_HOOK_CODE, UC_MODE_MCLASS, UC_MODE_THUMB
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_LR, UC_ARM_REG_MSP, UC_ARM_REG_PC,
                               UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3)
from check_stack_watermark_elf import tool


def verify(elf, binary):
    records = [line.split() for line in check_output([tool("nm"), "-n", elf], text=True).splitlines()]
    symbols = {line[2]: int(line[0], 16) for line in records if len(line) == 3}
    cpu = Uc(UC_ARCH_ARM, UC_MODE_MCLASS | UC_MODE_THUMB)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    cpu.mem_map(0, 0x80000)
    cpu.mem_map(0x20000000, 0x10000)
    cpu.mem_map(0xe000e000, 0x1000)  # NVIC accessed by SDK logging critical regions
    cpu.mem_write(symbols["__isr_vector"], binary.read_bytes())
    data = cpu.mem_read(symbols["__etext"], symbols["__data_end__"] - symbols["__data_start__"])
    cpu.mem_write(symbols["__data_start__"], bytes(data))
    # Scratch within the application's uninitialized 18 KiB UI pool; the crypto calls
    # below do not start the UI or its allocator.
    heap = symbols["m_mem"]
    ctx, key_at, counter, stream, offset, buf = [heap + n for n in (0x10, 0x200, 0x230, 0x250, 0x268, 0x281)]
    sp = symbols["__StackTop"] - 32
    assert buf + 2050 < sp - 8192
    def call(name, *args):
        for reg, val in zip((UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3), args):
            cpu.reg_write(reg,val)
        if len(args)>4:
            cpu.mem_write(sp,struct.pack("<" + "I"*(len(args)-4),*args[4:]))
        cpu.reg_write(UC_ARM_REG_MSP,sp)
        cpu.reg_write(UC_ARM_REG_LR,0x101)
        cpu.emu_start(symbols[name] | 1,0x100,count=2_000_000)
        assert cpu.reg_read(UC_ARM_REG_PC)==0x100 and cpu.reg_read(UC_ARM_REG_MSP)==sp,name
        return cpu.reg_read(UC_ARM_REG_R0)

    # FIPS-197 Appendix C; encryption and decryption through their own key schedules.
    plaintext = bytes.fromhex("00112233445566778899aabbccddeeff")
    known = ["69c4e0d86a7b0430d8cdb78070b4c55a","dda97ca4864cdfe06eaf70a0ec0d7191","8ea2b7ca516745bfeafc49904b496089"]
    checks = 0
    for keysize, ciphertext in zip((16,24,32), known):
        key = bytes(range(keysize))
        cpu.mem_write(key_at,key)
        for decrypt in (False,True):
            call("mbedtls_aes_init",ctx)
            assert call("mbedtls_aes_setkey_"+("dec" if decrypt else "enc"),ctx,key_at,keysize*8)==0
            cpu.mem_write(buf,bytes.fromhex(ciphertext) if decrypt else plaintext)
            assert call("mbedtls_aes_crypt_ecb",ctx,int(not decrypt),buf,buf)==0
            assert cpu.mem_read(buf,16)==(plaintext if decrypt else bytes.fromhex(ciphertext))
            call("mbedtls_aes_free",ctx)
            checks+=1
        # Non-aligned in-place data, partial blocks, chunk continuation and a counter carry.
        for n in (0,1,15,16,17,392,2048):
            payload=bytes((i*29+17)%256 for i in range(n))
            iv=bytes.fromhex("00000000000000000000000000fffffe")
            encryptor=Cipher(algorithms.AES(key),modes.CTR(iv)).encryptor()
            expected=encryptor.update(payload)+encryptor.finalize()
            call("mbedtls_aes_init",ctx)
            assert call("mbedtls_aes_setkey_enc",ctx,key_at,keysize*8)==0
            cpu.mem_write(counter,iv)
            cpu.mem_write(stream,bytes(16))
            cpu.mem_write(offset,bytes(4))
            cpu.mem_write(buf-1,b"\xa6"+payload+b"\xb7")
            for begin,end in ((0,min(13,n)),(min(13,n),n)):
                assert call("mbedtls_aes_crypt_ctr",ctx,end-begin,offset,counter,stream,buf+begin,buf+begin)==0
            assert cpu.mem_read(buf-1,n+2)==b"\xa6"+expected+b"\xb7"
            assert int.from_bytes(cpu.mem_read(offset,4),"little")==n%16
            assert int.from_bytes(cpu.mem_read(counter,16),"big")==int.from_bytes(iv,"big")+(n+15)//16
            call("mbedtls_aes_free",ctx)
            checks+=1
    print(f"PASS {checks} Cortex-M4 AES cases: ECB FIPS-197 encrypt/decrypt and OpenSSL CTR, AES128/192/256")

    # Exercise the application's complete tag packing routine with synthetic inputs only.
    # The reader normally populates two key records; use domain-separated test labels.
    packed_keys, plain, tag, restored = (heap+v for v in (0x1200,0x1300,0x1600,0x1900))
    def record(seed, label):
        block = bytearray((seed+i*13)%256 for i in range(80))
        block[16:30] = label.ljust(14,b"\0")
        block[31] = 7
        return block
    assert call("nrf_crypto_init")==0
    cpu.mem_write(packed_keys,bytes(record(0x21,b"test data")+record(0x78,b"test tag")))
    raw=bytes((i*31+7)%256 for i in range(520))
    cpu.mem_write(plain,raw)
    for v3 in (0,1):
        cpu.mem_write(tag,b"\0"*608)
        call("nfc3d_amiibo_pack",packed_keys,plain,tag,v3)
        cpu.mem_write(restored,b"\0"*520)
        assert call("nfc3d_amiibo_unpack",packed_keys,tag,restored,v3)==1
        decoded=bytes(cpu.mem_read(restored,520))
        # The two signatures are regenerated by pack/unpack.
        assert decoded[:8]==raw[:8] and decoded[0x28:0x1b4]==raw[0x28:0x1b4] and decoded[0x1d4:]==raw[0x1d4:]
    print("PASS linked tag pack/unpack in both layouts with synthetic key records and payload")

    frames = []
    def capture_nus_send(machine, address, size, _):
        payload = machine.reg_read(UC_ARM_REG_R0)
        length = machine.reg_read(UC_ARM_REG_R1)
        assert length == 36
        frames.append(bytes(machine.mem_read(payload,length)))
        machine.reg_write(UC_ARM_REG_R0,0)
        machine.reg_write(UC_ARM_REG_PC,machine.reg_read(UC_ARM_REG_LR))
    tx = symbols["ble_nus_tx_data"] & ~1
    cpu.hook_add(UC_HOOK_CODE,capture_nus_send,begin=tx,end=tx)
    cpu.mem_write(symbols["m_key1"],b"\x23")
    cpu.mem_write(symbols["m_key2"],b"\x57")
    call("ble_amiibolink_send_cmd_v2",0x1234)
    cpu.mem_write(buf,bytes(range(13)))
    call("ble_amiibolink_send_data_v2",buf,13)
    assert len(frames)==2 and frames[0]!=frames[1]
    # Public DE3.74/App647 baseline for precisely these synthetic inputs.
    assert sha256(b"".join(frames)).hexdigest()=="9f9b3b6fed234371a88fced3fdbcc0ba8181445533cee698dbc576548e6f87a3"
    print("PASS linked AmiiboLink v2 synthetic command/data match App647 at the modeled NUS boundary")


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("elf",type=Path)
    parser.add_argument("binary",type=Path)
    args=parser.parse_args()
    verify(args.elf,args.binary)
