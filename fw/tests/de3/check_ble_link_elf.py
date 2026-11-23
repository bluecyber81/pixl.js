"""Read linked MTUDv1/v2 on Cortex-M4 with seeded GATT and real GAP update cases.

Uses the release ELF/BIN and its actual INFO05 registration. Only RAM/NVIC
exist; any radio, timer, storage or GPIO access faults. This proves linked
serialization/event behavior, not SoftDevice negotiation or radio throughput.
"""
import argparse
import json
from pathlib import Path
import struct
from subprocess import check_output

from check_build_fault_elf import firmware
from check_stack_watermark_elf import tool
from unicorn import (Uc, UC_ARCH_ARM, UC_HOOK_CODE, UC_MODE_MCLASS, UC_MODE_THUMB,
                     UC_PROT_EXEC, UC_PROT_READ, UC_PROT_WRITE)
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_LR, UC_ARM_REG_MSP,
                               UC_ARM_REG_PC, UC_ARM_REG_PRIMASK, UC_ARM_REG_R0,
                               UC_ARM_REG_R1, UC_ARM_REG_R2)


def verify(folder):
    metadata,s,image,commands=firmware(folder)
    assert commands[5]==s['df_proto_handler_info_mtu_diagnostic']
    sizes={r[3]:int(r[1],16) for line in check_output([tool('nm'),'-S',folder/'pixljs.out'],text=True).splitlines()
           if len(r:=line.split())==4}
    assert sizes['m_link_profile']==24 and sizes['m_gatt']==16
    cpu=Uc(UC_ARCH_ARM,UC_MODE_MCLASS|UC_MODE_THUMB)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    cpu.mem_map(0,0x80000)
    cpu.mem_write(s['__isr_vector'],image)
    cpu.mem_protect(0,0x80000,UC_PROT_READ|UC_PROT_EXEC)
    cpu.mem_map(0x20000000,0x10000,UC_PROT_READ|UC_PROT_WRITE)
    cpu.mem_map(0xe000e000,0x1000)
    data=bytes(cpu.mem_read(s['__etext'],s['__data_end__']-s['__data_start__']))
    cpu.mem_write(s['__data_start__'],data)
    base=s['__HeapBase'];event=base;frame=base+8;out=base+512;params=base+600;gap=base+640
    replies=[];cases=[]

    def capture(machine,address,size,user):
        data=bytes(machine.mem_read(machine.reg_read(UC_ARM_REG_R0),248))
        replies.append((data[:4],data[4:4+data[247]]))
        machine.reg_write(UC_ARM_REG_PC,machine.reg_read(UC_ARM_REG_LR))
    cpu.hook_add(UC_HOOK_CODE,capture,begin=s['df_core_send_frame'],end=s['df_core_send_frame'])

    def call(name,*args):
        for reg,value in zip((UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2),args):cpu.reg_write(reg,value)
        cpu.reg_write(UC_ARM_REG_MSP,s['__StackTop']);cpu.reg_write(UC_ARM_REG_LR,0x101)
        cpu.reg_write(UC_ARM_REG_PRIMASK,0)
        cpu.emu_start(s[name]|1,0x100,count=100000)
        assert cpu.reg_read(UC_ARM_REG_PC)==0x100 and cpu.reg_read(UC_ARM_REG_MSP)==s['__StackTop'],name
        assert struct.unpack('<I',cpu.mem_read(s['nrf_nvic_state']+8,4))[0]==0,name
        return cpu.reg_read(UC_ARM_REG_R0)

    def request(payload=b'',status=0,chunk=0,event_type=2):
        cpu.mem_write(event,struct.pack('<II',event_type,frame if event_type==2 else 0))
        data=bytearray(struct.pack('<BBH243xB',5,status,chunk,len(payload)));data[4:4+len(payload)]=payload
        cpu.mem_write(frame,bytes(data));replies.clear()
        profile=bytes(cpu.mem_read(s['m_link_profile'],24));gatt=bytes(cpu.mem_read(s['m_gatt'],16))
        call('df_proto_handler_info_mtu_diagnostic',event)
        assert bytes(cpu.mem_read(s['m_link_profile'],24))==profile
        assert bytes(cpu.mem_read(s['m_gatt'],16))==gatt
        return replies.copy()

    # No registered radio model: the linked read-only path must remain in RAM.
    cpu.mem_write(out-1,b'\xa5'*34)
    assert call('ble_link_diagnostic',out,31)==0 and bytes(cpu.mem_read(out-1,34))==b'\xa5'*34
    assert call('ble_link_diagnostic',0,32)==0
    assert call('ble_link_diagnostic',out,32)==0
    cases.append('null_short_and_uninitialized_buffer')
    cpu.mem_write(s['m_ble_initialized'],b'\1')
    cpu.mem_write(s['m_gatt'],struct.pack('<HHBxHHBBI',250,250,27,250,250,0,0,0))
    cpu.mem_write(params,struct.pack('<4H',16,16,0,400))
    call('ble_link_profile_reset',params)
    cpu.mem_write(s['m_conn_handle'],b'\0\0');cpu.mem_write(s['m_nus_session_handle'],b'\0\0')
    cpu.mem_write(s['m_ble_nus_max_data_len'],struct.pack('<H',247))
    call('ble_work_connected')
    v1=b'MTUD'+bytes((1,7))+struct.pack('<4H',250,250,250,247)+b'\0\0'
    assert request()==[(b'\5\0\0\0',v1)]
    cases.append('registered_legacy_mtud_v1_read')
    # Execute the application's actual GAP PHY handler, selected by its observer.
    observers=[struct.unpack('<II',cpu.mem_read(address,8))[0]&~1 for name,address in s.items()
               if name=='m_ble_observer' or name.startswith('m_ble_observer.')]
    assert observers.count(s['ble_evt_handler'])==1
    def gap_update(kind,handle,payload):
        cpu.mem_write(gap,struct.pack('<HHH2x',kind,8+len(payload),handle)+payload)
        call('ble_evt_handler',gap,0)
    gap_update(0x22,0,bytes((0,2,2)))
    v2=bytearray(v1+bytes(16));v2[4]=2;v2[14]=7;v2[15]=0
    v2[16:22]=struct.pack('<3H',16,0,400);v2[22:24]=b'\2\2';v2[28:32]=b'\xff'*4
    assert request(b'\1')==[(b'\5\0\0\0',bytes(v2))]
    assert call('ble_link_diagnostic',out,32)==1
    direct=bytes(v2);direct=direct[:5]+bytes((direct[5]&~4,))+direct[6:]
    assert bytes(cpu.mem_read(out,32))==direct
    assert cpu.mem_read(out-1,1)==b'\xa5' and cpu.mem_read(out+32,1)==b'\xa5'
    cases.append('linked_v2_phy_event_wire_and_buffer_guards')
    gap_update(0x12,0,struct.pack('<4H',6,6,4,500))
    v2[16:22]=struct.pack('<3H',6,4,500)
    assert request(b'\1')==[(b'\5\0\0\0',bytes(v2))]
    cases.append('selected_7_5ms_parameter_event')
    gap_update(0x22,1,bytes((0,1,1)))
    gap_update(0x12,1,struct.pack('<4H',80,80,0,100))
    assert request(b'\1')==[(b'\5\0\0\0',bytes(v2))]
    cases.append('stale_other_handle_ignored')
    gap_update(0x22,0,bytes((0x1a,1,1)));v2[15]=0x1a
    assert request(b'\1')==[(b'\5\0\0\0',bytes(v2))]
    cases.append('failed_phy_does_not_replace_known_values')
    cpu.mem_write(s['m_file_mode'],b'\0');v2[5]&=~2
    assert request(b'\1')==[(b'\5\0\0\0',bytes(v2))]
    cpu.mem_write(s['m_file_mode'],b'\1');v2[5]|=2
    cpu.mem_write(s['file_chunk_state'],b'\1');v2[5]&=~4
    assert request(b'\1')==[(b'\5\0\0\0',bytes(v2))]
    cpu.mem_write(s['file_chunk_state'],b'\0');v2[5]|=4
    cases.append('mode_and_transfer_idle_flags')
    for payload,status,chunk in ((b'\0',0,0),(b'\1\0',0,0),(b'\1',1,0),(b'\1',0,1)):
        assert request(payload,status,chunk)==[(b'\5\1\0\0',b'')]
    for kind in (0,1,3):assert request(event_type=kind)==[]
    cases.append('malformed_and_nonrequest_events')
    cpu.mem_write(s['m_conn_handle'],b'\xff\xff');call('ble_link_profile_reset',0)
    answer=request(b'\1')[0][1]
    assert answer[:6]==b'MTUD\2\6' and answer[14:28]==bytes((0,255))+bytes(12)
    assert answer[28:32]==b'\xff'*4
    cases.append('disconnected_unknown_sentinels')
    return {'passed':True,'device_access':False,'sourceId':metadata['source_id_sha256'],
            'binSha256':metadata['artifacts_sha256']['pixljs.bin'],'cases':cases,
            'linkStateBytes':sizes['m_link_profile'],
            'scope':'Linked release Cortex-M4 code, seeded GATT/GAP RAM, real update/serializer/critical paths. No radio/IRQ timing.'}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('build',type=Path);p.add_argument('--json',type=Path)
    args=p.parse_args();result=verify(args.build)
    if args.json:args.json.write_text(json.dumps(result,indent=2)+'\n')
    print('PASS linked MTUDv1/v2:',len(result['cases']),'cases;',result['linkStateBytes'],'B state;',result['binSha256'])
