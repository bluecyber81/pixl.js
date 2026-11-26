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
                if association.get('webSupplement'):
                    self.assertIn(association['groupId'], [1, 4, 5, 82, 19, 22, 23, 24, 26, 33, 44, 47, 77, 78, 79,
                                                          'web-yoshi-mysterious-book', 'web-fatal-fury-cotw',
                                                          'web-kirby-forgotten-land-switch2', 'web-hyrule-warriors-age-of-imprisonment'])
                    self.assertTrue(note['de'] and note['en'])
                    if association.get('webOnly'):
                        self.assertNotIn('sourceLine', association)
                        continue
                    self.assertIn(association['groupId'], (1, 5, 19, 77, 78, 79))
                    self.assertIsNone(association['firmwareNoteId'])
                    note = notes.get(association['firmwareNoteId'])
                elif 'sourceUrl' in association:
                    nintendo_web_rows.append(figure['id'])
                    if figure['id'] in exporter.OCARINA_PRODUCTS:
                        self.assertEqual(association['sourceUrl'], exporter.OCARINA_PRODUCTS[figure['id']])
                        self.assertEqual(association['groupId'], 82)
                        self.assertEqual(note['de'], 'Schaltet eine besondere Maske frei, die Link tragen kann.')
                    else:
                        self.assertEqual(association['groupId'], 75)
                        self.assertEqual(note['en'], 'Train the rider as a Figure Player.')
                        if figure['id'] in exporter.RIDER_IDS:
                            self.assertEqual(association['sourceUrl'], exporter.NINTENDO_KIRBY_UPDATE)
                            self.assertEqual(association['sinceGameVersion'], '1.3.3')
                        else:
                            self.assertEqual(association['sourceUrl'], exporter.NINTENDO_RIDER_GUIDE)
                line = association['sourceLine']
                self.assertNotIn(line, actual)
                actual[line] = (association['groupId'], figure['id'], note['en'] if note else '')
        self.assertEqual(actual, {i: (int(row[0]), row[1].lower(), row[2]) for i, row in enumerate(rows, 1)})
        self.assertEqual(len(actual), 1348)
        self.assertEqual(nintendo_web_rows, sorted([*exporter.OCARINA_PRODUCTS, *exporter.TRAINING_IDS]))
        self.assertEqual(data['coverage']['firmwareAssociations'], len(actual))
        self.assertEqual(data['coverage']['associations'], len(actual) + 68)
        self.assertEqual(data['coverage']['nintendoWebAssociations'], 68)
        self.assertEqual(data['coverage']['figures'], 956)
        self.assertEqual(data['coverage']['englishNoteAssociations'], 174)
        self.assertEqual(data['coverage']['uniqueGermanTranslations'], 74)
        self.assertEqual(data['coverage']['germanNoteAssociations'], 174)
        self.assertTrue(data['policy']['germanTranslationsAreComplete'])
        self.assertEqual({row['en'] for row in data['notes'][:55] if row['de']}, {row[2] for row in rows if row[2]})
        self.assertFalse(data['policy']['verifiedInGame'])
        self.assertFalse(data['policy']['associationsAreCompatibilityProof'])
        self.assertFalse(data['policy']['notesAreComplete'])

    def test_nintendo_supplement_is_hash_bound_and_has_no_firmware_group_or_source_line(self):
        data = json.loads(self.output.read_text(encoding='utf8'))
        source = data['source']['webSupplement']
        self.assertEqual(source['sha256'], hashlib.sha256((ROOT / source['path']).read_bytes()).hexdigest())
        group = next(group for group in data['groups'] if group['id'] == 'web-yoshi-mysterious-book')
        self.assertTrue(group['webOnly'])
        self.assertEqual(group['platform'], 'Switch 2')
        self.assertNotIn('sourceLine', group)
        originals = json.loads(self.translations.read_text())['texts']
        self.assertEqual({note['en']: note['de'] for note in data['notes'][:55]}, originals)

    def test_supplement_rejects_unknown_ids_firmware_group_fiction_and_unreviewed_note_replacement(self):
        supplement = json.loads((ROOT / 'web/src/data/usage-nintendo-supplement.json').read_text())
        path = self.root / 'supplement.json'
        cases = [
            ('unknown', lambda d: d['games'][0]['rows'][0]['ids'].__setitem__(0, 'ffffffffffffffff'), 'Unknown exact'),
            ('duplicate', lambda d: d['games'][0]['rows'][0]['ids'].append(d['games'][0]['rows'][0]['ids'][0]), 'Duplicate'),
            ('fake group', lambda d: d['games'][1].update(groupId=83), 'numeric firmware'),
            ('external URL', lambda d: d['games'][0].update(source='https://example.com/guide'), 'official HTTPS'),
            ('external additional source', lambda d: d['games'][0].update(additionalSources=['https://example.com/']), 'official HTTPS'),
            ('unreviewed note source', lambda d: d['games'][0]['rows'][0].update(source='https://example.com/'), 'reviewed game source'),
            ('empty note', lambda d: d['games'][0]['rows'][0].update(de=''), 'non-empty'),
            ('duplicate guide', lambda d: d['games'][1].update(id=d['games'][0]['id']), 'duplicate Nintendo game-guide'),
            ('invented guide-only match', lambda d: d['games'][3].update(includeExistingIds=['0000000000000002']), 'unique existing'),
            ('duplicate guide-only match', lambda d: d['games'][3]['includeExistingIds'].append('0100000004fd0902'), 'unique existing'),
        ]
        for name, change, error in cases:
            with self.subTest(name=name):
                candidate = json.loads(json.dumps(supplement))
                change(candidate)
                path.write_text(json.dumps(candidate))
                with self.assertRaisesRegex(ValueError, error):
                    exporter.export_usage(self.data, self.translations, path)
        candidate = json.loads(json.dumps(supplement))
        candidate['games'] = [{**candidate['games'][0], 'groupId': 75, 'groupLabel': 'Kirby Air Riders',
                               'rows': [{**candidate['games'][0]['rows'][0], 'ids': ['1f00000004c41e03']}]}]
        path.write_text(json.dumps(candidate))
        with self.assertRaisesRegex(ValueError, 'must not replace'):
            exporter.export_usage(self.data, self.translations, path)

    def test_new_game_notes_preserve_masks_and_share_identical_bilingual_wording(self):
        data = exporter.export_usage(self.data, self.translations)
        by_figure = {figure['id']: {row['groupId']: row for row in figure['associations']}
                     for figure in data['figures']}
        notes = {note['id']: note for note in data['notes']}
        for aid in exporter.OCARINA_PRODUCTS:
            row = by_figure[aid][82]
            self.assertNotIn('webSupplement', row)
            self.assertEqual(notes[row['noteId']]['en'], 'Unlocks a special mask that Link can wear.')
        for aid in exporter.RIDER_IDS:
            same_note_ids = {by_figure[aid][game]['noteId'] for game in
                             (22, 23, 24, 44, 'web-kirby-forgotten-land-switch2')}
            self.assertEqual(len(same_note_ids), 1)
            self.assertEqual(notes[same_note_ids.pop()]['translation'], 'editorial-from-primary-source')
            self.assertEqual(by_figure[aid][75]['sinceGameVersion'], '1.3.3')
        self.assertIn(33, by_figure['1f00010004c51e03'])
        self.assertNotIn(33, by_figure['1f02010004c81e03'])
        self.assertEqual(len(data['notes']), len({(n['en'], n['de']) for n in data['notes']}))

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
            rider_ids = ['1f00010004c51e03', '1f02010004c81e03']
            additions = [{'operation': 'append-rider-row', 'id': rid} for rid in rider_ids]
            if source['path'].endswith('amiidb_amiibo.csv'):
                suffix = b'1f00010004c51e03,Sword Kirby (& Dragoon),\n1f02010004c81e03,Noir Dedede (& Hydra),\n'
                suffix += b'0100000004fd0902,Young Link (Ocarina of Time),\n0101000004ff0902,Young Zelda (Ocarina of Time),\n'
                self.assertTrue(current.endswith(suffix))
                reference = current.removesuffix(suffix)
                for aid, (old, new) in exporter.RIDER_NAMES.items():
                    revised = f'{aid},{new},'.encode()
                    self.assertEqual(reference.count(revised), 1)
                    reference = reference.replace(revised, f'{aid},{old},'.encode())
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
                     'from': old, 'to': new} for aid, old, new in expected] + exporter.RIDER_NAME_CHANGES + additions + exporter.OCARINA_ADDITIONS)
            elif source['path'].endswith('amiidb_game.csv'):
                corrected = b'49,0,Yu-Gi-Oh! Rush Duel Saikyo Battle Royale,'
                self.assertEqual(current.count(corrected), 1)
                added_group = b'82,0,The Legend of Zelda: Ocarina of Time,The Legend of Zelda: Ocarina of Time,5\n'
                self.assertEqual(current.count(added_group), 1)
                reference = current.replace(added_group, b'').replace(corrected, b'49,0,Yu-Gi-Oh! Rush Duel Saikyo Battle Royale ,')
                self.assertEqual(hashlib.sha256(reference).hexdigest(), source['referenceSha256'])
                self.assertEqual(source['transformationsFromReference'], [{
                    'operation': 'trim-trailing-space', 'id': '49', 'columns': ['name_en'],
                    'from': 'Yu-Gi-Oh! Rush Duel Saikyo Battle Royale ',
                    'to': 'Yu-Gi-Oh! Rush Duel Saikyo Battle Royale'}, {'operation': 'insert-game-row', 'id': '82'}])
            else:
                suffix = ''.join(f'75,{rid},,,\n' for rid in rider_ids).encode()
                suffix += ''.join(f'82,{aid},Unlocks a special mask that Link can wear.,,\n' for aid in exporter.OCARINA_PRODUCTS).encode()
                reference = current
                for aid in exporter.TRAINING_IDS:
                    revised = f'75,{aid},Train the rider as a Figure Player.,,\n'.encode()
                    self.assertEqual(reference.count(revised), 1)
                    reference = reference.replace(revised, f'75,{aid},,,\n'.encode())
                self.assertTrue(reference.endswith(suffix))
                self.assertEqual(hashlib.sha256(reference.removesuffix(suffix)).hexdigest(), source['referenceSha256'])
                self.assertEqual(source['transformationsFromReference'], additions + exporter.RIDER_TRAINING + exporter.OCARINA_ADDITIONS)
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
