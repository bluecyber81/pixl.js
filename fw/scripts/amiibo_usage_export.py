#!/usr/bin/env python3
"""Export public CSV associations/notes for the web; never expand firmware data."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

from amiibo_db_gen import read_catalog, text_field

ROOT = Path(__file__).resolve().parents[2]
# Stable supplied source, rather than a moving branch or a claim of game verification.
SOURCE_COMMIT = '6e0004969cd1481a027c2eaa86838a4c3fa1553d'
SOURCE_BASE = 'https://github.com/bluecyber81/pixl.js/blob/' + SOURCE_COMMIT + '/fw/data/'
SOURCE_SHA256 = {
    'amiidb_amiibo.csv': '82b23957ac5c431175d9a8522a7c5552e2a46c9f640b4622c362368089f2cd01',
    'amiidb_game.csv': '659d2b0703b0e059f9489dfaeab4341f3cc58d5eba19756664e2f39c58ceff47',
    'amiidb_link.csv': '13491f3b5aad3f22e52c72014f0fe273760af8f54cd6388f34f3d0d67fbad2b9',
}
SOURCE_REFERENCE_SHA256 = {
    **SOURCE_SHA256,
    'amiidb_link.csv': '13491f3b5aad3f22e52c72014f0fe273760af8f54cd6388f34f3d0d67fbad2b9',
}
LINK_HYGIENE_LINES = (1332, 1333, 1334)


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
    source_files = []
    for filename in ('amiidb_amiibo.csv', 'amiidb_game.csv', 'amiidb_link.csv'):
        normalization = []
        if filename == 'amiidb_link.csv':
            normalization.append({'operation': 'ignore-one-extra-empty-final-column-in-memory',
                                  'lines': list(LINK_HYGIENE_LINES),
                                  'sourceColumns': 6, 'logicalColumns': 5,
                                  'sourceBytesUnchanged': True})
        source_files.append({'path': 'fw/data/' + filename,
                             'sha256': hashlib.sha256((data_dir / filename).read_bytes()).hexdigest(),
                             'referenceSha256': SOURCE_REFERENCE_SHA256[filename],
                             'referenceUrl': SOURCE_BASE + filename,
                             'transformationsFromReference': [],
                             'readNormalization': normalization})
    return {
        'schemaVersion': 1,
        'dataVersion': '2026-11-06.1',
        'source': {'label': 'Bundled firmware catalogue', 'referenceCommit': SOURCE_COMMIT,
                   'files': source_files,
                   'hashPolicy': 'sha256 identifies the local export input; referenceSha256 identifies the exact bytes at referenceUrl. Per-file transformations explain any difference.'},
        'policy': {'verifiedInGame': False, 'associationsAreCompatibilityProof': False,
                   'notesAreComplete': False, 'germanTranslationsAreComplete': False,
                   'translationPolicy': translations['translationPolicy']},
        'coverage': {'figures': len(figures), 'groups': len(games), 'associations': len(links),
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=ROOT / 'fw/data')
    parser.add_argument('--translations', type=Path, default=ROOT / 'web/src/data/usage-translations.de.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'web/src/data/figure-usage.json')
    parser.add_argument('--check', action='store_true', help='Compare the existing JSON without modifying it.')
    args = parser.parse_args()
    try:
        data = export_usage(args.data_dir, args.translations)
        rendered = render_usage(data).encode('utf8')
        if args.check:
            if args.output.read_bytes() != rendered:
                raise ValueError('Usage JSON is stale; regenerate it with amiibo_usage_export.py')
        else:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_bytes(rendered)
    except (OSError, ValueError) as error:
        parser.exit(1, 'Usage export failed: %s\n' % error)
    print(json.dumps({'valid': True, 'bytes': len(rendered), **data['coverage']}, sort_keys=True))


if __name__ == '__main__':
    main()
