"""Exercise all shipped game-to-figure hint links through the linked OLED view."""
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import struct
import subprocess
from unicorn import Uc, UC_ARCH_ARM, UC_MODE_THUMB, UC_MODE_MCLASS
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_LR, UC_ARM_REG_MSP,
                              UC_ARM_REG_PC, UC_ARM_REG_R0, UC_ARM_REG_R1)


def verify(directory, fw):
    binary = (directory / "pixljs.bin").read_bytes()
    nm = subprocess.check_output(["arm-none-eabi-nm", "-n", "-S", directory / "pixljs.out"], text=True)
    sym, size = {}, {}
    for row in nm.splitlines():
        part = row.split()
        if len(part) == 4:
            sym[part[-1]], size[part[-1]] = int(part[0],16), int(part[1],16)
        elif len(part) == 3:
            sym[part[-1]] = int(part[0],16)
    cpu=Uc(UC_ARCH_ARM, UC_MODE_MCLASS|UC_MODE_THUMB)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    cpu.mem_map(0,0x80000)
    cpu.mem_map(0x20000000,0x10000)
    cpu.mem_write(0x19000,binary)
    # Materialise data initialisers (Unicorn does not execute Reset_Handler).
    data_total=sym["__data_end__"]-sym["__data_start__"]
    cpu.mem_write(sym["__data_start__"],bytes(cpu.mem_read(sym["__etext"],data_total)))
    def call(name,a=0,b=0):
        cpu.reg_write(UC_ARM_REG_R0,a);cpu.reg_write(UC_ARM_REG_R1,b)
        cpu.reg_write(UC_ARM_REG_MSP,0x20010000)
        cpu.reg_write(UC_ARM_REG_LR,0x101)
        cpu.emu_start(sym[name]|1,0x100,count=300000)
        assert cpu.reg_read(UC_ARM_REG_PC)==0x100
        return cpu.reg_read(UC_ARM_REG_R0)
    def string(p):
        return bytes(cpu.mem_read(p,350)).split(b"\0",1)[0].decode()
    def uint(p):
        return int.from_bytes(cpu.mem_read(p,4),"little")
    # Synthetic view and tag in otherwise unused model RAM. ARM layout from
    # the linked amiibo_view_usage: view->ntag @4, game_id @20 (after windowed_favorites), tag ID @84.
    view,tag,buf=0x20000800,0x20000900,0x20000c00
    cpu.mem_write(view+4,struct.pack("<I",tag))
    german=json.loads((fw/"data/usage-translations.de.json").read_bytes())["texts"]
    notes,count=Counter(),Counter()
    examples={}
    lang_ids=(0,1)
    ui=[]
    for lang in lang_ids:
        call("setLanguage",lang)
        ui.append({"label":string(call("getLangDesc",lang)), "on":string(call("getLangString",0)),
                   "off":string(call("getLangString",1)), "back":string(call("getLangString",4))})
    assert [x["label"] for x in ui]==["Deutsch","English"]
    name_counts=Counter()
    sample_shared=[]
    for i in range(uint(sym["amiibo_list_size"])):
        entry=sym["amiibo_list"]+i*16
        call("setLanguage",0); de=string(call("get_amiibo_display_name",entry))
        call("setLanguage",1); en=string(call("get_amiibo_display_name",entry))
        name_counts["localized" if de != en else "same_catalog_name"]+=1
        if de==en and len(sample_shared)<5:
            sample_shared.append(de)
    for i in range(size["link_list"]//4):
        idx,game,note=struct.unpack("<HBB",cpu.mem_read(sym["link_list"]+4*i,4))
        if not game:
            assert i==size["link_list"]//4-1
            break
        entry=sym["amiibo_list"]+idx*16
        head,tail=struct.unpack("<II",cpu.mem_read(entry,8))
        en_expected=string(uint(sym["db_usage_notes"]+12*note))
        de_expected=german.get(en_expected,en_expected)
        cpu.mem_write(tag+84,struct.pack(">II",head,tail))
        cpu.mem_write(view+20,bytes([game]))
        names,output=[],[]
        for lang,expected in zip(lang_ids,(de_expected,en_expected)):
            call("setLanguage",lang)
            names.append(string(call("get_amiibo_display_name",entry)))
            result=string(call("amiibo_view_usage",view,buf))
            assert result==expected,(i,game,note,names[-1],lang,result,expected)
            output.append(result)
        kind=("no_hint" if not en_expected else "german_translation" if en_expected in german else "english_fallback")
        count[kind]+=1;notes[(kind,en_expected)]+=1
        if "examples" not in examples:
            examples["examples"]=[]
        if (tail in (0x04c51e03,0x04c81e03,0x04fd0902,0x04ff0902) and game in (75,82)) or (kind=="english_fallback" and not any(x["kind"]=="english_fallback" for x in examples["examples"])):
            examples["examples"].append({"kind":kind,"game_id":game,"figure_de":names[0],"figure_en":names[1],"de":output[0],"en":output[1]})
    return {"binary_sha256":sha256(binary).hexdigest(),"language_selector":ui,"checked_game_figure_links":sum(count.values()),
            "checked_both_languages":True,"links":dict(count),"figure_names":dict(name_counts),"sample_shared_names":sample_shared,"unique_english_texts_by_category":dict(Counter(kind for kind,en in notes)),
            **examples}


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory",type=Path)
    parser.add_argument("fw",type=Path)
    args=parser.parse_args()
    print(json.dumps(verify(args.directory,args.fw),ensure_ascii=False,indent=2))
