#!/usr/bin/env python3
"""Export public CSV associations/notes for the web; never expand firmware data."""
import argparse
import csv
import hashlib
import json
import re
from datetime import date
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urlsplit

from amiibo_db_gen import read_catalog, text_field

ROOT = Path(__file__).resolve().parents[2]
# Stable supplied source, rather than a moving branch or a claim of game verification.
SOURCE_COMMIT = '6e0004969cd1481a027c2eaa86838a4c3fa1553d'
# The four corrected game notes have their own immutable CSV source.
LINK_SOURCE_COMMIT = '494514c958ad5e0544467bfed59d3047a7468c40'
SOURCE_BASE = 'https://github.com/bluecyber81/pixl.js/blob/'
SOURCE_SHA256 = {
    'amiidb_amiibo.csv': '1ba54e01b9c629d736ca5e1a86a58c44d8909253d943f63d56e339ed9ddf0a0b',
    'amiidb_game.csv': '0b41f8c0fd8ee440a3fed2d4eb2d6c434d989a4b49f2b1be8a301f19d2981182',
    'amiidb_link.csv': '94c87b9123b14a51ef22ab37a692d77addb9e6da7a93c9adf3bfb225192bc8fc',
}
SOURCE_REFERENCE_SHA256 = {
    **SOURCE_SHA256,
    'amiidb_link.csv': '2bf41e4adec9640aae1e5afc803daf8d14260f07b4116ea3386c76a40e950c38',
    'amiidb_game.csv': '659d2b0703b0e059f9489dfaeab4341f3cc58d5eba19756664e2f39c58ceff47',
    'amiidb_amiibo.csv': '82b23957ac5c431175d9a8522a7c5552e2a46c9f640b4622c362368089f2cd01',
}
NAME_CORRECTIONS = [{'operation': 'correct-display-name', 'id': '018b000002460502', 'columns': ['name_en', 'name_cn'], 'from': 'Cyrrus', 'to': 'Cyrus'}, {'operation': 'correct-display-name', 'id': '04d0000101960502', 'columns': ['name_en', 'name_cn'], 'from': '[AC] 339 - Fritta', 'to': '[AC] 339 - Frita'}, {'operation': 'correct-display-name', 'id': '033f0001008f0502', 'columns': ['name_en', 'name_cn'], 'from': '[AC] 076 - Jeramiah', 'to': '[AC] 076 - Jeremiah'}, {'operation': 'trim-trailing-space', 'id': '0a02000103b30502', 'columns': ['name_en', 'name_cn'], 'from': '412 - C.J. ', 'to': '412 - C.J.'}, {'operation': 'trim-trailing-space', 'id': '0a0c000103c30502', 'columns': ['name_en', 'name_cn'], 'from': '428 - Audie ', 'to': '428 - Audie'}, {'operation': 'trim-trailing-space', 'id': '0a0e000103c50502', 'columns': ['name_en', 'name_cn'], 'from': '430 - Judy ', 'to': '430 - Judy'}]
GROUP_CORRECTIONS = [{'operation': 'trim-trailing-space', 'id': '49', 'columns': ['name_en'], 'from': 'Yu-Gi-Oh! Rush Duel Saikyo Battle Royale ', 'to': 'Yu-Gi-Oh! Rush Duel Saikyo Battle Royale'}]
LINK_HYGIENE_LINES = (1332, 1333, 1334)
# Nintendo documents support for these exact riders since Kirby Air Riders 1.3.3.
# DE3.75 includes their game rows; retain the official guide alongside their source lines.
NINTENDO_KIRBY_UPDATE = 'https://www.nintendo.com/de-de/Support/Kaufe-und-Mitgliedschaften/Spiele/Das-Aktualisieren-von-Kirby-Air-Riders--2967700.html'
RIDER_IDS = ('1f00010004c51e03', '1f02010004c81e03')
RIDER_ADDITIONS = [{'operation': 'append-rider-row', 'id': rider} for rider in RIDER_IDS]
RIDER_NAMES = {
    '1f00000004c41e03': ('Kirby', 'Kirby (& Warp Star)'),
    '1f03010004c91e03': ('Bandana Waddle Dee', 'Bandana Waddle Dee (& Winged Star)'),
    '1f01000004c61e03': ('Meta Knight', 'Meta Knight (& Shadow Star)'),
}
RIDER_NAME_CHANGES = [{'operation': 'complete-rider-machine-name', 'id': aid, 'from': old, 'to': new}
                      for aid, (old, new) in RIDER_NAMES.items()]
TRAINING_IDS = (*RIDER_NAMES, '1f02000004c71e03', '1f04000004ca1e03', *RIDER_IDS)
NINTENDO_RIDER_GUIDE = 'https://www.nintendo.com/us/gaming-systems/switch-2/featured-games/kirby-air-riders/connect/'
RIDER_TRAINING = [{'operation': 'add-training-note', 'id': aid, 'groupId': 75} for aid in TRAINING_IDS]
OCARINA_PRODUCTS = {
    '0100000004fd0902': 'https://www.nintendo.com/us/amiibo/detail/young-link-the-legend-of-zelda-ocarina-of-time-series/',
    '0101000004ff0902': 'https://www.nintendo.com/us/amiibo/detail/young-zelda-the-legend-of-zelda-ocarina-of-time-series/',
}
OCARINA_ADDITIONS = [{'operation': 'append-figure-row', 'id': identifier} for identifier in OCARINA_PRODUCTS]
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


def apply_web_supplement(data, supplement_path):
    """Add reviewed web notes without inventing firmware groups or CSV rows."""
    supplement = json.loads(supplement_path.read_text(encoding='utf8'))
    if supplement.get('schemaVersion') != 1 or not isinstance(supplement.get('games'), list):
        raise ValueError('Unsupported Nintendo web-supplement schema')
    date.fromisoformat(supplement['checkedDate'])
    figures = {figure['id']: figure for figure in data['figures']}
    groups = {group['id']: group for group in data['groups']}
    targets = set()
    new_associations = new_notes = supplemented_notes = 0
    for game in supplement['games']:
        source = urlsplit(game['source'])
        if source.scheme != 'https' or not source.hostname or not source.hostname.endswith('.nintendo.com') or source.username or source.password:
            raise ValueError('Nintendo supplement must link to an official HTTPS source')
        text_field(game['platform'], 'Nintendo game platform', required=True)
        text_field(game['groupLabel'], 'Nintendo game label', required=True)
        group_id = game['groupId']
        if group_id not in groups:
            if not isinstance(group_id, str) or not re.fullmatch(r'web-[a-z0-9-]+', group_id):
                raise ValueError('A web-only game must not invent a numeric firmware group')
            group = {'id': group_id, 'parentId': None, 'labelPath': [game['groupLabel']],
                     'platform': game['platform'], 'sourceUrl': game['source'], 'webOnly': True}
            data['groups'].append(group)
            groups[group_id] = group
        elif groups[group_id]['labelPath'][-1] != game['groupLabel']:
            raise ValueError('Nintendo supplement game label does not match its group')
        for note in game['rows']:
            for language in ('en', 'de'):
                text_field(note[language], 'Nintendo note ' + language, required=True)
            note_id = len(data['notes']) + 1
            if not note['ids']:
                raise ValueError('Nintendo note has no reviewed figure IDs')
            for identifier in note['ids']:
                if not isinstance(identifier, str) or not re.fullmatch(r'[0-9a-f]{16}', identifier) or identifier not in figures:
                    raise ValueError('Unknown exact figure ID in Nintendo supplement')
                target = (identifier, group_id)
                if target in targets:
                    raise ValueError('Duplicate Nintendo figure/game association')
                targets.add(target)
                rows = figures[identifier]['associations']
                existing = next((row for row in rows if row['groupId'] == group_id), None)
                if existing is not None:
                    if existing['noteId'] is not None:
                        raise ValueError('Nintendo supplement must not replace an existing usage note')
                    existing['firmwareNoteId'] = existing['noteId']
                else:
                    existing = {'groupId': group_id, 'webOnly': True}
                    rows.append(existing)
                    new_associations += 1
                existing.update(noteId=note_id, sourceUrl=game['source'],
                                webSupplement=True, platform=game['platform'])
                supplemented_notes += 1
            data['notes'].append({'id': note_id, 'en': note['en'], 'de': note['de'],
                                  'translation': 'editorial-from-english'})
            new_notes += 1
    data['source']['webSupplement'] = {
        'path': 'web/src/data/usage-nintendo-supplement.json',
        'sha256': hashlib.sha256(supplement_path.read_bytes()).hexdigest(),
        'checkedDate': supplement['checkedDate'],
        'policy': supplement['policy'],
    }
    data['source']['firmwareDataVersion'] = data['dataVersion']
    data['dataVersion'] = supplement['checkedDate'] + '.nintendo-web'
    coverage = data['coverage']
    coverage.update(groups=len(data['groups']), associations=coverage['associations'] + new_associations,
                    nintendoWebAssociations=new_associations, nintendoWebNoteAdditions=supplemented_notes,
                    englishNoteAssociations=coverage['englishNoteAssociations'] + supplemented_notes,
                    germanNoteAssociations=coverage['germanNoteAssociations'] + supplemented_notes,
                    uniqueEnglishNotes=coverage['uniqueEnglishNotes'] + new_notes,
                    uniqueGermanTranslations=coverage['uniqueGermanTranslations'] + new_notes)
    data['policy']['germanTranslationScope'] += ' and the reviewed Nintendo web supplement'
    return data


def export_usage(data_dir, translations_path, supplement_path=None):
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
        row = {'groupId': int(link.game_id), 'noteId': note_ids.get(link.note_en), 'sourceLine': line}
        if link.amiibo_id.lower() in TRAINING_IDS and row['groupId'] == 75:
            row['sourceUrl'] = NINTENDO_RIDER_GUIDE
            if link.amiibo_id.lower() in RIDER_IDS:
                row['sourceUrl'] = NINTENDO_KIRBY_UPDATE
                row['sinceGameVersion'] = '1.3.3'
        if link.amiibo_id.lower() in OCARINA_PRODUCTS and row['groupId'] == 82:
            row['sourceUrl'] = OCARINA_PRODUCTS[link.amiibo_id.lower()]
        associations[link.amiibo_id.lower()].append(row)
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
                             'transformationsFromReference': {
                                 'amiidb_amiibo.csv': NAME_CORRECTIONS + RIDER_NAME_CHANGES + RIDER_ADDITIONS + OCARINA_ADDITIONS,
                                 'amiidb_game.csv': GROUP_CORRECTIONS + [{'operation': 'insert-game-row', 'id': '82'}],
                                 'amiidb_link.csv': RIDER_ADDITIONS + RIDER_TRAINING + OCARINA_ADDITIONS,
                             }[filename],
                             'readNormalization': normalization})
    data = {
        'schemaVersion': 1,
        'dataVersion': '2026-11-16.de376',
        'source': {'label': 'Bundled firmware catalogue', 'referenceCommit': SOURCE_COMMIT,
                   'files': source_files,
                   'hashPolicy': 'sha256 identifies the local export input; referenceSha256 identifies the exact bytes at referenceUrl. Per-file transformations explain any difference.'},
        'policy': {'verifiedInGame': False, 'associationsAreCompatibilityProof': False,
                   'notesAreComplete': False, 'germanTranslationsAreComplete': bool(english) and set(texts) == english,
                   'germanTranslationScope': 'existing English usage notes in this catalogue snapshot',
                   'translationPolicy': translations['translationPolicy']},
        'coverage': {'figures': len(associations), 'groups': len(games), 'associations': len(links),
                     'firmwareAssociations': len(links), 'nintendoWebAssociations': 0,
                     'legacyEmptyLinkColumns': sum(link.legacy_empty_column for link in links),
                     'englishNoteAssociations': sum(bool(link.note_en) for link in links),
                     'uniqueEnglishNotes': len(notes), 'uniqueGermanTranslations': len(texts),
                     'germanNoteAssociations': sum(link.note_en in texts for link in links)},
        'groups': [{'id': int(game.id), 'parentId': int(game.parent_id), 'labelPath': label_path(game),
                    'sourceLine': line} for line, game in zip(source_lines(data_dir / 'amiidb_game.csv'), games)],
        'notes': notes,
        'figures': [{'id': identifier, 'associations': rows} for identifier, rows in sorted(associations.items())],
    }
    return apply_web_supplement(data, supplement_path or ROOT / 'web/src/data/usage-nintendo-supplement.json')


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
    parser.add_argument('--supplement', type=Path, default=ROOT / 'web/src/data/usage-nintendo-supplement.json')
    parser.add_argument('--check', action='store_true', help='Compare the existing JSON without modifying it.')
    parser.add_argument('--reference', type=Path,
                        help='Protect published associations and wording from this earlier export as well.')
    args = parser.parse_args()
    try:
        data = export_usage(args.data_dir, args.translations, args.supplement)
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
