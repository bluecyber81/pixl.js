"""Compact ROM links retain every ID and localized note; no device access."""
import csv
import importlib.util
import tempfile
from pathlib import Path
from types import SimpleNamespace
import unittest
from root_host import HostTests

FW = Path(__file__).resolve().parents[2]
SRC = FW / 'application/src'
spec = importlib.util.spec_from_file_location('indexed_db_generator', FW / 'scripts/amiibo_db_gen.py')
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


class IndexedLinksTests(HostTests):
    def test_note_indices_do_not_wrap_and_empty_catalog_has_a_terminator(self):
        figure = SimpleNamespace(id='0000000000000001')
        def note(number):
            return SimpleNamespace(amiibo_id=figure.id, game_id='1',
                                   note_en=str(number), note_cn='', note_it='')
        self.assertIn('const db_link_t link_list[] = {\n    {0}\n};',
                      generator.render_amiibo_links([], [figure]))
        links = [note(i) for i in range(65536)]
        self.assertIn('{0, 1, 65535}', generator.render_amiibo_links(links, [figure]))
        self.assertIn('typedef uint8_t', generator.render_note_index_header(links[:256]))
        self.assertIn('typedef uint16_t', generator.render_note_index_header(links[:257]))
        links.append(note(65536))
        with self.assertRaisesRegex(ValueError, 'Usage note index'):
            generator.render_amiibo_links(links, [figure])

    def test_generated_link_layout_handles_both_index_widths(self):
        figure = SimpleNamespace(id='0000000000000001')
        for count, stride in ((256, 4), (257, 6)):
            with self.subTest(count=count), tempfile.TemporaryDirectory() as temp:
                folder = Path(temp)
                links = [SimpleNamespace(amiibo_id=figure.id, game_id='255', note_en=str(i),
                                         note_cn='', note_it='') for i in range(count)]
                (folder/'db_header.h').write_bytes((SRC/'amiidb/db_header.h').read_bytes())
                (folder/'db_note_index.h').write_text(generator.render_note_index_header(links))
                (folder/'db_link.c').write_text(generator.render_amiibo_links(links, [figure]))
                code = f'''#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "db_link.c"
int main(void) {{
    _Static_assert(sizeof(db_link_t) == {stride}, "link byte size");
    const db_link_t *last = &link_list[{count-1}];
    assert(last->game_id == 255 && last->amiibo_index == 0 && last->note_index == {count-1});
    assert(!strcmp(db_usage_notes[last->note_index].en, "{count-1}"));
    assert(!link_list[{count}].game_id);
    puts("PASS narrow/wide generated index");
}}'''
                self.compile_run(code, includes=[folder])

    def test_current_complete_tables_render_byte_identically_without_publication(self):
        figures = sorted(generator.read_amiibo_from_csv(), key=lambda row: int(row.id, 16))
        links = generator.gen_other_link(figures, generator.read_link_from_csv())
        games = generator.read_games_from_csv()
        rendered = {
            'db_amiibo.c': generator.render_amiibo_data(figures),
            'db_game.c': generator.render_amiibo_games(games, links),
            'db_link.c': generator.render_amiibo_links(links, figures),
            'db_note_index.h': generator.render_note_index_header(links),
        }
        for name, text in rendered.items():
            with self.subTest(name=name):
                self.assertEqual((SRC / 'amiidb' / name).read_bytes(), text.encode('utf8'))

    def test_complete_catalog_matches_independent_csv_ids_and_all_notes(self):
        with (FW / 'data/amiidb_amiibo.csv').open(encoding='utf8', newline='') as stream:
            figures = sorted(list(csv.reader(stream)), key=lambda row: int(row[0], 16))
        with (FW / 'data/amiidb_link.csv').open(encoding='utf8', newline='') as stream:
            links = list(csv.reader(stream))
        linked = {int(row[1], 16) for row in links}
        links += [['255', row[0], '', '', ''] for row in figures if int(row[0], 16) not in linked]
        self.assertEqual(len(figures), 952)
        self.assertEqual(len(links), 1344)
        rows = []
        for row in links:
            game, identifier, english, chinese, italian = row[:5]
            quoted = ','.join('"' + generator.c_string(note) + '"' for note in (english, chinese, italian))
            rows.append('{%d,0x%s,0x%s,%s}' % (int(game), identifier[:8], identifier[8:], quoted))
        code = r'''
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "db_amiibo.c"
#include "db_link.c"
static bool isChineseLanguage(void) { return false; }
typedef struct { unsigned game; uint32_t head,tail; const char *en,*cn,*it; } reference_t;
static const reference_t expected[] = {
''' + ',\n'.join(rows) + '\n};\n'
        code += (SRC / 'amiidb/db_search.c').read_text().replace('#include "settings.h"', '')
        code += r'''
int main(void) {
 const size_t count=sizeof(expected)/sizeof(*expected);
 assert(sizeof(link_list)/sizeof(*link_list)==count+1);
 assert(sizeof(db_usage_notes)/sizeof(*db_usage_notes)==110);
 for(size_t i=0;i<count;i++) {
  const reference_t *ref=&expected[i];const db_link_t *link=&link_list[i];
  assert(link->game_id==ref->game && link->amiibo_index<amiibo_list_size);
  const db_amiibo_t *figure=&amiibo_list[link->amiibo_index];
  assert(figure->head==ref->head && figure->tail==ref->tail);
  assert(link->note_index < sizeof(db_usage_notes)/sizeof(*db_usage_notes));
 assert(!strcmp(db_usage_notes[link->note_index].en,ref->en));
 #ifdef BOARD_LCD
 assert(!*db_usage_notes[link->note_index].cn && !*db_usage_notes[link->note_index].it);
 #else
 assert(!strcmp(db_usage_notes[link->note_index].cn,ref->cn) && !strcmp(db_usage_notes[link->note_index].it,ref->it));
 #endif
  size_t first=0;while(first<i && (expected[first].game!=ref->game || expected[first].head!=ref->head || expected[first].tail!=ref->tail)) first++;
  assert(get_link_by_id(ref->game,ref->head,ref->tail)==&link_list[first]);
 }
 for(size_t i=0;i<amiibo_list_size;i++) {
  assert(get_amiibo_by_id(amiibo_list[i].head,amiibo_list[i].tail)==&amiibo_list[i]);
  assert(get_link_by_id(0,amiibo_list[i].head,amiibo_list[i].tail)==NULL);
 }
 for(unsigned game=0;game<256;game++) {
  assert(get_link_by_id(game,0,0)==NULL);
  assert(get_link_by_id(game,UINT32_MAX,UINT32_MAX)==NULL);
 }
 puts("PASS: all 1344 links, 952 figures, three note languages, lookup and sentinel behavior");
 return 0;
}
'''
        self.compile_run(code, includes=[SRC / 'amiidb'])
        self.compile_run('#define BOARD_LCD\n' + code, includes=[SRC / 'amiidb', SRC])

    def test_generator_rejects_invalid_references_before_output(self):
        figure = lambda value: SimpleNamespace(id=value)
        link = lambda value, game='1': SimpleNamespace(amiibo_id=value, game_id=game,
                                                        note_en='', note_cn='', note_it='')
        a, b = '0000000000000001', '0000000000000002'
        cases = [([], []), ([figure(a), figure(a)], []), ([figure(b), figure(a)], []),
                 ([figure('0'*16)], []), ([figure('not-an-id')], []),
                 ([figure(a)], [link(b)]), ([figure(a)], [link(a, '0')]),
                 ([figure(a)], [link(a, '256')]), ([figure(a)], [link(a, '-1')]),
                 ([figure(a)], [link('bad')]), ([figure(a)] * 65537, [])]
        previous = generator.get_prorject_directory
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            target = root / 'application/src/amiidb/db_link.c'
            target.parent.mkdir(parents=True)
            target.write_bytes(b'preserve prior generated database')
            generator.get_prorject_directory = lambda: str(root)
            try:
                for figures, links in cases:
                    with self.subTest(figures=len(figures), links=len(links)):
                        with self.assertRaises(ValueError):
                            generator.gen_amiibo_link_c_file(links, figures)
                        self.assertEqual(target.read_bytes(), b'preserve prior generated database')
            finally:
                generator.get_prorject_directory = previous
        maximum = [figure('%016x' % n) for n in range(1, 65537)]
        self.assertEqual(generator.link_indices(maximum, [link(maximum[-1].id)]), [65535])
        self.assertEqual(generator.link_indices([figure('ABCDEF0000000001')],
                                                [link('abcdef0000000001', '255')]), [0])


if __name__ == '__main__':
    unittest.main()
