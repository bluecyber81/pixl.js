"""Check public web notes against every supplied CSV association and source row."""
import csv
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'fw/scripts'))
import amiibo_usage_export as exporter


class UsageExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = ROOT / 'fw/data'
        self.translations = ROOT / 'web/src/data/usage-translations.de.json'
        self.output = ROOT / 'web/src/data/figure-usage.json'

    def test_every_association_and_english_note_is_traceable_to_the_original_csv_row(self):
        data = json.loads(self.output.read_text(encoding='utf8'))
        with (self.data / 'amiidb_link.csv').open(encoding='utf8', newline='') as stream:
            rows = list(csv.reader(stream))
        notes = {note['id']: note for note in data['notes']}
        actual = {}
        for figure in data['figures']:
            for association in figure['associations']:
                note = notes.get(association['noteId'])
                line = association['sourceLine']
                self.assertNotIn(line, actual)
                actual[line] = (association['groupId'], figure['id'], note['en'] if note else '')
        self.assertEqual(actual, {i: (int(row[0]), row[1].lower(), row[2]) for i, row in enumerate(rows, 1)})
        self.assertEqual(len(actual), 1344)
        self.assertEqual(data['coverage']['englishNoteAssociations'], 63)
        self.assertEqual(data['coverage']['uniqueGermanTranslations'], 8)
        self.assertEqual(data['coverage']['germanNoteAssociations'], 13)
        self.assertFalse(data['policy']['verifiedInGame'])
        self.assertFalse(data['policy']['associationsAreCompatibilityProof'])
        self.assertFalse(data['policy']['notesAreComplete'])

    def test_export_is_reproducible_and_check_detects_stale_json_without_rewriting(self):
        rendered = exporter.render_usage(exporter.export_usage(self.data, self.translations)).encode('utf8')
        self.assertEqual(rendered, self.output.read_bytes())
        stale = self.root / 'usage.json'
        stale.write_bytes(b'previous published JSON')
        result = subprocess.run([sys.executable, '-B', str(ROOT / 'fw/scripts/amiibo_usage_export.py'),
                                 '--check', '--output', str(stale)], capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 1)
        self.assertIn('Usage JSON is stale', result.stderr)
        self.assertEqual(stale.read_bytes(), b'previous published JSON')

    def test_reference_bytes_are_preserved_and_legacy_fields_are_only_normalized_in_memory(self):
        data = json.loads(self.output.read_text(encoding='utf8'))
        for source in data['source']['files']:
            current = (ROOT / source['path']).read_bytes()
            self.assertEqual(hashlib.sha256(current).hexdigest(), source['sha256'])
            self.assertEqual(hashlib.sha256(current).hexdigest(), source['referenceSha256'])
            self.assertEqual(source['transformationsFromReference'], [])
            if source['path'].endswith('amiidb_link.csv'):
                self.assertEqual(source['readNormalization'], [{
                    'operation': 'ignore-one-extra-empty-final-column-in-memory',
                    'lines': [1332, 1333, 1334], 'sourceColumns': 6, 'logicalColumns': 5,
                    'sourceBytesUnchanged': True,
                }])
                before = list(csv.reader(io.StringIO(current.decode('utf8'), newline='')))
                links = exporter.read_catalog(self.data)[2]
                self.assertEqual(len(links), len(before))
                compatibility_lines = []
                for i, (raw, link) in enumerate(zip(before, links), 1):
                    if len(raw) == 6:
                        compatibility_lines.append(i)
                        self.assertEqual(raw[-1], '')
                    self.assertEqual(raw[:5], [link.game_id, link.amiibo_id, link.note_en, link.note_cn, link.note_it])
                self.assertEqual(compatibility_lines, [1332, 1333, 1334])
                self.assertEqual(data['coverage']['legacyEmptyLinkColumns'], 3)
            else:
                self.assertEqual(source['readNormalization'], [])
            self.assertEqual((ROOT / source['path']).read_bytes(), current)

    def test_future_metadata_change_cannot_keep_old_source_attribution(self):
        data = self.root / 'data'
        shutil.copytree(self.data, data)
        path = data / 'amiidb_game.csv'
        path.write_bytes(path.read_bytes().replace(b'Tears of the Kingdom', b'A changed catalogue title'))
        with self.assertRaisesRegex(ValueError, 'update the pinned provenance'):
            exporter.export_usage(data, self.translations)

    def test_translation_requires_exact_existing_source_and_nonempty_safe_text(self):
        good = json.loads(self.translations.read_text(encoding='utf8'))
        path = self.root / 'translations.json'
        for key, value, message in [('Invented game benefit', 'Erfundener Nutzen', 'no exact English source'),
                                    ('Paraglider Skin Material', '', 'non-empty'),
                                    ('Paraglider Skin Material', 'hidden\0suffix', 'without NUL')]:
            with self.subTest(key=key, value=value):
                candidate = {**good, 'texts': {**good['texts'], key: value}}
                path.write_text(json.dumps(candidate), encoding='utf8')
                with self.assertRaisesRegex(ValueError, message):
                    exporter.export_usage(self.data, path)


if __name__ == '__main__':
    unittest.main()
