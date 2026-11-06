"""Reject corrupt metadata before refresh/publication; allow sparse translations."""
import csv
import importlib.util
import io
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

FW = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('validated_catalog_generator', FW / 'scripts/amiibo_db_gen.py')
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)
A, B, C = 'abcdef0000000001', '0000000000000002', '0000000000000003'


class CatalogValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.project = Path(self.temp.name)
        self.data = self.project / 'data'
        self.data.mkdir()
        self.rows = {
            'amiidb_amiibo.csv': [[A, 'Figure A', ''], [B, 'Figure B', ''], [C, 'Figure C', '']],
            'amiidb_game.csv': [['1', '0', 'Root', '', '1'], ['2', '1', 'Cards', '', '0'],
                                ['3', '2', 'Series', '', '0'], ['255', '0', 'Other', '', '0']],
            'amiidb_link.csv': [['3', A, '', '', ''], ['1', B, 'Quoted "note", two\nlines', '', '']],
        }
        self.write_rows()

    def write_rows(self):
        for name, rows in self.rows.items():
            with (self.data / name).open('w', encoding='utf8', newline='') as stream:
                csv.writer(stream).writerows(rows)

    def test_sparse_translations_quoted_notes_parent_categories_and_other_are_supported(self):
        figures, games, links = generator.read_catalog(self.data)
        self.assertEqual(generator.validate_catalog(figures, games, links), {
            'figures': 3, 'games': 4, 'links': 2, 'uncategorizedFigures': 1,
            'legacyEmptyLinkColumns': 0,
            'englishNoteLinks': 1, 'uniqueEnglishNotes': 1,
        })
        self.assertEqual(links[1].note_en, 'Quoted "note", two\nlines')
        self.assertEqual(generator.count_game_links(games, links, '1'), 2)
        with redirect_stdout(io.StringIO()):
            generated_links = generator.gen_other_link(figures, links)
        self.assertEqual([(l.game_id, l.amiibo_id) for l in generated_links][-1], ('255', C))
        self.assertEqual(generator.validate_catalog(figures, games, generated_links)['links'], 3)

    def test_column_loss_or_extra_fields_never_pass_as_valid_data(self):
        for name in self.rows:
            for alteration in ('missing', 'extra'):
                with self.subTest(file=name, alteration=alteration):
                    original = self.rows[name][0][:]
                    self.rows[name][0] = original[:-1] if alteration == 'missing' else original + ['not-empty' if name.endswith('link.csv') else '']
                    self.write_rows()
                    with self.assertRaisesRegex(ValueError, 'expected exactly'):
                        generator.read_catalog(self.data)
                    self.rows[name][0] = original
        self.write_rows()

    def test_one_historical_empty_link_field_is_read_without_rewriting_but_two_are_rejected(self):
        self.rows['amiidb_link.csv'][0].append('')
        self.write_rows()
        path = self.data / 'amiidb_link.csv'
        before = path.read_bytes()
        figures, games, links = generator.read_catalog(self.data)
        self.assertEqual(generator.validate_catalog(figures, games, links)['legacyEmptyLinkColumns'], 1)
        self.assertEqual((links[0].note_en, links[0].note_cn, links[0].note_it), ('', '', ''))
        self.assertEqual(path.read_bytes(), before)
        self.rows['amiidb_link.csv'][0].append('')
        self.write_rows()
        with self.assertRaisesRegex(ValueError, 'expected exactly 5 columns'):
            generator.read_catalog(self.data)

    def test_missing_files_invalid_utf8_blank_records_and_unclosed_quotes_fail(self):
        for name in self.rows:
            path = self.data / name
            valid = path.read_bytes()
            for replacement in (None, b'\xff\n', valid + b'\n', b'"unclosed quote'):
                with self.subTest(file=name, replacement=replacement):
                    if replacement is None:
                        path.unlink()
                    else:
                        path.write_bytes(replacement)
                    with self.assertRaises((OSError, ValueError)):
                        generator.read_catalog(self.data)
                    path.write_bytes(valid)

    def test_semantic_duplicates_are_rejected_even_with_different_id_spelling(self):
        cases = [('amiidb_amiibo.csv', [A.upper(), 'Alias', ''], 'duplicate'),
                 ('amiidb_game.csv', ['01', '0', 'Alias', '', '0'], 'Duplicate game'),
                 ('amiidb_link.csv', ['03', A.upper(), 'Conflicting note', '', ''], 'duplicate game/Amiibo')]
        for name, row, message in cases:
            with self.subTest(file=name):
                self.rows[name].append(row)
                self.write_rows()
                with self.assertRaisesRegex(ValueError, message):
                    generator.read_catalog(self.data)
                self.rows[name].pop()
        self.write_rows()

    def test_bad_references_reserved_ids_and_unrepresentable_fields_are_rejected(self):
        cases = [('amiidb_amiibo.csv', 0, 0, '0' * 16, 'reserved zero'),
                 ('amiidb_amiibo.csv', 0, 0, 'xyz', 'hexadecimal'),
                 ('amiidb_game.csv', 0, 0, '256', 'Game ID'),
                 ('amiidb_game.csv', 0, 1, '4', 'Missing parent'),
                 ('amiidb_game.csv', 0, 1, '3', 'Cyclic'),
                 ('amiidb_game.csv', 0, 4, '256', 'Game order'),
                 ('amiidb_game.csv', 0, 4, '-1', 'Game order'),
                 ('amiidb_game.csv', 0, 4, '\u0661', 'ASCII integer'),
                 ('amiidb_link.csv', 0, 0, '0', 'Linked game ID'),
                 ('amiidb_link.csv', 0, 0, '4', 'absent'),
                 ('amiidb_link.csv', 0, 1, '123456789abcdef0', 'absent'),
                 ('amiidb_link.csv', 0, 1, '123', 'hexadecimal')]
        for name, row, column, value, message in cases:
            with self.subTest(file=name, value=value):
                original = self.rows[name][row][column]
                self.rows[name][row][column] = value
                self.write_rows()
                with self.assertRaisesRegex(ValueError, message):
                    generator.read_catalog(self.data)
                self.rows[name][row][column] = original
        self.write_rows()

    def test_empty_names_and_nul_text_fail_but_empty_optional_fields_remain_valid(self):
        cases = [('amiidb_amiibo.csv', 1, ''), ('amiidb_game.csv', 2, ' \t'),
                 ('amiidb_amiibo.csv', 2, 'before\0after'), ('amiidb_game.csv', 3, 'before\0after'),
                 *[('amiidb_link.csv', column, 'before\0after') for column in (2, 3, 4)]]
        for name, column, value in cases:
            with self.subTest(file=name, column=column):
                original = self.rows[name][0][column]
                self.rows[name][0][column] = value
                self.write_rows()
                with self.assertRaisesRegex(ValueError, 'UTF-8 text without NUL'):
                    generator.read_catalog(self.data)
                self.rows[name][0][column] = original
        self.write_rows()
        figures, games, links = generator.read_catalog(self.data)
        figures[0].name_cn = '\ud800'
        with self.assertRaisesRegex(ValueError, 'not valid UTF-8'):
            generator.validate_catalog(figures, games, links)

    def test_empty_tables_missing_other_and_firmware_search_limit_fail(self):
        for name in ('amiidb_amiibo.csv', 'amiidb_game.csv'):
            with self.subTest(file=name):
                path = self.data / name
                original = path.read_bytes()
                path.write_bytes(b'')
                with self.assertRaises(ValueError):
                    generator.read_catalog(self.data)
                path.write_bytes(original)
        figures, games, links = generator.read_catalog(self.data)
        with self.assertRaisesRegex(ValueError, '255'):
            generator.validate_catalog(figures, games[:-1], links)
        with self.assertRaisesRegex(ValueError, '2048'):
            generator.validate_catalog(figures * 683, games, links)

    def test_generation_rejects_bad_local_input_before_network_or_output_changes(self):
        scripts = self.project / 'scripts'
        scripts.mkdir()
        script = scripts / 'amiibo_db_gen.py'
        script.write_bytes((FW / 'scripts/amiibo_db_gen.py').read_bytes())
        generated = self.project / 'application/src/amiidb'
        generated.mkdir(parents=True)
        for name in ('db_amiibo.c', 'db_game.c', 'db_link.c'):
            (generated / name).write_bytes(b'previous output')
        self.rows['amiidb_link.csv'][0].append('must not be ignored')
        self.write_rows()
        before = {p.relative_to(self.project): p.read_bytes() for p in self.project.rglob('*') if p.is_file()}
        for mode in ('--offline', '--refresh'):
            with self.subTest(mode=mode), patch('urllib.request.urlopen') as request, \
                    patch.object(sys, 'argv', [str(script), mode]):
                with self.assertRaisesRegex(ValueError, 'expected exactly'):
                    runpy.run_path(str(script), run_name='__main__')
                request.assert_not_called()
                self.assertEqual(before, {p.relative_to(self.project): p.read_bytes() for p in self.project.rglob('*') if p.is_file()})

    def test_current_catalog_and_read_only_cli(self):
        summary = generator.validate_catalog(*generator.read_catalog())
        self.assertEqual(summary, {'figures': 952, 'games': 82, 'links': 1344,
                                  'legacyEmptyLinkColumns': 3,
                                  'uncategorizedFigures': 0, 'englishNoteLinks': 63, 'uniqueEnglishNotes': 54})
        cli = FW / 'scripts/amiibo_db_validate.py'
        result = subprocess.run([sys.executable, '-B', str(cli), '--data-dir', str(self.data)],
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('"valid": true', result.stdout)
        self.rows['amiidb_link.csv'][0].append('must not be ignored')
        self.write_rows()
        result = subprocess.run([sys.executable, '-B', str(cli), '--data-dir', str(self.data)],
                                capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 1)
        self.assertIn('expected exactly 5 columns', result.stderr)


if __name__ == '__main__':
    unittest.main()
