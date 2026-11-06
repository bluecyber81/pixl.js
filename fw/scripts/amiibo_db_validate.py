#!/usr/bin/env python3
"""Read-only catalogue preflight; no network requests or generated-file writes."""
import argparse
import json
from pathlib import Path

from amiibo_db_gen import read_catalog, validate_catalog


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, default=Path(__file__).resolve().parents[1] / 'data')
    args = parser.parse_args()
    try:
        summary = validate_catalog(*read_catalog(args.data_dir))
    except (OSError, ValueError) as error:
        parser.exit(1, 'Catalog validation failed: %s\n' % error)
    print(json.dumps({'valid': True, **summary}, sort_keys=True))


if __name__ == '__main__':
    main()
