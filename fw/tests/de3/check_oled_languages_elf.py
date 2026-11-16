"""Run the settings language selector and check both OLED firmware translation tables."""
import argparse
import ast
from pathlib import Path
import re
import struct
from subprocess import check_output

from check_stack_watermark_elf import tool
from unicorn import Uc, UC_ARCH_ARM, UC_HOOK_CODE, UC_MODE_MCLASS, UC_MODE_THUMB
from unicorn.arm_const import (UC_CPU_ARM_CORTEX_M4, UC_ARM_REG_LR, UC_ARM_REG_MSP,
                               UC_ARM_REG_PC, UC_ARM_REG_R0, UC_ARM_REG_R1,
                               UC_ARM_REG_R2, UC_ARM_REG_R3)


def verify(elf, binary):
    i18n = Path(__file__).resolve().parents[2] / 'application/src/i18n'
    ids = [key for key in re.findall(r'^\s*(_L_\w+)\s*,', (i18n / 'string_id.h').read_text(), re.M)
           if key != '_L_COUNT']
    tables = []
    for locale in ('de_DE', 'en_US'):
        rows = re.findall(r'^\s*\[(_L_\w+)\]\s*=\s*("(?:[^"\\]|\\.)*"),',
                          (i18n / (locale + '.c')).read_text(encoding='utf-8'), re.M)
        table = {key: ast.literal_eval(value) for key, value in rows}
        assert ids and set(ids) == set(table), set(ids) ^ set(table)
        tables.append(table)
    cpu = Uc(UC_ARCH_ARM, UC_MODE_MCLASS | UC_MODE_THUMB)
    cpu.ctl_set_cpu_model(UC_CPU_ARM_CORTEX_M4)
    cpu.mem_map(0, 0x80000)
    cpu.mem_map(0x20000000, 0x10000)
    symbols = {}
    for row in check_output([tool('nm'), '-n', elf], text=True).splitlines():
        fields = row.split()
        if len(fields) == 3:
            symbols[fields[2]] = int(fields[0], 16)
    cpu.mem_write(symbols['__isr_vector'], binary.read_bytes())
    regs = (UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3)
    def call(addr, *args):
        for reg, value in zip(regs, args):
            cpu.reg_write(reg, value)
        cpu.reg_write(UC_ARM_REG_MSP, symbols['__StackTop'])
        cpu.reg_write(UC_ARM_REG_LR, 0x101)
        cpu.emu_start(addr | 1, 0x100, count=20000)
        assert cpu.reg_read(UC_ARM_REG_PC) == 0x100
        return cpu.reg_read(UC_ARM_REG_R0)

    def cstr(addr):
        return bytes(cpu.mem_read(addr, 1024)).split(b'\0', 1)[0].decode()

    # Stub the widget boundary; the settings scene populates the menu and
    # stores its own callback. Selection and lookups run from the linked BIN.
    entries, callbacks, focus = [], [], []
    def hook(name, action):
        def stub(machine, address, size, data):
            action(*(cpu.reg_read(reg) for reg in regs))
            cpu.reg_write(UC_ARM_REG_PC, cpu.reg_read(UC_ARM_REG_LR))
        addr = symbols[name]
        cpu.hook_add(UC_HOOK_CODE, stub, begin=addr, end=addr)
    hook('mui_list_view_add_item', lambda view, icon, label, val: entries.append((cstr(label), val)))
    hook('mui_list_view_set_selected_cb', lambda view, callback, *_: callbacks.append(callback))
    hook('mui_list_view_set_focus', lambda view, index, *_: focus.append(index))
    hook('mui_view_dispatcher_switch_to_view', lambda *_: None)
    hook('mui_scene_dispatcher_previous_scene', lambda *_: None)
    app, view, item = 0x20001000, 0x20001100, 0x20001200
    cpu.mem_write(app, struct.pack('<I', view))
    call(symbols['mui_list_view_set_user_data'], view, app)
    for index in (0, 1, 0):
        entries.clear()
        call(symbols['settings_scene_language_on_enter'], app)
        assert entries[:2] == [('Deutsch', 0), ('English', 1)] and len(entries) == 3
        assert callbacks[-1] & ~1 == symbols['settings_scene_language_list_view_on_selected']
        cpu.mem_write(item, struct.pack('<I', entries[index][1]) * 8)
        call(callbacks[-1], 0, view, item)
        assert call(symbols['getLanguage']) == index
        for n, key in enumerate(ids):
            actual = cstr(call(symbols['getLangString'], n))
            assert actual and actual == tables[index][key], (index, key, actual, tables[index][key])
        entries.clear()
        call(symbols['settings_scene_language_on_enter'], app)
        assert focus[-1] == index
        assert entries[-1] == (tables[index]['_L_BACK'], 0xffffffff)
    print(f'PASS OLED settings Deutsch -> English -> Deutsch, {len(ids)} nonempty menu strings per language.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('elf', type=Path)
    parser.add_argument('binary', type=Path)
    args = parser.parse_args()
    verify(args.elf, args.binary)
