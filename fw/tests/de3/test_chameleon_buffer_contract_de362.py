"""Real tag layouts/helpers: absent, truncated and unknown card buffers fail closed."""
import os
from pathlib import Path
import re
import unittest
from root_host import FW, function
from test_chameleon_factory_errors_de349 import compile_actual


class BufferContractTests(unittest.TestCase):
    def test_all_types_and_slots_with_real_headers(self):
        source_fw = Path(os.environ.get('PIXL_BUFFER_SOURCE', FW))
        tag = source_fw / 'components/chameleon-ultra/firmware/application/src/rfid/nfctag'
        helper = (source_fw / 'application/src/app/chameleon/port/tag_helper.c').read_text()
        header = (source_fw / 'application/src/app/chameleon/port/tag_helper.h').read_text()
        mf = (tag / 'hf/nfc_mf1.h').read_text().replace('#include "netdata.h"', '').replace('"nfc_14a.h"', '"hf/nfc_14a.h"')
        code = '#include <assert.h>\n#include <stddef.h>\n#include <stdio.h>\n#include <string.h>\n' + mf
        code += '\n#include "hf/nfc_mf0_ntag.h"\n#define ARRAY_SIZE(a) (sizeof(a)/sizeof((a)[0]))\n#define NFC_TAG_NTAG_DATA_SIZE 4\n'
        code += re.search(r'typedef struct \{[^}]*\} tag_specific_type_name_t;', header).group()
        code += re.search(r'typedef enum \{[^}]*\} tag_group_type_t;', header).group()
        table = re.search(r'(?:const static|static const) tag_specific_type_name_t tag_type_names\[\] = \{.*?\n\};', helper, re.S).group()
        code += table.replace('const static', 'static const')
        code += '''
static tag_slot_config_t slotConfig;
static uint8_t card[4500] __attribute__((aligned(4)));
static tag_data_buffer_t buffer = {sizeof(card),card,NULL};
static bool missing;
uint8_t tag_emulation_get_slot(void) { return slotConfig.active_slot; }
tag_data_buffer_t *get_buffer_by_tag_type(tag_specific_type_t type) { return missing ? NULL : &buffer; }
nfc_tag_mf1_write_mode_t nfc_tag_mf1_get_write_mode(void) { return NFC_TAG_MF1_WRITE_NORMAL; }
'''
        tag_source = (tag / 'tag_emulation.c').read_text()
        code += function(tag_source, 'tag_emulation_get_specific_types_by_slot')
        for name in ('tag_helper_get_active_tag_type', 'tag_helper_get_tag_group_type',
                     'tag_helper_get_tag_type_name', 'tag_helper_get_active_tag_data_size',
                     'tag_helper_get_active_tag_memory_data', 'tag_helper_is_active_tag_writable'):
            match = re.search(r'(?m)^\s*(?:const\s+)?(?:tag_specific_type_t|tag_group_type_t|tag_specific_type_name_t|size_t|uint8_t|bool)\s*\*?\s*' + name + r'\([^;{]*\)\s*\{', helper)
            self.assertIsNotNone(match, name)
            code += '\n' + function(helper[match.start():], name)
        code += r'''
int main(void) {
    unsigned checks = 0;
    for (unsigned slot = 0; slot < TAG_MAX_SLOT_NUM; ++slot) {
        slotConfig.active_slot = slot;
        slotConfig.slots[slot].tag_lf = TAG_TYPE_EM410X;
        for (unsigned i = 1; i < ARRAY_SIZE(tag_type_names); ++i) {
            tag_specific_type_t type = tag_type_names[i].tag_type;
            slotConfig.slots[slot].tag_hf = type;
            assert(tag_helper_get_active_tag_type() == type);
            size_t offset = tag_helper_get_tag_group_type(type) == TAG_GROUP_MIFARE
                ? offsetof(nfc_tag_mf1_information_t, memory)
                : offsetof(nfc_tag_mf0_ntag_information_t, memory);
            size_t size = tag_type_names[i].data_size;
            buffer.buffer = card; buffer.length = offset + size; missing = false;
            assert(tag_helper_get_active_tag_data_size() == size);
            assert(tag_helper_get_active_tag_memory_data() == card + offset);
            memset(card, 0, sizeof(card));
            assert(tag_helper_is_active_tag_writable());
            --buffer.length;
            assert(tag_helper_get_active_tag_memory_data() == NULL);
            if (tag_helper_get_tag_group_type(type) == TAG_GROUP_NTAG)
                assert(!tag_helper_is_active_tag_writable());
            buffer.length = sizeof(card); buffer.buffer = NULL;
            assert(tag_helper_get_active_tag_memory_data() == NULL);
            buffer.buffer = card; missing = true;
            assert(tag_helper_get_active_tag_memory_data() == NULL);
            checks += 7;
        }
        missing = false; buffer.buffer = card; buffer.length = sizeof(card);
        slotConfig.slots[slot].tag_hf = (tag_specific_type_t)65535;
        assert(tag_helper_get_active_tag_data_size() == 0);
        assert(tag_helper_get_active_tag_memory_data() == NULL);
        slotConfig.slots[slot].tag_hf = TAG_TYPE_UNDEFINED;
        assert(tag_helper_get_active_tag_memory_data() == NULL);
        checks += 3;
    }
    printf("PASS %u card-buffer assertions across all 50 slots and supported HF types\n", checks);
}
'''
        compile_actual(self, code, tag)


if __name__ == '__main__':
    unittest.main()
