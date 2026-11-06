#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"
build=$(mktemp -d)
trap 'rm -f -- "$build"/{transaction,sd}_{native,san}; rmdir -- "$build"' EXIT
for kind in transaction sd; do
    for mode in native san; do
        flags=()
        if [[ "$mode" = san ]]; then
            flags+=(-fsanitize=address,undefined -fno-sanitize-recover=all -fno-omit-frame-pointer)
        fi
        gcc -std=c11 -O1 -g -fshort-enums -fno-pie -no-pie -Wall -Wextra -Werror \
            -Wno-unused-parameter -Wno-unused-function -Wno-pointer-to-int-cast -Wno-int-to-pointer-cast \
            -DEXPECT_LENGTH_GUARD_FIX=1 -DEXPECT_ADMISSION_CRC_FIX=1 "${flags[@]}" \
            "$kind.c" -o "$build/${kind}_${mode}"
        "$build/${kind}_${mode}"
    done
done
