"""Exact reviewed translations and read-only database information navigation."""
import importlib.util
import json
import unittest
from root_host import FW, SRC, HostTests, function

spec = importlib.util.spec_from_file_location("generate_usage_de", FW / "scripts/generate_usage_de.py")
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


class NotesTests(HostTests):
    def test_generated_header_matches_reviewed_firmware_translation_source(self):
        data = json.loads(generator.INPUT.read_text(encoding="utf-8"))
        self.assertEqual(generator.OUTPUT.read_text(encoding="utf-8"), generator.render(data))
        self.assertEqual(len(data["texts"]), 53)
        enc, dictionary = generator.pack(list(data["texts"].values()))
        self.assertEqual(len(enc), len(data["texts"]))
        for value, packed in zip(data["texts"].values(), enc):
            decoded = "".join(dictionary[ord(ch)-1] if ord(ch) < 32 else ch for ch in packed)
            self.assertEqual(decoded, value)
            self.assertLessEqual(len(decoded.encode("utf-8")), generator.MAX_UTF8)
        self.assertEqual(generator.render(data), generator.render({
            **data, "texts": dict(reversed(list(data["texts"].items())))
        }))
        # Every exact English key exists in the shipped C catalogue, not merely
        # in a translation file. Renamed catalogue text must receive review.
        catalogue = (SRC / "amiidb/db_link.c").read_text(encoding="utf-8")
        for english in data["texts"]:
            self.assertIn(json.dumps(english, ensure_ascii=False), catalogue)

    def test_champion_rewards_follow_figure_and_game_ids_in_compiled_lcd_tables(self):
        self.compile_run(r'''
#include <assert.h>
#include <stdio.h>
#include "db_amiibo.c"
#include "db_link.c"
#include "amiibo_usage_de.h"
int main(void) {
    const struct { uint32_t head, tail; const char *beast; } figures[] = {
        {0x01060000, 0x03590902, "Vah Naboris"},
        {0x01070000, 0x035a0902, "Vah Ruta"}
    };
    for (size_t f = 0; f < sizeof(figures) / sizeof(*figures); ++f) {
        unsigned found[5] = {0};
        for (size_t i = 0; link_list[i].game_id; ++i) {
            db_link_t link = link_list[i];
            if (link.game_id != 1 && link.game_id != 4) continue;
            const db_amiibo_t *figure = &amiibo_list[link.amiibo_index];
            if (figure->head != figures[f].head || figure->tail != figures[f].tail) continue;
            char decoded[AMIIBO_USAGE_DE_BUFFER_BYTES];
            const char *en = db_usage_notes[link.note_index].en;
            const char *de = amiibo_usage_de(en, decoded, sizeof(decoded));
            assert(de == decoded && strstr(de, "Waffen") && strstr(de, "Materialien"));
            assert(strstr(en, "weapons") && strstr(en, "materials"));
            if (link.game_id == 4) {
                assert(strstr(de, "Helm") && strstr(en, "headgear"));
                assert(strstr(de, figures[f].beast) && strstr(en, figures[f].beast));
            } else {
                assert(strstr(de, "Parasegelstoff") && strstr(en, "paraglider fabric"));
                assert(!strstr(de, "Helm") && !strstr(en, "headgear"));
            }
            ++found[link.game_id];
        }
        assert(found[1] == 1 && found[4] == 1);
    }
    puts("PASS four LCD rewards identified by figure and game");
    return 0;
}
''', includes=[SRC / "amiidb", SRC / "app/amiidb/view"])

    def test_generator_rejects_empty_oversized_control_and_invalid_utf8_tables(self):
        invalid = [{}, {"schemaVersion": 2, "texts": {"a": "b"}},
                   {"schemaVersion": 1, "texts": {}},
                   {"schemaVersion": 1, "texts": {str(i): "b" for i in range(55)}},
                   {"schemaVersion": 1, "texts": {"a": ""}},
                   {"schemaVersion": 1, "texts": {"a": "ä" * 96}},
                   {"schemaVersion": 1, "texts": {"a": "b\0"}},
                   {"schemaVersion": 1, "texts": {"a": "\ud800"}}]
        for data in invalid:
            with self.subTest(data=data), self.assertRaises((ValueError, UnicodeError)):
                generator.render(data)

    def test_real_translation_lookup_exact_keys_fallback_and_input_immutable(self):
        data = json.loads(generator.INPUT.read_text(encoding="utf-8"))
        assertions = "\n".join("assert(!strcmp(amiibo_usage_de(%s,out,AMIIBO_USAGE_DE_BUFFER_BYTES), %s));" %
            (json.dumps(en, ensure_ascii=False), json.dumps(de, ensure_ascii=False))
            for en, de in data["texts"].items())
        self.compile_run(r'''
#include <assert.h>
#include <stdio.h>
#include "amiibo_usage_de.h"
int main(void) {
unsigned char guard[AMIIBO_USAGE_DE_BUFFER_BYTES + 2];memset(guard,0xdd,sizeof(guard));char *out=(char *)guard+1;
''' + assertions + r'''
char changed[]="Gerudo-King Fabric ";char copy[sizeof(changed)];memcpy(copy,changed,sizeof(changed));
assert(amiibo_usage_de(changed,out,AMIIBO_USAGE_DE_BUFFER_BYTES)==changed && !memcmp(copy,changed,sizeof(changed)));
assert(!strcmp(amiibo_usage_de("",out,AMIIBO_USAGE_DE_BUFFER_BYTES),"") && !strcmp(amiibo_usage_de(NULL,out,AMIIBO_USAGE_DE_BUFFER_BYTES),""));
assert(!strcmp(amiibo_usage_de("Untranslated source text",out,AMIIBO_USAGE_DE_BUFFER_BYTES),"Untranslated source text"));
assert(guard[0]==0xdd && guard[sizeof(guard)-1]==0xdd);
const char *known="Gerudo-King Fabric";
memset(out,0x55,AMIIBO_USAGE_DE_BUFFER_BYTES);
assert(amiibo_usage_de(known,out,AMIIBO_USAGE_DE_BUFFER_BYTES-1)==known);
for(size_t i=0;i<AMIIBO_USAGE_DE_BUFFER_BYTES;i++)assert(out[i]==0x55);
assert(amiibo_usage_de(known,NULL,0)==known);
puts("PASS reviewed DE text, exact-key EN fallback and immutable input");return 0;}
''', includes=[SRC / "app/amiidb/view"])

    def test_real_menu_readonly_view_entry_and_return(self):
        source = (SRC / "app/amiidb/scene/amiidb_scene_amiibo_detail_menu.c").read_text(encoding="utf-8")
        # Compile the actual two shared info cases, retaining the production
        # selector/body, and the actual return callback. Other menu operations
        # are covered by their own persistence/slot tests.
        selected = function(source, "amiidb_scene_amiibo_detail_menu_on_selected")
        start = selected.index("case AMIIDB_DETAIL_MENU_FIGURE_INFO:")
        end = selected.index("case AMIIDB_DETAIL_MENU_BACK_FILE_BROWSER:")
        cases = selected[start:end]
        back = function(source, "amiidb_scene_figure_info_back")
        self.compile_run(r'''
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
typedef struct amiibo_view_s amiibo_view_t;
typedef int amiibo_view_event_t;
enum {AMIIBO_VIEW_EVENT_MENU,AMIIBO_VIEW_EVENT_UPDATE,AMIIBO_VIEW_EVENT_DESC_UPDATE};
enum {AMIIDB_DETAIL_MENU_FIGURE_INFO,AMIIDB_DETAIL_MENU_NOTES};
enum {AMIIDB_VIEW_ID_LIST=1,AMIIDB_VIEW_ID_DETAIL};
struct amiibo_view_s {void *user_data;uint8_t info_page,focus;void(*event_cb)(int,amiibo_view_t*);};
typedef struct {void *p_view_dispatcher;amiibo_view_t *p_amiibo_view;} app_amiidb_t;
static unsigned shown,updates;
static void mui_view_dispatcher_switch_to_view(void *d,unsigned id){(void)d;shown=id;updates++;}
static void amiibo_view_set_event_cb(amiibo_view_t*v,void(*cb)(int,amiibo_view_t*)){v->event_cb=cb;}
''' + back + '\nstatic void select_info(app_amiidb_t *app,unsigned selection){switch(selection){\n' + cases + r'''
}}
int main(void){amiibo_view_t view={0};app_amiidb_t app={0,&view};view.user_data=&app;view.focus=9;
select_info(&app,AMIIDB_DETAIL_MENU_NOTES);
assert(view.info_page==3 && shown==AMIIDB_VIEW_ID_DETAIL && updates==1 && view.focus==9);
view.event_cb(AMIIBO_VIEW_EVENT_DESC_UPDATE,&view);assert(updates==1);
view.event_cb(AMIIBO_VIEW_EVENT_MENU,&view);assert(view.info_page==0 && shown==AMIIDB_VIEW_ID_LIST && updates==2);
select_info(&app,AMIIDB_DETAIL_MENU_FIGURE_INFO);assert(view.info_page==1 && shown==AMIIDB_VIEW_ID_DETAIL);
view.event_cb(AMIIBO_VIEW_EVENT_MENU,&view);assert(view.info_page==0 && view.focus==9 && shown==AMIIDB_VIEW_ID_LIST);
puts("PASS actual shared info menu entry/return; no slot selection or data mutation");return 0;}
''')


if __name__ == "__main__":
    unittest.main()
