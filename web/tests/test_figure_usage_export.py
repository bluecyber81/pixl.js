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

    def test_device_translations_are_an_exact_subset_of_the_full_web_catalogue(self):
        firmware = json.loads((self.data / 'usage-translations.de.json').read_text(encoding='utf8'))
        web = json.loads(self.translations.read_text(encoding='utf8'))
        self.assertTrue(firmware['texts'])
        for source, translation in firmware['texts'].items():
            self.assertEqual(web['texts'][source], translation)

    def test_every_association_and_english_note_is_traceable_to_the_original_csv_row(self):
        data = json.loads(self.output.read_text(encoding='utf8'))
        with (self.data / 'amiidb_link.csv').open(encoding='utf8', newline='') as stream:
            rows = list(csv.reader(stream))
        notes = {note['id']: note for note in data['notes']}
        actual = {}
        nintendo_web_rows = []
        for figure in data['figures']:
            for association in figure['associations']:
                note = notes.get(association['noteId'])
                if 'sourceUrl' in association:
                    nintendo_web_rows.append(figure['id'])
                    self.assertEqual(association, {'groupId': 75, 'noteId': None, 'sourceUrl': exporter.NINTENDO_KIRBY_UPDATE})
                    continue
                line = association['sourceLine']
                self.assertNotIn(line, actual)
                actual[line] = (association['groupId'], figure['id'], note['en'] if note else '')
        self.assertEqual(actual, {i: (int(row[0]), row[1].lower(), row[2]) for i, row in enumerate(rows, 1)})
        self.assertEqual(len(actual), 1344)
        self.assertEqual(nintendo_web_rows, ['1f00010004c51e03', '1f02010004c81e03'])
        self.assertEqual(data['coverage']['associations'], len(actual) + len(nintendo_web_rows))
        self.assertEqual(data['coverage']['figures'], 954)
        self.assertEqual(data['coverage']['englishNoteAssociations'], 63)
        self.assertEqual(data['coverage']['uniqueGermanTranslations'], 53)
        self.assertEqual(data['coverage']['germanNoteAssociations'], 63)
        self.assertTrue(data['policy']['germanTranslationsAreComplete'])
        self.assertEqual({row['en'] for row in data['notes'] if row['de']}, {row[2] for row in rows if row[2]})
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
            if source['path'].endswith('amiidb_amiibo.csv'):
                # Independently reconstruct the pinned reference bytes. The six
                # reviewed name/whitespace corrections may change no IDs, rows or other fields.
                reference = current
                expected = [
                    ('018b000002460502', 'Cyrrus', 'Cyrus'),
                    ('04d0000101960502', '[AC] 339 - Fritta', '[AC] 339 - Frita'),
                    ('033f0001008f0502', '[AC] 076 - Jeramiah', '[AC] 076 - Jeremiah'),
                    ('0a02000103b30502', '412 - C.J. ', '412 - C.J.'),
                    ('0a0c000103c30502', '428 - Audie ', '428 - Audie'),
                    ('0a0e000103c50502', '430 - Judy ', '430 - Judy'),
                ]
                for aid, old, new in expected:
                    corrected = f'{aid},{new},{new}'.encode()
                    self.assertEqual(reference.count(corrected), 1)
                    reference = reference.replace(corrected, f'{aid},{old},{old}'.encode())
                self.assertEqual(hashlib.sha256(reference).hexdigest(), source['referenceSha256'])
                self.assertEqual(source['transformationsFromReference'], [
                    {'operation': 'trim-trailing-space' if old != old.rstrip() else 'correct-display-name',
                     'id': aid, 'columns': ['name_en', 'name_cn'],
                     'from': old, 'to': new} for aid, old, new in expected])
            elif source['path'].endswith('amiidb_game.csv'):
                corrected = b'49,0,Yu-Gi-Oh! Rush Duel Saikyo Battle Royale,'
                self.assertEqual(current.count(corrected), 1)
                reference = current.replace(corrected, b'49,0,Yu-Gi-Oh! Rush Duel Saikyo Battle Royale ,')
                self.assertEqual(hashlib.sha256(reference).hexdigest(), source['referenceSha256'])
                self.assertEqual(source['transformationsFromReference'], [{
                    'operation': 'trim-trailing-space', 'id': '49', 'columns': ['name_en'],
                    'from': 'Yu-Gi-Oh! Rush Duel Saikyo Battle Royale ',
                    'to': 'Yu-Gi-Oh! Rush Duel Saikyo Battle Royale'}])
            else:
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

    def test_export_preserves_existing_associations_and_each_language_independent_of_numeric_note_ids(self):
        bundled = json.loads(self.output.read_text(encoding='utf8'))
        candidate = json.loads(json.dumps(bundled))
        row = next(row for figure in candidate['figures'] for row in figure['associations'] if row['noteId'])
        note = next(note for note in candidate['notes'] if note['id'] == row['noteId'])
        candidate['notes'].append({**note, 'id': 10000})
        row['noteId'] = 10000
        exporter.protect_existing_usage(bundled, candidate)
        for lang in ['de', 'en']:
            changed = candidate['notes'][-1]
            text = changed[lang]
            changed[lang] = ' '
            with self.assertRaisesRegex(ValueError, 'Existing %s game note' % lang):
                exporter.protect_existing_usage(bundled, candidate)
            changed[lang] = text
        group = next(figure['associations'] for figure in candidate['figures'] if row in figure['associations'])
        group.remove(row)
        with self.assertRaisesRegex(ValueError, 'association would be removed'):
            exporter.protect_existing_usage(bundled, candidate)

    def test_failed_cli_export_preserves_previous_bytes(self):
        output = self.root / 'existing.json'
        data = json.loads(self.output.read_text(encoding='utf8'))
        data['figures'][0]['associations'].append({'groupId': 100000, 'noteId': None})
        saved = json.dumps(data).encode('utf8')
        output.write_bytes(saved)
        run = subprocess.run([sys.executable, str(ROOT / 'fw/scripts/amiibo_usage_export.py'), '--output', str(output)],
                             capture_output=True, text=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn('association would be removed', run.stderr)
        self.assertEqual(output.read_bytes(), saved)

    def test_exact_editorial_approval_is_scoped_to_one_binding_language_and_wording(self):
        old = {'schemaVersion': 1, 'notes': [{'id': 1, 'en': 'Gain a heart', 'de': 'Ein Herz'}],
               'figures': [{'id': figure, 'associations': [{'groupId': 75, 'noteId': 1}]} for figure in ['a', 'b']]}
        changed = json.loads(json.dumps(old))
        changed['notes'][0]['en'] = 'Gain one heart'
        edit = ('a', 75, 'en', 'Gain a heart', 'Gain one heart')
        with self.assertRaisesRegex(ValueError, 'would be replaced: b'):
            exporter.protect_existing_usage(old, changed, {edit})
        reviewed = {edit, ('b', *edit[1:])}
        exporter.protect_existing_usage(old, changed, reviewed)
        changed['notes'][0]['en'] = ''
        with self.assertRaisesRegex(ValueError, 'would be removed'):
            exporter.protect_existing_usage(old, changed, reviewed)
        changed['notes'][0]['en'] = 'Placeholder'
        with self.assertRaisesRegex(ValueError, 'would be replaced'):
            exporter.protect_existing_usage(old, changed, reviewed)

    def test_ci_check_compares_to_independent_published_reference(self):
        reference = self.root / 'reference.json'
        data = json.loads(self.output.read_text(encoding='utf8'))
        data['notes'][0]['de'] = 'Frühere Beschreibung'
        reference.write_text(json.dumps(data), encoding='utf8')
        run = subprocess.run([sys.executable, str(ROOT / 'fw/scripts/amiibo_usage_export.py'), '--check',
                              '--reference', str(reference)], capture_output=True, text=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn('Existing de game note would be replaced', run.stderr)

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
