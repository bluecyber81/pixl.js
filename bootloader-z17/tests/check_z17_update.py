"""Actual Z15 -> Z17 -> App634 ARM acceptance; no radio or physical flash model."""
from pathlib import Path
import argparse, json, zlib, zipfile
import arm_update_model as mod
from arm_update_model import Machine, SHA, I, COPY_START, elf_load, package
from elf_crypto_regression import signed_input, proto

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--reference-stage',type=Path,required=True)
p.add_argument('--zip',type=Path,required=True)
p.add_argument('--oversize-negative',type=Path,default=Path(__file__).parent/'crypto-fixtures/oversize_z17.dat')
p.add_argument('--output',type=Path,required=True)
p.add_argument('--rollback-zip',type=Path)
a=p.parse_args();root=Path(__file__).resolve().parents[1]
mod.SOFTDEVICE=a.reference_stage/'04_SDK_und_SoftDevice/S112_7_3_0/s112_nrf52_7.3.0.zip'
sd=mod.sd_image()
z15=a.reference_stage/'02_Bootloader_Z15/Quellcode/_build'
models={'Z15':elf_load(z15/'bootloader.out',z15/'BOOTLOADER_UNSIGNED_ANALYSIS.bin'),
        'Z17':elf_load(root/'_build/bootloader.out',root/'_build/BOOTLOADER_UNSIGNED_ANALYSIS.bin')}
assert SHA(models['Z15'][0].ljust(28672,b'\xff'))=='c3200211a846a2912a57c7e4f194d05185e08735df342bd549a201739286bade'
assert SHA(models['Z17'][0].ljust(28672,b'\xff'))=='5fec8c8495978afcd340e6b42db7fc9ba4fa9f216aad2b2a597cc7282877d584'
before=package(a.reference_stage/'01_Firmware_DE3_61_633/Signierte_DFU_App/Allmiibo_LCD_DE3_61_633_TESTSTAND.zip','application')['payload']
inputs={'BL17':package(a.zip,'bootloader'),'App634':package(a.zip,'application')}
if a.oversize_negative.suffix.lower()=='.zip':
    inputs['oversize']=package(a.oversize_negative,'bootloader')
else:
    dat=a.oversize_negative.read_bytes();_,ini=signed_input(dat);fields=proto(ini)
    payload=inputs['BL17']['payload'].ljust(28676,b'\xff');expected=proto(fields[8])[2]
    import hashlib
    assert hashlib.sha256(payload).digest()[::-1]==expected
    inputs['oversize']={'dat':dat,'payload':payload,'expected_hash':expected,'counter':fields[1]}
assert inputs['BL17']['counter']==17 and inputs['App634']['counter']==634
assert len(inputs['oversize']['payload'])==28676
rows=[]
cases=[('Z15','BL17','upgrade',15,633,0x126,False,1),
       ('Z15','BL17','wrong S112 7.2 FWID',15,633,0x103,False,18),
       ('Z15','BL17','corrupt signature',15,633,0x126,True,5),
       ('Z15','oversize','signed payload exceeds boot partition',15,633,0x126,False,4),
       ('Z17','BL17','same boot counter rejected',17,633,0x126,False,16),
       ('Z17','BL17','older boot counter rejected',18,633,0x126,False,16),
       ('Z17','App634','new application',17,633,0x126,False,1),
       ('Z17','App634','same app counter existing policy',17,634,0x126,False,1),
       ('Z17','App634','wrong S112 7.2 FWID',17,633,0x103,False,18),
       ('Z17','App634','corrupt signature',17,633,0x126,True,5)]
if a.rollback_zip:
    inputs['Return18']=package(a.rollback_zip,'bootloader')
    assert inputs['Return18']['counter']==18 and inputs['Return18']['payload']==models['Z15'][0]
    assert package(a.rollback_zip,'application')['payload']==inputs['App634']['payload']
    cases += [('Z17','Return18','return to exact Z15 code',17,634,0x126,False,1),
              ('Z15','BL17','counter17 rejected after return counter18',18,634,0x126,False,16),
              ('Z15','App634','application after return to Z15 code',18,634,0x126,False,1)]
for engine,label,name,bc,ac,fwid,bad,expect in cases:
    item=inputs[label];m=Machine(models[engine],sd,bc,before,fwid);m.put(m.settings+8,ac)
    dat=bytearray(item['dat'])
    if bad:dat[-1]^=1
    result=m.execute(bytes(dat));assert result['code']==expect,(engine,name,result)
    if expect==1:
        assert result['destination']==COPY_START and result['dataBytes']==len(item['payload']) and result['bank0Code']==0
        assert COPY_START+len(item['payload'])<=0x77000
        m.u.mem_write(COPY_START,item['payload']);m.u.mem_write(0x20001400,item['expected_hash'])
        args=[0x20001400,COPY_START,len(item['payload']),1]
        assert m.call('nrf_dfu_validation_hash_ok',args)==1
        m.u.mem_write(COPY_START,bytes([item['payload'][0]^1]));assert m.call('nrf_dfu_validation_hash_ok',args)==0
        result.update(fullPayloadHashAccepted=True,changedPayloadBitRejected=True)
    else:assert result['bank0Code']==1 and result['destination']==0
    rows.append({'engine':engine,'input':label,'case':name,**result});print(engine,name,'PASS',flush=True)
phases=[]
for engine,counter in [('Z17',17)]+([('Z15',18)] if a.rollback_zip else []):
    m=Machine(models[engine],sd,counter,before,0x126);m.put(m.settings+8,633)
    for offset in (24,28,32):m.put(m.settings+offset,0)
    m.u.mem_write(COPY_START,b'\xff'*len(before))
    app=inputs['App634'];result=m.execute(app['dat']);assert result=={'code':1,'destination':COPY_START,'dataBytes':len(app['payload']),'bank0Code':0}
    m.u.mem_write(COPY_START,app['payload']);descriptor=0x20001400
    m.u.mem_write(descriptor,bytes([1])+I(zlib.crc32(app['payload'])).ljust(64,b'\0'))
    args=[descriptor,COPY_START,len(app['payload'])]
    assert m.call('nrf_dfu_validation_boot_validate',args)==1
    m.u.mem_write(COPY_START+len(app['payload'])-1,bytes([app['payload'][-1]^1]))
    assert m.call('nrf_dfu_validation_boot_validate',args)==0
    phases.append({'engine':engine,'bootCounter':counter,'before':'App bank invalid and erased in model',**result,'bootCrcAccepted':True,'changedBitRejected':True})
a.output.write_text(json.dumps({'passed':True,'hardwareAccess':False,'cases':rows,
 'secondAppPhase':phases,
 'inputs':{k:{'bytes':len(v['payload']),'sha256':SHA(v['payload']),'counter':v['counter']} for k,v in inputs.items()},
 'limits':['Actual bound Z15/Z17 ARM validation code; radio, reset handover and physical flash are not emulated.',
           'DFU settings and invalid App bank are explicit model inputs, not device observations.']},indent=2)+'\n')
print('PASS:',len(rows),'signed update cases and',len(phases),'application recovery phases after bootloader replacement.')
