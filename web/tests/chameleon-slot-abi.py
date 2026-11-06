"""Actual firmware-header ABI proof; run with Python, optionally --arm32.

No private fixtures. Peripheral app_util/utils includes alone are stubbed.
Actual structs, enum IDs and page definitions come from firmware headers.
The two actual size functions are extracted without changing their bodies.
"""
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
TAG = ROOT / 'fw/components/chameleon-ultra/firmware/application/src/rfid/nfctag'


def function(source, name):
    start = source.index('static int ' + name + '(')
    begin = source.index('{', start)
    depth = 1
    end = begin + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--arm32', action='store_true')
    args = parser.parse_args()
    compiler = shutil.which('arm-linux-gnueabihf-gcc' if args.arm32 else 'gcc')
    if not compiler:
        raise SystemExit('Required existing compiler unavailable')
    source = (TAG / 'hf/nfc_mf0_ntag.c').read_text(encoding='utf-8')
    code = r'''
#include <assert.h>
#include <stddef.h>
#include <stdio.h>
#include "hf/nfc_mf0_ntag.h"
#define ASSERT assert
_Static_assert(sizeof(nfc_tag_14a_uid_size) == 1, "short enum ABI");
_Static_assert(sizeof(nfc_tag_14a_coll_res_entity_t) == 270, "anticollision size");
_Static_assert(offsetof(nfc_tag_14a_coll_res_entity_t, uid) == 4, "UID offset");
_Static_assert(sizeof(nfc_tag_mf0_ntag_configure_t) == 3, "MF0 config size");
_Static_assert(offsetof(nfc_tag_mf0_ntag_information_t, config) == 270, "config offset");
_Static_assert(offsetof(nfc_tag_mf0_ntag_information_t, memory) == 273, "memory offset");
_Static_assert(TAG_SLOT_CONFIG_CURRENT_VERSION == 8, "config version");
_Static_assert(sizeof(tag_slot_config_t) == 404, "config maximum size");
_Static_assert(offsetof(tag_slot_config_t, slots) == 4, "slots offset");
_Static_assert(sizeof(((tag_slot_config_t *)0)->slots[0]) == 8, "slot stride");
_Static_assert(offsetof(tag_slot_config_t, slots[0].tag_hf) == 8, "HF type offset");
_Static_assert(TAG_TYPE_MF0ICU1 == 1103 && TAG_TYPE_MF0ICU2 == 1104 &&
               TAG_TYPE_MF0UL11 == 1105 && TAG_TYPE_MF0UL21 == 1106, "type IDs");
@TOTAL@
@SIZE@
int main(void) {
    assert(get_information_size_by_tag_type(TAG_TYPE_MF0ICU1) == 337);
    assert(get_information_size_by_tag_type(TAG_TYPE_MF0ICU2) == 417);
    assert(get_information_size_by_tag_type(TAG_TYPE_MF0UL11) == 405);
    assert(get_information_size_by_tag_type(TAG_TYPE_MF0UL21) == 489);
    printf("PASS actual headers/functions: pointer=%zu UID=4 memory=273 sizes=337,417,405,489 config=v8/404\n", sizeof(void *));
    return 0;
}
'''.replace('@TOTAL@', function(source, 'get_total_pages_by_tag_type')).replace('@SIZE@', function(source, 'get_information_size_by_tag_type'))
    with tempfile.TemporaryDirectory(prefix='chameleon-slot-abi-') as directory:
        folder = Path(directory)
        (folder / 'app_util.h').write_text('#define PACKED __attribute__((packed))\n#define STATIC_ASSERT(x) _Static_assert(x,#x)\n')
        (folder / 'utils.h').write_text('')
        cfile = folder / 'check.c'
        cfile.write_text(code)
        executable = folder / ('check' if args.arm32 else 'check.exe')
        cmd = [compiler, '-std=c11', '-Wall', '-Wextra', '-Werror', '-fshort-enums', '-I', str(folder), '-I', str(TAG)]
        if not args.arm32:
            cmd += ['-mno-ms-bitfields']
        subprocess.run(cmd + [str(cfile), '-o', str(executable)], check=True, timeout=60)
        run = ['qemu-arm', '-L', '/usr/arm-linux-gnueabihf', str(executable)] if args.arm32 else [str(executable)]
        subprocess.run(run, check=True, timeout=60)


if __name__ == '__main__':
    main()
