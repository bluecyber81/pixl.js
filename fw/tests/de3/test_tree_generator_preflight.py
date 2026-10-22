"""Legacy tree tool regression using only temporary synthetic metadata/file names.

Positive ID reads are mocked; no actual amiibo dump, network or device is used.
--source can exercise the import gate against a preserved source negative control.
"""
import argparse
import contextlib
import csv
import io
import json
import os
from pathlib import Path
import re
import struct
import tempfile
from unittest.mock import patch

FW = Path(__file__).resolve().parents[2]
NAMES = ('amiidb_amiibo.csv', 'amiidb_game.csv', 'amiidb_link.csv')
FIRST, SECOND = '0000000100000002', '0000000300000004'


def write_csv(path, rows):
    with path.open('w', encoding='utf-8', newline='') as stream:
        csv.writer(stream).writerows(rows)


def fixture(folder, source):
    project = folder / 'project'
    (project / 'data').mkdir(parents=True)
    (project / 'scripts').mkdir()
    files = {name: project / 'data' / name for name in NAMES}
    write_csv(files[NAMES[0]], [[FIRST, 'Before', 'Vorher'], [SECOND, 'Keep', 'Bleibt']])
    write_csv(files[NAMES[1]], [['11', '0', 'Animal Crossing', '', '1'],
                               ['22', '11', 'Cards', '', '2'], ['99', '0', 'Other', '', '3']])
    write_csv(files[NAMES[2]], [['11', FIRST, '', '', ''], ['99', SECOND, 'keep-note', '', '']])
    namespace = {'__name__': 'tree_generator_import_check', '__file__': str(project / 'scripts' / 'amiibo_tree_gen.py')}
    # Any module-level CSV access/traversal fails before it can touch even a
    # synthetic file. The preserved generator fails this exact control.
    with patch('builtins.open', side_effect=AssertionError('import must not open data files')), \
         patch('os.walk', side_effect=AssertionError('import must not traverse data files')):
        exec(compile(source, namespace['__file__'], 'exec'), namespace)
    bins = folder / 'bins'
    target = bins / 'Animal Crossing Amiibo' / 'Cards' / 'New Name.bin'
    target.parent.mkdir(parents=True)
    target.write_text('synthetic file-name fixture; never a real dump', encoding='ascii')
    namespace['read_amiibo_id'] = lambda filename: FIRST
    return namespace, files, bins, target


def snapshot(files):
    return {name: path.read_bytes() if path.exists() else None for name, path in files.items()}


def run_case(source, case):
    with tempfile.TemporaryDirectory(prefix='pixl-tree-preflight-') as temp:
        ns, files, bins, target = fixture(Path(temp), source)
        if case == 'missing_root': bins = Path(temp) / 'missing'
        elif case == 'root_is_file': bins = target
        elif case == 'empty_root': target.unlink()
        elif case == 'unrelated_tree':
            target.unlink(); (bins / 'unrelated.bin').write_text('synthetic', encoding='ascii')
        elif case == 'invalid_record': ns['read_amiibo_id'] = lambda filename: ''
        elif case == 'unknown_record': ns['read_amiibo_id'] = lambda filename: '0000000500000006'
        elif case == 'late_invalid_record':
            (target.parent / 'Z-invalid.bin').write_text('synthetic', encoding='ascii')
            ns['read_amiibo_id'] = lambda filename: '' if filename.endswith('Z-invalid.bin') else FIRST
        elif case == 'unknown_folder': target.parent.rename(target.parent.with_name('Unknown'))
        elif case.startswith('missing_csv_'): files[NAMES[int(case[-1])]].unlink()
        elif case.startswith('short_csv_'): write_csv(files[NAMES[int(case[-1])]], [['broken']])
        elif case == 'empty_csv': files[NAMES[2]].write_text('', encoding='utf-8')
        elif case == 'invalid_csv_utf8': files[NAMES[0]].write_bytes(b'\xff')
        elif case == 'bad_csv_quotes': files[NAMES[0]].write_text('"unterminated', encoding='utf-8')
        elif case == 'unknown_csv_game': write_csv(files[NAMES[2]], [['123', FIRST, '', '', '']])
        elif case == 'unknown_csv_id': write_csv(files[NAMES[2]], [['11', '0000000500000006', '', '', '']])
        elif case == 'duplicate_csv_id': write_csv(files[NAMES[0]], [[FIRST, 'One', ''], [FIRST, 'Two', '']])
        elif case == 'invalid_csv_id': write_csv(files[NAMES[0]], [['invalid', 'One', '']])
        elif case == 'missing_parent': write_csv(files[NAMES[1]], [['11', '123', 'Cards', '', '1']])
        elif case == 'parent_cycle': write_csv(files[NAMES[1]], [['11', '22', 'Animal Crossing', '', '1'],
                                                               ['22', '11', 'Cards', '', '2']])
        elif case != 'valid': raise AssertionError(case)
        before = snapshot(files)
        mutations = []
        original = ns['remove_ac_link']
        ns['remove_ac_link'] = lambda: (mutations.append('remove_ac_link'), original())[1]
        error = io.StringIO()
        if case == 'valid':
            ns['main'](['--bins', str(bins)])
            assert mutations == ['remove_ac_link']
            with files[NAMES[0]].open(encoding='utf-8') as stream: rows = list(csv.reader(stream))
            assert rows == [[FIRST, 'New Name', 'New Name'], [SECOND, 'Keep', 'Bleibt']]
            with files[NAMES[2]].open(encoding='utf-8') as stream: rows = list(csv.reader(stream))
            assert rows == [['22', FIRST, '', '', ''], ['99', SECOND, 'keep-note', '', '']]
            assert files[NAMES[1]].read_bytes() == before[NAMES[1]]
        else:
            with contextlib.redirect_stderr(error):
                try: ns['main'](['--bins', str(bins)])
                except SystemExit as exc: assert exc.code == 1
                else: raise AssertionError('invalid input was accepted: ' + case)
            assert 'metadata was not changed' in error.getvalue()
            assert mutations == [], case
            assert snapshot(files) == before, case


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=FW / 'scripts/amiibo_tree_gen.py')
    args = parser.parse_args()
    source = args.source.read_text(encoding='utf-8')
    cases = ['missing_root', 'root_is_file', 'empty_root', 'unrelated_tree',
             'invalid_record', 'unknown_record', 'late_invalid_record', 'unknown_folder']
    cases += ['missing_csv_' + str(index) for index in range(3)]
    cases += ['short_csv_' + str(index) for index in range(3)]
    cases += ['empty_csv', 'invalid_csv_utf8', 'bad_csv_quotes', 'unknown_csv_game',
              'unknown_csv_id', 'duplicate_csv_id', 'invalid_csv_id', 'missing_parent', 'parent_cycle', 'valid']
    for case in cases:
        run_case(source, case)
    print(json.dumps({'passed': True, 'cases': cases, 'device_access': False,
                      'real_amiibo_files_read': False, 'positive_id_reads_mocked': True}))


if __name__ == '__main__':
    main()
