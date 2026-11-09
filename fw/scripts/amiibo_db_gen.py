# Generate the database from the checked-in metadata; network refresh is opt-in.


from urllib.request import urlopen
import argparse
import json
import os
import csv
import re
import io
import shutil
import tempfile
from pathlib import Path

AMIIBO_API_URL = "https://amiiboapi.org/api/amiibo/"
AMIIBO_API_TIMEOUT_SECONDS = 30

class Amiibo:
    def __init__(self):
        self.id = None
        self.name_en = None
        self.name_cn = None
        self.game_series = None

class Game:
    def __init__(self):
        self.id = None
        self.parent_id = None
        self.name_en = None
        self.name_cn = None
        self.order = None

class Link:
    def __init__(self):
        self.game_id = None
        self.amiibo_id = None
        self.note_en = None
        self.note_cn = None
        self.note_it = None
        self.legacy_empty_column = False



def get_prorject_directory():
    return os.path.abspath(os.path.dirname(__file__)+"/../")


def fetch_amiibo_from_api():
    # Validate the entire response before callers may update any local files.
    # A failed refresh must never be reported as a successful offline build.
    with urlopen(AMIIBO_API_URL, timeout=AMIIBO_API_TIMEOUT_SECONDS) as conn:
        body = json.load(conn)
    if not isinstance(body, dict) or not isinstance(body.get("amiibo"), list) or not body["amiibo"]:
        raise ValueError("AmiiboAPI must return a non-empty amiibo list")
    amiibos = []
    seen = set()
    for index, ami in enumerate(body["amiibo"]):
        if not isinstance(ami, dict):
            raise ValueError("AmiiboAPI record %d is not an object" % index)
        for field in ("head", "tail"):
            if not isinstance(ami.get(field), str) or re.fullmatch(r"[0-9a-fA-F]{8}", ami[field]) is None:
                raise ValueError("AmiiboAPI record %d has an invalid %s" % (index, field))
        for field in ("name", "gameSeries"):
            if not isinstance(ami.get(field), str) or not ami[field].strip() or "\0" in ami[field]:
                raise ValueError("AmiiboAPI record %d has an invalid %s" % (index, field))
            # Reject lone JSON surrogate escapes before opening UTF-8 outputs.
            ami[field].encode("utf8")
        amiibo = Amiibo()
        amiibo.id = (ami["head"] + ami["tail"]).lower()
        if amiibo.id == "0000000000000000" or amiibo.id in seen:
            raise ValueError("AmiiboAPI record %d has a duplicate or zero ID" % index)
        seen.add(amiibo.id)
        amiibo.name_en = ami["name"]
        amiibo.name_cn = ""  # The API has no translation; use the UI's English fallback.
        amiibo.game_series = ami["gameSeries"]
        amiibos.append(amiibo)
    return amiibos


def c_string(value):
    """Escape metadata as a C string body while preserving UTF-8 glyphs."""
    escaped = {"\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t"}
    return "".join(escaped.get(char, "\\%03o" % ord(char) if ord(char) < 32 or ord(char) == 127 else char)
                   for char in value)


def csv_rows(csv_file, width, allow_empty_extension=False):
    """Read exact schemas, optionally tolerating one historical empty link field."""
    with open(csv_file, "r", encoding="utf8", newline="") as stream:
        reader = csv.reader(stream, strict=True)
        try:
            for row in reader:
                compatible = allow_empty_extension and len(row) == width + 1 and row[-1] == ""
                if len(row) != width and not compatible:
                    raise ValueError("%s:%d: expected exactly %d columns, found %d" %
                                     (Path(csv_file).name, reader.line_num, width, len(row)))
                yield row
        except csv.Error as error:
            raise ValueError("%s:%d: invalid CSV: %s" %
                             (Path(csv_file).name, reader.line_num, error)) from error


def read_amiibo_from_csv(data_dir=None):
    csv_file = Path(data_dir or Path(get_prorject_directory()) / "data") / "amiidb_amiibo.csv"
    amiibos = list()
    for r in csv_rows(csv_file, 3):
        amiibo = Amiibo()
        amiibo.id = r[0]
        amiibo.name_en = r[1]
        amiibo.name_cn = r[2]
        amiibos.append(amiibo)
    
    return amiibos


def write_amiibo_to_csv(amiibos):
    csv_file = get_prorject_directory() + "/data/amiidb_amiibo.csv"
    publish_outputs({Path(csv_file): render_amiibo_csv(amiibos)})


def render_amiibo_csv(amiibos):
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    for amiibo in amiibos:
        writer.writerow([amiibo.id, amiibo.name_en, amiibo.name_cn])
    return stream.getvalue()


def publish_outputs(outputs):
    """Stage the entire group, restoring replaced files on an observed error.

    Each rename is atomic; the group is NOT power-loss/crash atomic. A failed
    rollback is reported with retained backup paths rather than claiming success.
    """
    encoded = {Path(path): text.encode("utf8") for path, text in outputs.items()}
    staged, backups, replaced, retained = {}, {}, [], set()
    try:
        for path, content in encoded.items():
            fd, name = tempfile.mkstemp(prefix=".amiidb-new-", suffix=".tmp", dir=path.parent)
            staged[path] = Path(name)
            with os.fdopen(fd, "wb") as stream:
                stream.write(content)
            if path.exists():
                fd, name = tempfile.mkstemp(prefix=".amiidb-old-", suffix=".tmp", dir=path.parent)
                os.close(fd)
                backups[path] = Path(name)
                shutil.copy2(path, name)
            else:
                backups[path] = None
        try:
            for path, temporary in staged.items():
                os.replace(temporary, path)
                replaced.append(path)
        except BaseException as error:
            failures = []
            for path in reversed(replaced):
                try:
                    if backups[path] is None:
                        path.unlink()
                    else:
                        os.replace(backups[path], path)
                except OSError as rollback_error:
                    if backups[path] is not None:
                        retained.add(backups[path])
                    failures.append("%s (backup %s): %s" % (path, backups[path], rollback_error))
            if failures:
                raise OSError("Database publication and rollback failed; restore retained backups: "
                              + "; ".join(failures)) from error
            raise
    finally:
        for temporary in [*staged.values(), *backups.values()]:
            if temporary is not None and temporary not in retained:
                try:
                    temporary.unlink(missing_ok=True)
                except OSError:
                    # A leftover temporary file is not a successful publication.
                    # Do not mask the original write/rollback exception.
                    pass


def merge_amiibo(amiibos_csv, amiibos_api):
    amiibos_merged = dict()
    for amiibo in amiibos_csv:
        key = amiibo.id.lower()
        if key in amiibos_merged:
            raise ValueError("Duplicate local Amiibo ID: " + amiibo.id)
        amiibos_merged[key] = amiibo

    for amiibo in amiibos_api:
        if amiibo.id.lower() not in amiibos_merged:
            amiibos_merged[amiibo.id.lower()] = amiibo
            print("Found new amiibo: [%s] %s (%s)" % (amiibo.id, amiibo.name_en, amiibo.game_series))
    amiibos = list()
    for k in amiibos_merged:
        amiibos.append(amiibos_merged[k])
    return amiibos

def gen_amiibo_data_c_file(amiibos):
    c_file = get_prorject_directory() + "/application/src/amiidb/db_amiibo.c"
    publish_outputs({Path(c_file): render_amiibo_data(amiibos)})


def render_amiibo_data(amiibos):
    with io.StringIO() as f:
        f.write('/* This file is auto-generated by amiibo_db_gen.py. Do not edit directly. */\n')  
        f.write('#include "db_header.h"\n')
        f.write('const db_amiibo_t amiibo_list[] = {\n')
        for amiibo in amiibos:
            f.write('{0x%s, 0x%s, "%s", "%s"}, \n' % 
                    (amiibo.id[0:8], amiibo.id[8:16], c_string(amiibo.name_en),
             c_string(amiibo.name_cn)))
        f.write("{0, 0, 0, 0}\n")
        f.write("};\n")
        f.write("// Subsctracting one because of the end-marker entry {0,0,0,0} at the end.\n")
        f.write("const size_t amiibo_list_size = sizeof(amiibo_list) / sizeof(db_amiibo_t) - 1;\n")
        return f.getvalue()


def read_games_from_csv(data_dir=None):
    csv_file = Path(data_dir or Path(get_prorject_directory()) / "data") / "amiidb_game.csv"
    games = list()
    for r in csv_rows(csv_file, 5):
        game = Game()
        game.id = r[0]
        game.parent_id = r[1]
        game.name_en = r[2]
        game.name_cn = r[3]
        game.order = r[4]
        games.append(game)
    return games


def read_link_from_csv(data_dir=None):
    csv_file = Path(data_dir or Path(get_prorject_directory()) / "data") / "amiidb_link.csv"
    links = list()
    # Preserve the original CSV bytes: they participate in APP_SOURCE_SHA256.
    # Only one empty sixth field is tolerated; no nonempty or further fields.
    for r in csv_rows(csv_file, 5, allow_empty_extension=True):
        link = Link()
        link.game_id = r[0]
        link.amiibo_id = r[1]
        link.note_en = r[2]
        link.note_cn = r[3]
        link.note_it = r[4]
        link.legacy_empty_column = len(r) == 6
        links.append(link)
    return links


def count_game_links(games, links, game_id):

    count = 0
    for link in links:
        if int(link.game_id) == int(game_id):
            count = count + 1
    for game in games:
        if int(game.parent_id) == int(game_id):
            count = count + count_game_links(games, links, game.id)

    return count


def decimal_field(value, label, minimum=0, maximum=255):
    if (not isinstance(value, str) or re.fullmatch(r"[0-9]+", value) is None
            or not minimum <= int(value) <= maximum):
        raise ValueError("%s must be an ASCII integer in %d..%d" % (label, minimum, maximum))
    return int(value)


def validate_games(games, links):
    parents = {}
    for game in games:
        identifier = decimal_field(game.id, "Game ID", 1)
        parent = decimal_field(game.parent_id, "Parent game ID")
        decimal_field(game.order, "Game order")
        if identifier in parents:
            raise ValueError("Duplicate game ID: " + game.id)
        parents[identifier] = parent
    for identifier in parents:
        seen = set()
        current = identifier
        while current:
            if current in seen:
                raise ValueError("Cyclic game parent graph at ID %d" % current)
            if current not in parents:
                raise ValueError("Missing parent game ID: %d" % current)
            seen.add(current)
            current = parents[current]
    for link in links:
        identifier = decimal_field(link.game_id, "Linked game ID", 1)
        if identifier not in parents:
            raise ValueError("Linked game ID is absent: " + link.game_id)
    for game in games:
        if count_game_links(games, links, game.id) > 65535:
            raise ValueError("Game link count exceeds uint16: " + game.id)


def text_field(value, label, required=False):
    # Empty translations and notes are intentional and use the existing UI fallback.
    # A NUL would silently truncate a C string; lone surrogates cannot be UTF-8.
    if not isinstance(value, str) or "\0" in value or (required and not value.strip()):
        raise ValueError("%s must be %sUTF-8 text without NUL" %
                         (label, "non-empty " if required else ""))
    try:
        value.encode("utf8")
    except UnicodeEncodeError as error:
        raise ValueError("%s is not valid UTF-8 text" % label) from error


def validate_catalog(amiibos, games, links):
    """Validate source metadata before generation, network refresh or publication."""
    if not amiibos or len(amiibos) > 2048:
        raise ValueError("Catalog must contain 1..2048 figures supported by firmware search")
    if not games:
        raise ValueError("Catalog must contain at least one game/group")
    identifiers = set()
    for row, amiibo in enumerate(amiibos, 1):
        if not isinstance(amiibo.id, str) or re.fullmatch(r"[0-9a-fA-F]{16}", amiibo.id) is None:
            raise ValueError("Amiibo row %d: expected a 16-digit hexadecimal ID" % row)
        identifier = int(amiibo.id, 16)
        if not identifier or identifier in identifiers:
            raise ValueError("Amiibo row %d: duplicate or reserved zero ID %s" % (row, amiibo.id))
        identifiers.add(identifier)
        text_field(amiibo.name_en, "Amiibo %s English name" % amiibo.id, required=True)
        text_field(amiibo.name_cn, "Amiibo %s Chinese name" % amiibo.id)
    validate_games(games, links)
    for game in games:
        text_field(game.name_en, "Game %s English name" % game.id, required=True)
        text_field(game.name_cn, "Game %s Chinese name" % game.id)
    pairs = set()
    for row, link in enumerate(links, 1):
        if not isinstance(link.amiibo_id, str) or re.fullmatch(r"[0-9a-fA-F]{16}", link.amiibo_id) is None:
            raise ValueError("Link row %d: expected a 16-digit hexadecimal Amiibo ID" % row)
        identifier = int(link.amiibo_id, 16)
        if identifier not in identifiers:
            raise ValueError("Link row %d: Amiibo ID absent from catalog: %s" % (row, link.amiibo_id))
        pair = (int(link.game_id), identifier)
        if pair in pairs:
            raise ValueError("Link row %d: duplicate game/Amiibo pair: %s/%s" %
                             (row, link.game_id, link.amiibo_id))
        pairs.add(pair)
        for language in ("en", "cn", "it"):
            text_field(getattr(link, "note_" + language), "Link row %d %s note" % (row, language))
    if len({(link.note_en, link.note_cn, link.note_it) for link in links}) > 65536:
        raise ValueError("Usage note index exceeds uint16")
    unlinked = identifiers - {identifier for _, identifier in pairs}
    if unlinked and 255 not in {int(game.id) for game in games}:
        raise ValueError("Uncategorized figures require game/group 255")
    return {"figures": len(amiibos), "games": len(games), "links": len(links),
            "legacyEmptyLinkColumns": sum(bool(getattr(link, "legacy_empty_column", False)) for link in links),
            "uncategorizedFigures": len(unlinked),
            "englishNoteLinks": sum(bool(link.note_en) for link in links),
            "uniqueEnglishNotes": len({link.note_en for link in links if link.note_en})}


def read_catalog(data_dir=None):
    amiibos = read_amiibo_from_csv(data_dir)
    games = read_games_from_csv(data_dir)
    links = read_link_from_csv(data_dir)
    validate_catalog(amiibos, games, links)
    return amiibos, games, links


def link_indices(amiibos, links):
    """Validate every internal reference before opening any generated output."""
    if not amiibos or len(amiibos) > 65536:
        raise ValueError("Amiibo table must contain 1..65536 entries for uint16 indices")
    indices = {}
    previous = -1
    for index, amiibo in enumerate(amiibos):
        if not isinstance(amiibo.id, str) or re.fullmatch(r"[0-9a-fA-F]{16}", amiibo.id) is None:
            raise ValueError("Invalid Amiibo ID in indexed database")
        number = int(amiibo.id, 16)
        if number == 0 or number <= previous:
            raise ValueError("Amiibo IDs must be unique, nonzero and sorted numerically")
        previous = number
        indices[number] = index
    result = []
    for link in links:
        if not isinstance(link.amiibo_id, str) or re.fullmatch(r"[0-9a-fA-F]{16}", link.amiibo_id) is None:
            raise ValueError("Invalid linked Amiibo ID")
        number = int(link.amiibo_id, 16)
        if number not in indices:
            raise ValueError("Linked Amiibo ID is absent from the catalog: " + link.amiibo_id)
        decimal_field(link.game_id, "Linked game ID", 1)
        result.append(indices[number])
    return result


def gen_amiibo_link_c_file(links, amiibos):
    c_file = get_prorject_directory() + "/application/src/amiidb/db_link.c"
    publish_outputs({Path(c_file): render_amiibo_links(links, amiibos),
                     Path(c_file).with_name("db_note_index.h"): render_note_index_header(links)})


def note_indices(links):
    notes = ((link.note_en, link.note_cn, link.note_it) for link in links)
    note_ids = {values: i for i, values in enumerate(dict.fromkeys(notes))}
    if len(note_ids) > 65536:
        raise ValueError("Usage note index exceeds uint16")
    return note_ids


def render_note_index_header(links):
    width = 'uint8_t' if len(note_indices(links)) <= 256 else 'uint16_t'
    return ('/* Generated from the number of distinct catalog note triples. */\n'
            '#ifndef DB_NOTE_INDEX_H\n#define DB_NOTE_INDEX_H\n#include <stdint.h>\n'
            f'typedef {width} db_note_index_t;\n#endif\n')


def render_amiibo_links(links, amiibos):
    indices = link_indices(amiibos, links)
    note_ids = note_indices(links)
    with io.StringIO() as f:
        f.write('/* This file is auto-generated by amiibo_db_gen.py. Do not edit directly. */\n')  
        f.write('#include "db_header.h"\n')
        f.write('const db_notes_t db_usage_notes[] = {\n')
        for values in note_ids:
            f.write('    {"%s", DB_NOTE_CN("%s"), DB_NOTE_IT("%s")},\n' % tuple(map(c_string, values)))
        if not note_ids:
            f.write("    {0}\n")
        f.write('};\n')
        f.write('_Static_assert(sizeof(db_usage_notes) / sizeof(*db_usage_notes) <= '
                '(uint32_t)(db_note_index_t)-1 + 1, "regenerate db_note_index.h");\n')
        f.write('const db_link_t link_list[] = {\n')
        for link, index in zip(links, indices):
            note = note_ids[(link.note_en, link.note_cn, link.note_it)]
            f.write('    {%d, %d, %d},\n' % (index, int(link.game_id), note))
        f.write("    {0}\n")
        f.write("};\n")
        return f.getvalue()

def gen_amiibo_game_c_file(games, links):
    c_file = get_prorject_directory() + "/application/src/amiidb/db_game.c"
    publish_outputs({Path(c_file): render_amiibo_games(games, links)})


def render_amiibo_games(games, links):
    validate_games(games, links)
    with io.StringIO() as f:
        f.write('/* This file is auto-generated by amiibo_db_gen.py. Do not edit directly. */\n')  
        f.write('#include "db_header.h"\n')
        f.write('const db_game_t game_list[] = {\n')
        for game in games:
            f.write('{%s, %s, "%s", "%s", %s, %s}, \n' % 
                    (int(game.id), int(game.parent_id), c_string(game.name_en),
             c_string(game.name_cn), int(game.order), count_game_links( games, links, game.id)))
        f.write("{0, 0, 0, 0, 0}\n")
        f.write("};\n")
        return f.getvalue()

def gen_other_link(amiibos, links):
    linked_amiibo_ids = set()
    new_link = list()
    for link in links:
        linked_amiibo_ids.add(link.amiibo_id.lower())
    for amiibo in amiibos:
        if amiibo.id.lower() not in linked_amiibo_ids:
            link = Link()
            link.game_id = "255" # other
            link.amiibo_id = amiibo.id
            link.note_en = ""
            link.note_cn = ""
            link.note_it = ""
            new_link.append(link)
            print("uncategorized amiibo (%s, %s)" % (link.amiibo_id, amiibo.name_en))
    if len(new_link) > 0:
        print("add %d uncategoried amiibo to other." %(len(new_link)))
    for link in new_link:
        links.append(link)
    return links


def main():
    parser = argparse.ArgumentParser(description="Generate C database from local metadata CSVs.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--offline", action="store_true", help="Use local CSVs without network access (default).")
    mode.add_argument("--refresh", action="store_true", help="Fetch AmiiboAPI and update the source CSV before generation.")
    args = parser.parse_args()
    amiibos_csv, games, links = read_catalog()
    try:
        amiibos_api = fetch_amiibo_from_api() if args.refresh else []
    except (OSError, ValueError) as error:
        parser.exit(1, "AmiiboAPI refresh failed; local files were not changed: %s\n" % error)
    amiibos_merged = merge_amiibo(amiibos_csv, amiibos_api)
    amiibos_merged.sort(key=lambda x: x.id.lower())
    print("Found %d amiibo records." % len(amiibos_merged))
    links = gen_other_link(amiibos_merged, links)
    validate_catalog(amiibos_merged, games, links)
    link_indices(amiibos_merged, links)
    generated = Path(get_prorject_directory()) / "application/src/amiidb"
    outputs = {
        generated / "db_amiibo.c": render_amiibo_data(amiibos_merged),
        generated / "db_game.c": render_amiibo_games(games, links),
        generated / "db_link.c": render_amiibo_links(links, amiibos_merged),
        generated / "db_note_index.h": render_note_index_header(links),
    }
    if args.refresh:
        outputs[Path(get_prorject_directory()) / "data/amiidb_amiibo.csv"] = render_amiibo_csv(amiibos_merged)
    publish_outputs(outputs)


if __name__ == "__main__":
    main()

