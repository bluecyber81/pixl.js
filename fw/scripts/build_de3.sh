#!/usr/bin/env bash
# Application-only compile. Signing and bootloader/SoftDevice packages are separate.
set -euo pipefail
cd "$(dirname "$0")/.."
export SOURCE_DATE_EPOCH=1793577600
# Recursive make is also queried inside SDK linker variables; keep directory
# banners out of the captured argument list when using make -C.
export MAKEFLAGS=--no-print-directory
make -C application version BOARD=LCD RELEASE=1 APP_VERSION=2.22.0-DE3.55 APP_VERSION_NUM=627
make -C application -j8 pixljs BOARD=LCD RELEASE=1 APP_VERSION=2.22.0-DE3.55 APP_VERSION_NUM=627
make size_report_files BOARD=LCD RELEASE=1 APP_VERSION=2.22.0-DE3.55 APP_VERSION_NUM=627
