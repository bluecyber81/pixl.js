"""Read the same package manifest used by the web UI and portable launchers."""
import json
from pathlib import Path
import re


def release_version(root):
    try:
        manifest = json.loads((Path(root) / 'package.json').read_text(encoding='utf-8-sig'))
        version = manifest['version']
        if manifest.get('name') != 'allmiibo-web' or not isinstance(version, str) or not re.fullmatch(
                r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?', version):
            raise ValueError('Invalid release version')
        return version
    except (OSError, ValueError, KeyError, TypeError):
        raise RuntimeError('package.json fehlt oder enthaelt keine gueltige Dateimanager-Version. '
                           'Bitte die komplette ZIP entpacken.') from None
