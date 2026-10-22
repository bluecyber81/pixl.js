"""Explicit legacy metadata maintenance; never runs while importing the module.

Use --bins with a complete intended local tree. Input validation precedes all
changes; the two output CSV writes are not an atomic power-loss transaction.
This helper is not part of the normal firmware build.
"""
import argparse
import os
import struct
import csv
import re
from pathlib import Path

class Amiibo:
    def __init__(self):
        self.id = None
        self.name_en = None
        self.name_cn = None

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
        self.name_it = None

def get_prorject_directory():
    return os.path.abspath(os.path.dirname(__file__)+"/../")


def read_amiibo_from_csv():
    csv_file = get_prorject_directory() + "/data/amiidb_amiibo.csv"
    amiibos = list()
    with open(csv_file, "r", encoding="utf8", newline="") as f:
        for r in csv.reader(f, strict=True):
            validate_csv_row(r, 3, csv_file)
            amiibo = Amiibo()
            amiibo.id = r[0]
            amiibo.name_en = r[1]
            amiibo.name_cn = r[2]
            amiibos.append(amiibo)
    
    return amiibos

def write_amiibo_to_csv(amiibos):
    csv_file = get_prorject_directory() + "/data/amiidb_amiibo.csv"
    with open(csv_file, "w", encoding="utf8", newline="") as f:
        w = csv.writer(f)
        for amiibo in amiibos:
            r = list()
            r.append(amiibo.id)
            r.append(amiibo.name_en)
            r.append(amiibo.name_cn)
            w.writerow(r)

def read_games_from_csv():
    csv_file = get_prorject_directory() + "/data/amiidb_game.csv"
    games = list()
    with open(csv_file, "r", encoding="utf8", newline="") as f:
        for r in csv.reader(f, strict=True):
            validate_csv_row(r, 5, csv_file)
            game = Game()
            game.id = r[0]
            game.parent_id = r[1]
            game.name_en = r[2]
            game.name_cn = r[3]
            game.order = r[4]
            games.append(game)
    return games

def read_link_from_csv():
    csv_file = get_prorject_directory() + "/data/amiidb_link.csv"
    links = list()
    with open(csv_file, "r", encoding="utf8", newline="") as f:
        for r in csv.reader(f, strict=True):
            validate_csv_row(r, 5, csv_file)
            link = Link()
            link.game_id = r[0]
            link.amiibo_id = r[1]
            link.note_en = r[2]
            link.note_cn = r[3]
            link.note_it = r[4]
            links.append(link)
    return links


def write_link_to_csv(links):
    csv_file = get_prorject_directory() + "/data/amiidb_link.csv"
    with open(csv_file, "w", encoding="utf8", newline="") as f:
        w = csv.writer(f)
        for link in links:
            r = list()
            r.append(link.game_id)
            r.append(link.amiibo_id)
            r.append(link.note_en)
            r.append(link.note_cn)
            r.append(link.note_it)
            w.writerow(r)



amiibo_list = []
games = []
links = []

def update_amiibo_name(amiibo_id, amiibo_name):
    for amiibo in amiibo_list:
        if amiibo.id == amiibo_id:
            amiibo.name_en = amiibo_name
            amiibo.name_cn = amiibo_name
            break


def read_amiibo_id(filename):
    file = open(filename, "rb")
    content = file.read()
    file.close()
    if(len(content) == 540):
        head = struct.unpack(">I", bytes(content[84:88]))[0]
        tail = struct.unpack(">I", bytes(content[88:92]))[0]
        return ("%08x%08x" % ( head, tail))
    else:
        return ""
    
def add_ac_link(amiibo_id, game_name):
    for game in games:
        if game.name_en == game_name:
            link = Link()
            link.game_id = game.id
            link.amiibo_id = amiibo_id
            link.note_cn = ""
            link.note_en = ""
            link.note_it = ""
            links.append(link)



def validate_csv_row(row, fields, path):
    if len(row) != fields or any("\0" in field for field in row):
        raise ValueError("Invalid CSV row in " + path)


def validate_csv_inputs(amiibos, game_rows, link_rows):
    if not amiibos or not game_rows or not link_rows:
        raise ValueError("All three metadata CSVs must contain records")
    ids = [row.id.lower() for row in amiibos]
    if (any(re.fullmatch(r"[0-9a-f]{16}", value) is None or value == "0" * 16 for value in ids)
            or len(set(ids)) != len(ids) or any(not row.name_en.strip() for row in amiibos)):
        raise ValueError("Invalid, duplicate, or unnamed amiibo CSV record")
    game_ids = [row.id for row in game_rows]
    if (any(not row.id.isdecimal() or not row.parent_id.isdecimal() or not row.order.isdecimal()
            or not row.name_en.strip() for row in game_rows) or len(set(game_ids)) != len(game_ids)):
        raise ValueError("Invalid or duplicate game CSV record")
    if any(row.parent_id != "0" and row.parent_id not in game_ids for row in game_rows):
        raise ValueError("Game CSV references a missing parent")
    parents = {row.id: row.parent_id for row in game_rows}
    for identifier in game_ids:
        seen = set()
        while identifier != "0":
            if identifier in seen:
                raise ValueError("Game CSV contains a parent cycle")
            seen.add(identifier)
            identifier = parents[identifier]
    if any(row.game_id not in game_ids or row.amiibo_id.lower() not in ids for row in link_rows):
        raise ValueError("Link CSV references an unknown game or amiibo")


def collect_updates(path, amiibos, game_rows):
    # Preflight the complete tree before removing links or modifying any CSV.
    root = Path(path).resolve(strict=True)
    if not root.is_dir():
        raise ValueError("--bins must name an existing directory")
    known_ids = {row.id.lower(): row.id for row in amiibos}
    updates = []
    def walk_error(error):
        raise error
    for directory, dirs, files in os.walk(root, onerror=walk_error):
        dirs.sort()
        relative = Path(directory).relative_to(root)
        if "Animal Crossing Amiibo" not in relative.as_posix():
            continue
        for filename in sorted(files):
            file = Path(directory) / filename
            if file.suffix.lower() != ".bin":
                continue
            if not file.is_file() or not file.resolve().is_relative_to(root):
                raise ValueError("Invalid or out-of-tree input: " + str(file))
            identifier = read_amiibo_id(str(file))
            if identifier not in known_ids:
                raise ValueError("Invalid length or unknown amiibo ID: " + str(file))
            game_name = relative.name
            matches = [game for game in game_rows if game.name_en == game_name]
            if len(matches) != 1:
                raise ValueError("Missing or ambiguous game folder: " + game_name)
            if not file.stem.strip():
                raise ValueError("Empty amiibo file name")
            updates.append((known_ids[identifier], file.stem, game_name))
    if not updates:
        raise ValueError("No usable Animal Crossing .bin records found; metadata was not changed")
    return updates


def remove_ac_link():
    new_links = []
    global links
    for link in links:
        if link.game_id != "11":
            new_links.append(link)
    links = new_links


def link_sort_key(link):
    for amiibo in amiibo_list:
        if link.amiibo_id.lower() == amiibo.id.lower():
            return ("%02d:%s")% (int(link.game_id) , amiibo.name_en)
    return ("%02d:%s")% (int(link.game_id) , "")

def sort_link():
    links.sort(key=lambda x: link_sort_key(x) )


def main(argv=None):
    parser = argparse.ArgumentParser(description=(
        "Rebuild Animal Crossing metadata from an explicitly selected local tree. "
        "Replaces existing group 11 links and updates names in the project's CSVs."))
    parser.add_argument("--bins", type=Path, required=True, help="Root containing Animal Crossing Amiibo subfolders")
    args = parser.parse_args(argv)
    global amiibo_list, games, links
    try:
        new_amiibos = read_amiibo_from_csv()
        new_games = read_games_from_csv()
        new_links = read_link_from_csv()
        validate_csv_inputs(new_amiibos, new_games, new_links)
        updates = collect_updates(args.bins, new_amiibos, new_games)
    except (OSError, ValueError, csv.Error) as error:
        parser.exit(1, "Input validation failed; metadata was not changed: %s\n" % error)
    amiibo_list, games, links = new_amiibos, new_games, new_links
    remove_ac_link()
    for identifier, name, game_name in updates:
        update_amiibo_name(identifier, name)
        add_ac_link(identifier, game_name)
    sort_link()
    write_amiibo_to_csv(amiibo_list)
    write_link_to_csv(links)


if __name__ == "__main__":
    main()
