#!/usr/bin/env bash
# Local LCD build only. Run inside the pinned nRF52 SDK container.
set -euo pipefail
cd "$(dirname "$0")/.."
export SOURCE_DATE_EPOCH=1792540800
export MAKEFLAGS=--no-print-directory
: "${PIXL_BUILD_RUN_ID:?Use work/build_allmiibo_de316.py to create a fresh build run}"
python3 scripts/build_evidence.py start --run-id "$PIXL_BUILD_RUN_ID"
git config --global --add safe.directory /work
python3 scripts/amiibo_db_gen.py --offline
# Regenerate in both modes: changed CSV/font inputs must never leave stale C data.
python3 scripts/i18n_gen.py
python3 scripts/font_data_gen.py
make bl BOARD=LCD RELEASE=1 APP_VERSION=2.21.0-DE3.16 APP_VERSION_NUM=572
make -C application version BOARD=LCD RELEASE=1 APP_VERSION=2.21.0-DE3.16 APP_VERSION_NUM=572
python3 scripts/build_evidence.py begin --run-id "$PIXL_BUILD_RUN_ID"
# start archived all application objects/products; normal make compiles them fresh.
# Do not use -B: the SDK directory recipe cannot recreate an existing _build.
make -C application -j8 pixljs BOARD=LCD RELEASE=1 APP_VERSION=2.21.0-DE3.16 APP_VERSION_NUM=572
make ota BOARD=LCD RELEASE=1 APP_VERSION=2.21.0-DE3.16 APP_VERSION_NUM=572
make size_report BOARD=LCD RELEASE=1 APP_VERSION=2.21.0-DE3.16 APP_VERSION_NUM=572
nrfutil pkg display _build/pixljs_ota_v2.21.0-DE3.16.zip
python3 scripts/build_evidence.py finish --run-id "$PIXL_BUILD_RUN_ID"
