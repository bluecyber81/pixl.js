#!/usr/bin/env python3
"""Offline unsigned LCD application build. Python standard library + Docker only."""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path


IMAGE = "solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16"
RELEASE_VERSION = "2.22.0-DE3.57"
RELEASE_COUNTER = 629
RELEASE_BIN_SHA256 = "9996b5a64e833b04a17e3c3b878f9c11749a00937ec3210b3a0eb5dc5bb784d2"
SOURCE_DATE_EPOCH = 1793664000
NVIC_BEFORE_SHA256 = "4505df359460dc12df197ab00cb523c0eb3214f379e1a0c24ae3bdc2070ea210"
NVIC_AFTER_SHA256 = "555417cf107cab5569878ee4f8b1d91e783b55dddc7e2900e204f624e107d7ef"
ARTIFACTS = ("pixljs.bin", "pixljs.hex", "pixljs.out", "pixljs.map")
EXCLUDED_PARTS = {".git", "keys", "node_modules", "_build", "build", "__pycache__", ".venv"}
EXCLUDED_SUFFIXES = {".pem", ".key", ".p12", ".pfx"}
EXCLUDED_TREES = ("fw/components/chameleon-ultra/firmware/nrf52_sdk", "fw/components/chameleon-ultra/software")


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_identity(root, mode, version, counter):
    header = root / "fw/application/src/version.inc.h"
    content = header.read_text(encoding="utf-8")
    values = dict(re.findall(r"^#define\s+(\w+)\s+([^\r\n]+)$", content, re.M))
    if mode == "release":
        if version is not None or counter is not None:
            raise ValueError("Release identity is fixed; --version/--counter are for development mode.")
        expected = {"GIT_COMMIT": '"unknown"', "GIT_BRANCH": '"source-archive"',
                    "GIT_BRANCH_NUM": '"n/a"', "VERSION": '"2.22.0-DE3.57"',
                    "BUILD_DIRTY": "1", "BUILD_DIRTY_KNOWN": "0",
                    "BUILD_DATE": '"2026-11-03"', "TARGET": "0"}
        if values != expected:
            raise ValueError("Release mode requires the archived DE3.57 version.inc.h metadata.")
        return RELEASE_VERSION, RELEASE_COUNTER, sha256(header)
    if not version or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._+-]{0,63}", version):
        raise ValueError("Development mode requires an explicit simple --version identifier.")
    if version == RELEASE_VERSION or counter is None or not 630 <= counter <= 0xFFFFFFFF:
        raise ValueError("Use a new development version and explicit counter >=630; 629 identifies DE3.57.")
    if values.get("VERSION") != json.dumps(version):
        raise ValueError("First update VERSION in your development source version.inc.h to match --version.")
    return version, counter, sha256(header)


def archive_filter(info):
    if any(info.name == tree or info.name.startswith(tree + "/") for tree in EXCLUDED_TREES):
        return None
    parts = Path(info.name).parts
    if any(part.lower() in EXCLUDED_PARTS for part in parts):
        return None
    if Path(info.name).suffix.lower() in EXCLUDED_SUFFIXES:
        return None
    if not (info.isfile() or info.isdir()):
        raise ValueError("Unsupported link/special file in source archive: " + info.name)
    info.uid = info.gid = 0
    info.uname = info.gname = ""
    info.mtime = SOURCE_DATE_EPOCH
    return info


def make_archive(root, destination):
    # Only firmware source is needed. No .git, host tools, web dependency tree,
    # existing build product or private signing key is mounted in the container.
    with tarfile.open(destination, "w", format=tarfile.GNU_FORMAT) as archive:
        archive.add(root / "fw", arcname="fw", filter=archive_filter)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("release", "development"), default="release")
    parser.add_argument("--version", help="New development VERSION already set in the source header")
    parser.add_argument("--counter", type=int, help="Explicit development DFU counter; no OTA is generated")
    parser.add_argument("--jobs", type=int, default=8)
    args = parser.parse_args(argv)
    if not 1 <= args.jobs <= 64:
        parser.error("--jobs must be between 1 and 64")
    root = Path(__file__).resolve().parents[1]
    try:
        version, counter, header_hash = build_identity(root, args.mode, args.version, args.counter)
        if shutil.which("docker") is None:
            raise RuntimeError("Docker CLI is required. Install/configure it separately; this helper installs nothing.")
        # --pull never below prevents an implicit network download. Fetch this
        # exact image explicitly before using the offline build helper.
        subprocess.run(["docker", "image", "inspect", IMAGE], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=30)
        override = root / "tools/sdk-overrides/nrf_nvic.h"
        if sha256(override) != NVIC_AFTER_SHA256:
            raise RuntimeError("The checked Nordic DRGN-10613 header override is missing or changed.")
        destination = root / "build/lcd-de357"
        if destination.resolve() != destination:
            raise RuntimeError("build/lcd-de357 must not resolve through a symlink or junction.")
        destination.mkdir(parents=True, exist_ok=True)
        if any(destination.iterdir()):
            raise RuntimeError("build/lcd-de357 must be empty. Preserve or move its previous results before rebuilding.")
        record = {"status": "preparing", "mode": args.mode, "version": version,
                  "counter": counter, "board": "LCD", "sdk_image": IMAGE,
                  "network": "none", "signed": False, "device_access": False,
                  "version_header_sha256": header_hash,
                  "sdk_header_override": {"path": "components/softdevice/s112/headers/nrf_nvic.h",
                                          "before_sha256": NVIC_BEFORE_SHA256,
                                          "after_sha256": NVIC_AFTER_SHA256},
                  "expected_bin_sha256": RELEASE_BIN_SHA256 if args.mode == "release" else None}
        with tempfile.TemporaryDirectory(prefix="allmiibo-lcd-") as temp_name:
            temp = Path(temp_name)
            if "," in str(temp):
                raise ValueError("Docker bind-mount temporary path must not contain a comma.")
            make_archive(root, temp / "source.tar")
            record["source_tar_sha256"] = sha256(temp / "source.tar")
            shutil.copyfile(override, temp / "nrf_nvic.h")
            export = temp / "export"
            export.mkdir()
            # Direct pixljs is intentional: default/all call version_gen.py;
            # top-level make all also builds the bootloader and signed OTA.
            script = """set -euo pipefail
mkdir /work
tar -xf /input/source.tar -C /work
nvic="$NRF52_SDK_ROOT/components/softdevice/s112/headers/nrf_nvic.h"
echo "$4  $nvic" | sha256sum -c -
cp /input/nrf_nvic.h "$nvic"
echo "$5  $nvic" | sha256sum -c -
cd /work
make -C fw/application -j\"$1\" pixljs BOARD=LCD RELEASE=1 APP_VERSION=\"$2\" APP_VERSION_NUM=\"$3\"
cp fw/_build/pixljs.bin fw/_build/pixljs.hex fw/_build/pixljs.out fw/_build/pixljs.map /output/
"""
            (temp / "build.sh").write_text(script, encoding="utf-8", newline="\n")
            command = ["docker", "run", "--rm", "--pull", "never", "--network", "none",
                       "--env", "MAKEFLAGS=--no-print-directory",
                       "--env", "SOURCE_DATE_EPOCH=" + str(SOURCE_DATE_EPOCH),
                       "--mount", "type=bind,source=" + str(temp) + ",target=/input,readonly",
                       "--mount", "type=bind,source=" + str(export) + ",target=/output",
                       IMAGE, "bash", "/input/build.sh", str(args.jobs), version, str(counter),
                       NVIC_BEFORE_SHA256, NVIC_AFTER_SHA256]
            record["status"] = "compiling"
            with (destination / "build.log").open("wb") as log:
                result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=900)
            record["exit_code"] = result.returncode
            if result.returncode:
                raise RuntimeError("Compilation failed; inspect build/lcd-de357/build.log")
            hashes = {name: sha256(export / name) for name in ARTIFACTS}
            record["artifacts_sha256"] = hashes
            matches = hashes["pixljs.bin"] == RELEASE_BIN_SHA256
            record["matches_archived_release_binary"] = matches
            if args.mode == "release" and not matches:
                raise RuntimeError("Release binary SHA-256 mismatch; no firmware artifacts exported. See build.log.")
            for name in ARTIFACTS:
                shutil.copyfile(export / name, destination / name)
            record["status"] = "passed" if args.mode == "release" else "development_build_unverified"
        (destination / "BUILD_RESULT.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(record, indent=2))
        print("Unsigned application output: " + str(destination))
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
        # Preserve a failed build report/log without presenting old artifacts as
        # successful output. Existing nonempty output is never overwritten.
        if "record" in locals():
            record.update(status="failed", error=str(exc))
            (destination / "BUILD_RESULT.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        print("Build stopped: " + str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
