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
        self.assertEqual(len(data["texts"]), 8)
        # Every exact English key exists in the shipped C catalogue, not merely
        # in a translation file. Renamed catalogue text must receive review.
        catalogue = (SRC / "amiidb/db_link.c").read_text(encoding="utf-8")
        for english in data["texts"]:
            self.assertIn(json.dumps(english, ensure_ascii=False), catalogue)

    def test_generator_rejects_empty_oversized_control_and_invalid_utf8_tables(self):
        invalid = [{}, {"schemaVersion": 2, "texts": {"a": "b"}},
                   {"schemaVersion": 1, "texts": {}},
                   {"schemaVersion": 1, "texts": {str(i): "b" for i in range(33)}},
                   {"schemaVersion": 1, "texts": {"a": ""}},
                   {"schemaVersion": 1, "texts": {"a": "b\0"}},
                   {"schemaVersion": 1, "texts": {"a": "\ud800"}}]
        for data in invalid:
            with self.subTest(data=data), self.assertRaises((ValueError, UnicodeError)):
                generator.render(data)

    def test_real_translation_lookup_exact_keys_fallback_and_input_immutable(self):
        data = json.loads(generator.INPUT.read_text(encoding="utf-8"))
        assertions = "\n".join("assert(!strcmp(amiibo_usage_de(%s), %s));" %
            (json.dumps(en, ensure_ascii=False), json.dumps(de, ensure_ascii=False))
            for en, de in data["texts"].items())
        self.compile_run(r'''
#include <assert.h>
#include <stdio.h>
#include "amiibo_usage_de.h"
int main(void) {
''' + assertions + r'''
char changed[]="Gerudo-King Fabric ";char copy[sizeof(changed)];memcpy(copy,changed,sizeof(changed));
assert(amiibo_usage_de(changed)==changed && !memcmp(copy,changed,sizeof(changed)));
assert(!strcmp(amiibo_usage_de(""),"") && !strcmp(amiibo_usage_de(NULL),""));
assert(!strcmp(amiibo_usage_de("Untranslated source text"),"Untranslated source text"));
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
