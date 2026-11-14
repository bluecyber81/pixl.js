#!/usr/bin/env python3
"""Export public CSV associations/notes for the web; never expand firmware data."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
from tempfile import NamedTemporaryFile

from amiibo_db_gen import read_catalog, text_field

ROOT = Path(__file__).resolve().parents[2]
# Stable supplied source, rather than a moving branch or a claim of game verification.
SOURCE_COMMIT = '6e0004969cd1481a027c2eaa86838a4c3fa1553d'
# The four corrected game notes have their own immutable CSV source.
LINK_SOURCE_COMMIT = '494514c958ad5e0544467bfed59d3047a7468c40'
SOURCE_BASE = 'https://github.com/bluecyber81/pixl.js/blob/'
SOURCE_SHA256 = {
    'amiidb_amiibo.csv': '53d18d764266b9c7f7e10251c047cac34dd1b87db0dcb19cf75d346770282c0e',
    'amiidb_game.csv': 'd240bada99ca8e4e9e74e3a24afd94536007f38b61aafb4f8582eb3359b6a042',
    'amiidb_link.csv': '2bf41e4adec9640aae1e5afc803daf8d14260f07b4116ea3386c76a40e950c38',
}
SOURCE_REFERENCE_SHA256 = {
    **SOURCE_SHA256,
    'amiidb_game.csv': '659d2b0703b0e059f9489dfaeab4341f3cc58d5eba19756664e2f39c58ceff47',
    'amiidb_amiibo.csv': '82b23957ac5c431175d9a8522a7c5552e2a46c9f640b4622c362368089f2cd01',
}
NAME_CORRECTIONS = [{'operation': 'correct-display-name', 'id': '018b000002460502', 'columns': ['name_en', 'name_cn'], 'from': 'Cyrrus', 'to': 'Cyrus'}, {'operation': 'correct-display-name', 'id': '04d0000101960502', 'columns': ['name_en', 'name_cn'], 'from': '[AC] 339 - Fritta', 'to': '[AC] 339 - Frita'}, {'operation': 'correct-display-name', 'id': '033f0001008f0502', 'columns': ['name_en', 'name_cn'], 'from': '[AC] 076 - Jeramiah', 'to': '[AC] 076 - Jeremiah'}, {'operation': 'trim-trailing-space', 'id': '0a02000103b30502', 'columns': ['name_en', 'name_cn'], 'from': '412 - C.J. ', 'to': '412 - C.J.'}, {'operation': 'trim-trailing-space', 'id': '0a0c000103c30502', 'columns': ['name_en', 'name_cn'], 'from': '428 - Audie ', 'to': '428 - Audie'}, {'operation': 'trim-trailing-space', 'id': '0a0e000103c50502', 'columns': ['name_en', 'name_cn'], 'from': '430 - Judy ', 'to': '430 - Judy'}]
GROUP_CORRECTIONS = [{'operation': 'trim-trailing-space', 'id': '49', 'columns': ['name_en'], 'from': 'Yu-Gi-Oh! Rush Duel Saikyo Battle Royale ', 'to': 'Yu-Gi-Oh! Rush Duel Saikyo Battle Royale'}]
LINK_HYGIENE_LINES = (1332, 1333, 1334)
# Nintendo documents support for these exact riders since Kirby Air Riders 1.3.3.
# Keep these web associations separate from the versioned firmware CSV rows.
NINTENDO_KIRBY_UPDATE = 'https://www.nintendo.com/de-de/Support/Kaufe-und-Mitgliedschaften/Spiele/Das-Aktualisieren-von-Kirby-Air-Riders--2967700.html'
WEB_RIDER_IDS = ('1f00010004c51e03', '1f02010004c81e03')
# A reviewed wording change must name the exact figure, game, language and
# before/after texts in the same change. Removing a note is never authorized here.
REVIEWED_NOTE_EDITS = frozenset()


def source_lines(path):
    with path.open('r', encoding='utf8', newline='') as stream:
        reader = csv.reader(stream, strict=True)
        starts = []
        previous_end = 0
        for _ in reader:
            starts.append(previous_end + 1)
            previous_end = reader.line_num
        return starts


def export_usage(data_dir, translations_path):
    figures, games, links = read_catalog(data_dir)
    for filename, expected in SOURCE_SHA256.items():
        if hashlib.sha256((data_dir / filename).read_bytes()).hexdigest() != expected:
            raise ValueError('Source snapshot changed: update the pinned provenance before exporting ' + filename)
    translations = json.loads(translations_path.read_text(encoding='utf8'))
    if translations.get('schemaVersion') != 1 or not isinstance(translations.get('texts'), dict):
        raise ValueError('Unsupported usage-translation schema')
    texts = translations['texts']
    english = {link.note_en for link in links if link.note_en}
    if not set(texts) <= english:
        raise ValueError('Translation has no exact English source in the supplied catalogue')
    for source, translated in texts.items():
        text_field(source, 'Translation English source', required=True)
        text_field(translated, 'German translation', required=True)
    game_lookup = {int(game.id): game for game in games}

    def label_path(game):
        names = [game.name_en]
        while int(game.parent_id):
            game = game_lookup[int(game.parent_id)]
            names.insert(0, game.name_en)
        return names

    notes, note_ids = [], {}
    for link in links:
        if link.note_en and link.note_en not in note_ids:
            identifier = len(notes) + 1
            note_ids[link.note_en] = identifier
            notes.append({'id': identifier, 'en': link.note_en, 'de': texts.get(link.note_en),
                          'translation': 'editorial-from-english' if link.note_en in texts else None})
    associations = {figure.id.lower(): [] for figure in figures}
    for line, link in zip(source_lines(data_dir / 'amiidb_link.csv'), links):
        associations[link.amiibo_id.lower()].append({
            'groupId': int(link.game_id), 'noteId': note_ids.get(link.note_en), 'sourceLine': line,
        })
    web_associations = 0
    for rider in WEB_RIDER_IDS:
        rows = associations.setdefault(rider, [])
        if not any(row['groupId'] == 75 for row in rows):
            rows.append({'groupId': 75, 'noteId': None, 'sourceUrl': NINTENDO_KIRBY_UPDATE})
            web_associations += 1
    source_files = []
    for filename in ('amiidb_amiibo.csv', 'amiidb_game.csv', 'amiidb_link.csv'):
        normalization = []
        if filename == 'amiidb_link.csv':
            normalization.append({'operation': 'ignore-one-extra-empty-final-column-in-memory',
                                  'lines': list(LINK_HYGIENE_LINES),
                                  'sourceColumns': 6, 'logicalColumns': 5,
                                  'sourceBytesUnchanged': True})
        reference_commit = LINK_SOURCE_COMMIT if filename == 'amiidb_link.csv' else SOURCE_COMMIT
        source_files.append({'path': 'fw/data/' + filename,
                             'sha256': hashlib.sha256((data_dir / filename).read_bytes()).hexdigest(),
                             'referenceSha256': SOURCE_REFERENCE_SHA256[filename],
                             'referenceUrl': SOURCE_BASE + reference_commit + '/fw/data/' + filename,
                             'transformationsFromReference': NAME_CORRECTIONS if filename == 'amiidb_amiibo.csv' else GROUP_CORRECTIONS if filename == 'amiidb_game.csv' else [],
                             'readNormalization': normalization})
    return {
        'schemaVersion': 1,
        'dataVersion': '2026-11-13.kirby',
        'source': {'label': 'Bundled firmware catalogue', 'referenceCommit': SOURCE_COMMIT,
                   'files': source_files,
                   'hashPolicy': 'sha256 identifies the local export input; referenceSha256 identifies the exact bytes at referenceUrl. Per-file transformations explain any difference.'},
        'policy': {'verifiedInGame': False, 'associationsAreCompatibilityProof': False,
                   'notesAreComplete': False, 'germanTranslationsAreComplete': bool(english) and set(texts) == english,
                   'germanTranslationScope': 'existing English usage notes in this catalogue snapshot',
                   'translationPolicy': translations['translationPolicy']},
        'coverage': {'figures': len(associations), 'groups': len(games), 'associations': len(links) + web_associations,
                     'firmwareAssociations': len(links), 'nintendoWebAssociations': web_associations,
                     'legacyEmptyLinkColumns': sum(link.legacy_empty_column for link in links),
                     'englishNoteAssociations': sum(bool(link.note_en) for link in links),
                     'uniqueEnglishNotes': len(notes), 'uniqueGermanTranslations': len(texts),
                     'germanNoteAssociations': sum(link.note_en in texts for link in links)},
        'groups': [{'id': int(game.id), 'parentId': int(game.parent_id), 'labelPath': label_path(game),
                    'sourceLine': line} for line, game in zip(source_lines(data_dir / 'amiidb_game.csv'), games)],
        'notes': notes,
        'figures': [{'id': identifier, 'associations': rows} for identifier, rows in sorted(associations.items())],
    }


def render_usage(data):
    return json.dumps(data, ensure_ascii=False, indent=2) + '\n'


def association_notes(data):
    if data.get('schemaVersion') != 1:
        raise ValueError('Unsupported existing usage export; review it before replacing it')
    notes = {note['id']: note for note in data['notes']}
    result = {}
    for figure in data['figures']:
        for association in figure['associations']:
            note_id = association['noteId']
            note = {} if note_id is None else notes[note_id]
            result[(figure['id'], association['groupId'])] = (note.get('en'), note.get('de'))
    return result


def protect_existing_usage(before, after, reviewed_edits=REVIEWED_NOTE_EDITS):
    updated = association_notes(after)
    for key, languages in association_notes(before).items():
        if key not in updated:
            raise ValueError('Existing figure/game association would be removed: %s / %s' % key)
        for language, previous, candidate in zip(('en', 'de'), languages, updated[key]):
            if previous and not (candidate or '').strip():
                raise ValueError('Existing %s game note would be removed: %s / %s' % (language, *key))
            if previous and previous != candidate and (*key, language, previous, candidate) not in reviewed_edits:
                raise ValueError('Existing %s game note would be replaced: %s / %s; review the exact edit' %
                                 (language, *key))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=ROOT / 'fw/data')
    parser.add_argument('--translations', type=Path, default=ROOT / 'web/src/data/usage-translations.de.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'web/src/data/figure-usage.json')
    parser.add_argument('--check', action='store_true', help='Compare the existing JSON without modifying it.')
    parser.add_argument('--reference', type=Path,
                        help='Protect published associations and wording from this earlier export as well.')
    args = parser.parse_args()
    try:
        data = export_usage(args.data_dir, args.translations)
        rendered = render_usage(data).encode('utf8')
        if args.reference:
            protect_existing_usage(json.loads(args.reference.read_bytes()), data)
        if args.check:
            if args.output.read_bytes() != rendered:
                raise ValueError('Usage JSON is stale; regenerate it with amiibo_usage_export.py')
        else:
            if args.output.exists():
                protect_existing_usage(json.loads(args.output.read_bytes()), data)
            args.output.parent.mkdir(parents=True, exist_ok=True)
            with NamedTemporaryFile(dir=args.output.parent, delete=False) as temporary:
                tmp_path = Path(temporary.name)
            try:
                tmp_path.write_bytes(rendered)
                tmp_path.replace(args.output)
            finally:
                tmp_path.unlink(missing_ok=True)
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(1, 'Usage export failed: %s\n' % error)
    print(json.dumps({'valid': True, 'bytes': len(rendered), **data['coverage']}, sort_keys=True))


if __name__ == '__main__':
    main()
