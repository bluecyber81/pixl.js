#!/usr/bin/env bash
# Local LCD customization build. Run inside the pinned nRF52 SDK container.
# Builds files only; contains no flash/device targets and no network requests.
set -euo pipefail
cd "$(dirname "$0")/.."
export SOURCE_DATE_EPOCH=1792281600
export MAKEFLAGS=--no-print-directory
git config --global --add safe.directory /work

python3 scripts/amiibo_db_gen.py --offline
if [[ "${1:-}" != "--incremental" ]]; then
    python3 scripts/i18n_gen.py
    python3 scripts/font_data_gen.py
fi
# Icons/resources are unchanged, so the existing generated resources are kept.
# The version header must be generated before the parallel application compile.
make bl BOARD=LCD RELEASE=1 APP_VERSION=2.21.0-DE1 APP_VERSION_NUM=549
make -C application version BOARD=LCD RELEASE=1 APP_VERSION=2.21.0-DE1 APP_VERSION_NUM=549
make -C application -j8 pixljs BOARD=LCD RELEASE=1 APP_VERSION=2.21.0-DE1 APP_VERSION_NUM=549
make ota BOARD=LCD RELEASE=1 APP_VERSION=2.21.0-DE1 APP_VERSION_NUM=549
make size_report BOARD=LCD RELEASE=1 APP_VERSION=2.21.0-DE1 APP_VERSION_NUM=549
nrfutil pkg display _build/pixljs_ota_v2.21.0-DE1.zip
