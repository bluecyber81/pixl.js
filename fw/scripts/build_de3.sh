#!/usr/bin/env bash
# Build the checked-in LCD application in the prepared Nordic SDK environment.
set -euo pipefail
cd "$(dirname "$0")/.."
export SOURCE_DATE_EPOCH=1793836800
export MAKEFLAGS=--no-print-directory

# Keep the checked-in version header intact: its exact bytes enter the source ID.
identity=$(python3 - <<'PY'
import json
import re
from pathlib import Path

release = json.loads(Path("../RELEASE_INFO.json").read_bytes())
header = Path("application/src/version.inc.h").read_text(encoding="utf-8")
match = re.search(r'^#define VERSION "([^"]+)"$', header, re.MULTILINE)
if not match or match[1] != release["version"]:
    raise SystemExit("Checked-in version.inc.h differs from RELEASE_INFO.json")
print(release["version"], release["counter"], release["application_sha256"])
PY
)
read -r version counter expected <<< "$identity"
flags=(BOARD=LCD RELEASE=1 "APP_VERSION=$version" "APP_VERSION_NUM=$counter")
make -C application -j8 pixljs "${flags[@]}"
make size_report_files "${flags[@]}"
printf '%s  %s\n' "$expected" "_build/pixljs.bin" | sha256sum --check --strict
