#!/usr/bin/env python3
"""Offline unsigned LCD build, using pinned Docker or native Linux tools."""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "fw/scripts"))
from application_budget import check_budget
from packed_identity import identity as packed_identity
from production_id import fingerprint, source_hashes


IMAGE = "solosky/nrf52-sdk@sha256:ef337de9a0504dc3cf0f94a0a8d09f06193b318b3cc9b1bc5bd0b92a7bc1ea16"
RELEASE_VERSION = "2.22.0-DE3.89"
RELEASE_COUNTER = 662
RELEASE_BIN_SHA256 = "401e9517ad3c199b48122caadcec86a72e15bb3ada491cea1b3d1342b34983ec"
SOURCE_DATE_EPOCH = 1793836800
NVIC_BEFORE_SHA256 = "4505df359460dc12df197ab00cb523c0eb3214f379e1a0c24ae3bdc2070ea210"
NVIC_AFTER_SHA256 = "555417cf107cab5569878ee4f8b1d91e783b55dddc7e2900e204f624e107d7ef"
ARTIFACTS = ("pixljs.bin", "pixljs.hex", "pixljs.out", "pixljs.map")
SDK_ARCHIVE_SHA256 = "f726a4e717a0d8e00fe3de9f1e76b19a0c9646291de00097a75cda44c4bcd6d6"
GCC_SHA256 = "a3c5b9d3b1d05160462b6c86e46f3a3471db314f6406f0e6a98973524ab00da3"
EXCLUDED_PARTS = {".git", "keys", "node_modules", "_build", "build", "__pycache__", ".venv"}
EXCLUDED_SUFFIXES = {".pem", ".key", ".p12", ".pfx", ".p8", ".jks", ".keystore"}
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
    preview = json.loads((root / "RELEASE_INFO.json").read_bytes()).get("firmware_preview")
    if mode == "preview" or (mode == "candidate" and preview):
        if not preview:
            raise ValueError("No firmware preview is recorded in RELEASE_INFO.json.")
        if version is not None or counter is not None:
            raise ValueError("Preview identity comes from RELEASE_INFO.json.")
        version, counter = preview["version"], preview["counter"]
        if (not isinstance(version, str) or not re.fullmatch(r"2\.22\.0-DE[0-9]+\.[0-9]+", version)
                or type(counter) is not int or not RELEASE_COUNTER < counter <= 0xffffffff
                or values.get("VERSION") != json.dumps(version)):
            raise ValueError("Preview metadata must match the newer checked-in firmware header.")
        return version, counter, sha256(header)
    if mode in ("release", "candidate"):
        if version is not None or counter is not None:
            raise ValueError("Release identity is fixed; --version/--counter are for development mode.")
        expected = {"GIT_COMMIT": '"unknown"', "GIT_BRANCH": '"codex/lcd-de389-app662"',
                    "GIT_BRANCH_NUM": '"n/a"', "VERSION": json.dumps(RELEASE_VERSION),
                    "BUILD_DIRTY": "1", "BUILD_DIRTY_KNOWN": "0",
                    "BUILD_DATE": '"2026-11-18"', "TARGET": "0"}
        if values != expected:
            raise ValueError("Release mode requires the released DE3.89 version.inc.h metadata.")
        return RELEASE_VERSION, RELEASE_COUNTER, sha256(header)
    if not version or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._+-]{0,63}", version):
        raise ValueError("Development mode requires an explicit simple --version identifier.")
    if version == RELEASE_VERSION or counter is None or not RELEASE_COUNTER < counter <= 0xFFFFFFFF:
        raise ValueError("Use a new development version and explicit counter above the release counter.")
    if values.get("VERSION") != json.dumps(version):
        raise ValueError("First update VERSION in your development source version.inc.h to match --version.")
    return version, counter, sha256(header)


def check_packed_identity(root):
    """Refuse stale generated identity without changing any production input."""
    core = root / "fw/application/src/mod/vfs"
    header = core / "vfs_packed_identity.h"
    try:
        _, expected = packed_identity(core, root / "fw/components/littlefs")
    except AssertionError as exc:
        raise ValueError("PackedFS layout identity preflight failed: " + str(exc)) from exc
    content = header.read_text(encoding="utf-8")
    definitions = {}
    for name, value in re.findall(
            r"^\s*#define\s+(PIXL_PACKED_ENGINE_SHA256(?:_BYTES)?)\s+([^\r\n]+)$", content, re.M):
        definitions.setdefault(name, []).append(value.strip())
    wrong = []
    text_name = "PIXL_PACKED_ENGINE_SHA256"
    byte_name = text_name + "_BYTES"
    if definitions.get(text_name) != [json.dumps(expected)]:
        wrong.append(text_name)
    byte_values = definitions.get(byte_name, [])
    byte_match = re.fullmatch(r"\{\s*(0x[0-9a-fA-F]{2}(?:\s*,\s*0x[0-9a-fA-F]{2}){31})\s*\}",
                             byte_values[0]) if len(byte_values) == 1 else None
    if byte_match is None or bytes(int(token.strip(), 16) for token in byte_match[1].split(",")).hex() != expected:
        wrong.append(byte_name)
    if wrong:
        raise ValueError("PackedFS engine identity preflight failed: " + ", ".join(wrong) +
                         " missing, malformed, duplicated or stale in " + str(header) +
                         ". Expected SHA-256: " + expected +
                         ". Regenerate with fw/scripts/packed_identity.py and review the header before building.")
    return {"engine_sha256": expected, "header_sha256": sha256(header),
            "both_header_representations_verified": True}


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


def stack_report(raw):
    """Read actual GCC .su files. Paths identify separate translation units."""
    frames = []
    files = {}
    for path in sorted(raw.rglob("*.su")):
        relative = path.relative_to(raw).as_posix()
        files[relative] = sha256(path)
        for line in path.read_text(encoding="utf-8").splitlines():
            location, size, qualifier = line.rsplit("\t", 2)
            source, number, column, function = location.rsplit(":", 3)
            frames.append({"unit": relative, "source": Path(source).name, "line": int(number),
                           "column": int(column), "function": function, "bytes": int(size),
                           "qualifier": qualifier})
    if not frames:
        raise ValueError("Compiler produced no stack-usage entries.")
    return {"compiler_files_sha256": files, "frame_count": len(frames), "frames": frames,
            "scope": "Compiler estimates per translation unit, including unlinked functions. Callees, "
                     "indirect calls, assembler and nested interrupts require separate analysis. "
                     "This is not a runtime stack watermark."}


def native_build(temp, export, args, version, counter, record, log):
    """Use a disposable SDK copy; never patch the supplied SDK or toolchain."""
    if os.name != "posix":
        raise RuntimeError("Native builds require Linux/WSL; Windows can use --backend docker.")
    if not args.sdk_archive or not args.toolchain:
        raise ValueError("Native builds need --sdk-archive and --toolchain; no tools are installed automatically.")
    sdk_archive = args.sdk_archive.resolve()
    tool_bin = args.toolchain.resolve() / "bin"
    compiler = tool_bin / "arm-none-eabi-gcc"
    if sha256(sdk_archive) != SDK_ARCHIVE_SHA256:
        raise ValueError("SDK archive does not match the pinned Nordic 17.1.0 build sources.")
    if sha256(compiler) != GCC_SHA256:
        raise ValueError("Compiler does not match the pinned ARM GNU 12.2.Rel1 Linux compiler.")
    # Environment-supplied CFLAGS/MAKEFILES/GCC_EXEC_PREFIX could change a build
    # without changing its source manifest. Pass only process essentials.
    env = {key: os.environ[key] for key in ("PATH", "HOME", "TMPDIR") if key in os.environ}
    env.update(LANG="C.UTF-8", LC_ALL="C.UTF-8")
    compiler_version = subprocess.check_output([str(compiler), "--version"], text=True, env=env).splitlines()[0]
    make_version = subprocess.check_output(["make", "--version"], text=True, env=env).splitlines()[0]
    work, sdk = temp / "work", temp / "sdk"
    work.mkdir(); sdk.mkdir()
    for archive_path, target in ((temp / "source.tar", work), (sdk_archive, sdk)):
        with tarfile.open(archive_path) as archive:
            archive.extractall(target, filter="data")
    nvic = sdk / "components/softdevice/s112/headers/nrf_nvic.h"
    if sha256(nvic) != NVIC_BEFORE_SHA256:
        raise ValueError("Unexpected original SDK NVIC header.")
    shutil.copyfile(temp / "nrf_nvic.h", nvic)
    env.update(NRF52_SDK_ROOT=str(sdk), SOURCE_DATE_EPOCH=str(SOURCE_DATE_EPOCH),
               MAKEFLAGS="--no-print-directory")
    command = ["make", "-C", str(work / "fw/application"), "-j" + str(args.jobs),
               "pixljs", "BOARD=LCD", "RELEASE=1", "APP_VERSION=" + version,
               "APP_VERSION_NUM=" + str(counter), "GNU_INSTALL_ROOT=" + str(tool_bin) + "/",
               "GNU_PREFIX=arm-none-eabi"]
    record["native_tools"] = {"compiler": compiler_version, "compiler_sha256": GCC_SHA256,
                              "make": make_version, "sdk_archive_sha256": SDK_ARCHIVE_SHA256,
                              "sdk_copy_patched": True, "input_sdk_modified": False,
                              "environment_policy": "PATH/HOME/TMPDIR only; fixed locale and build variables"}
    result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, env=env, timeout=900)
    if result.returncode == 0:
        for name in (*ARTIFACTS, "production-inputs.json"):
            shutil.copyfile(work / "fw/_build" / name, export / name)
        if args.stack_report:
            build_dir = work / "fw/_build"
            for path in build_dir.rglob("*.su"):
                output = export / "stack-usage" / path.relative_to(build_dir)
                output.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, output)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("release", "candidate", "development", "preview"),
                        help="Default: the preview recorded in RELEASE_INFO.json, otherwise the stable release")
    parser.add_argument("--version", help="New development VERSION already set in the source header")
    parser.add_argument("--counter", type=int, help="Explicit development DFU counter; no OTA is generated")
    parser.add_argument("--jobs", type=int, default=8)
    parser.add_argument("--backend", choices=("docker", "native"), default="docker")
    parser.add_argument("--sdk-archive", type=Path, help="Pinned SDK source tar for native Linux builds")
    parser.add_argument("--toolchain", type=Path, help="ARM GNU 12.2.Rel1 directory containing bin/")
    parser.add_argument("--output", type=Path, help="New/empty output directory; existing results are preserved")
    parser.add_argument("--stack-report", action="store_true", help="Export existing GCC .su files and parsed per-function estimates")
    args = parser.parse_args(argv)
    if not 1 <= args.jobs <= 64:
        parser.error("--jobs must be between 1 and 64")
    root = Path(__file__).resolve().parents[1]
    try:
        release_info = json.loads((root / "RELEASE_INFO.json").read_bytes())
        if args.mode is None:
            args.mode = "preview" if release_info.get("firmware_preview") else "release"
        preview = release_info.get("firmware_preview") if args.mode == "preview" else None
        version, counter, header_hash = build_identity(root, args.mode, args.version, args.counter)
        packed_engine = check_packed_identity(root)
        if args.backend == "docker" and shutil.which("docker") is None:
            raise RuntimeError("Docker CLI is required. Install/configure it separately; this helper installs nothing.")
        # --pull never below prevents an implicit network download. Fetch this
        # exact image explicitly before using the offline build helper.
        if args.backend == "docker":
            subprocess.run(["docker", "image", "inspect", IMAGE], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=30)
        override = root / "tools/sdk-overrides/nrf_nvic.h"
        if sha256(override) != NVIC_AFTER_SHA256:
            raise RuntimeError("The checked Nordic DRGN-10613 header override is missing or changed.")
        default_build = "build/lcd-preview" if preview else "build/lcd-de389"
        destination = Path(os.path.abspath(args.output if args.output else root / default_build))
        if destination.resolve() != destination:
            raise RuntimeError("Output must not resolve through a symlink or junction.")
        destination.mkdir(parents=True, exist_ok=True)
        if any(destination.iterdir()):
            raise RuntimeError("Output must be empty. Preserve or move its previous results before rebuilding.")
        record = {"status": "preparing", "mode": args.mode, "version": version,
                  "counter": counter, "board": "LCD", "backend": args.backend,
                  "sdk_image": IMAGE if args.backend == "docker" else None,
                  "network": "none" if args.backend == "docker" else "no downloads performed",
                  "signed": False, "device_access": False,
                  "version_header_sha256": header_hash,
                  "packed_engine_identity": packed_engine,
                  "sdk_header_override": {"path": "components/softdevice/s112/headers/nrf_nvic.h",
                                          "before_sha256": NVIC_BEFORE_SHA256,
                                          "after_sha256": NVIC_AFTER_SHA256},
                  "expected_bin_sha256": (preview["application_sha256"] if preview else
                                          RELEASE_BIN_SHA256 if args.mode == "release" else None)}
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
cp fw/_build/production-inputs.json fw/_build/pixljs.bin fw/_build/pixljs.hex fw/_build/pixljs.out fw/_build/pixljs.map /output/
"""
            if args.stack_report:
                # Export a single file. Nested directories created by root inside a
                # bind mount cannot be cleaned up by an unprivileged Linux runner.
                script += 'cd fw/_build\nfind . -type f -name "*.su" -print0 | tar -cf /output/stack-usage.tar --null -T -\n'
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
                result = (native_build(temp, export, args, version, counter, record, log)
                          if args.backend == "native" else
                          subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=900))
            record["exit_code"] = result.returncode
            if result.returncode:
                raise RuntimeError("Compilation failed; inspect " + str(destination / "build.log"))
            hashes = {name: sha256(export / name) for name in ARTIFACTS}
            inputs = json.loads((export / "production-inputs.json").read_bytes())
            if inputs != source_hashes(root / "fw"):
                raise RuntimeError("Compiled source manifest differs from checkout")
            source_id = fingerprint(inputs)
            binary = (export / "pixljs.bin").read_bytes()
            if binary.count(source_id.encode("ascii") + b"\0") != 1:
                raise RuntimeError("Missing or ambiguous application source ID in image")
            record["source_id_sha256"] = source_id
            record["source_input_count"] = len(inputs)
            record["linker_budget"] = check_budget((export / "pixljs.map").read_text(), len(binary))
            record["artifacts_sha256"] = hashes
            matches = hashes["pixljs.bin"] == RELEASE_BIN_SHA256
            record["matches_archived_release_binary"] = matches
            record["archived_release_version"] = RELEASE_VERSION
            expected = record["expected_bin_sha256"]
            record["matches_expected_binary"] = hashes["pixljs.bin"] == expected if expected else None
            if preview and (hashes["pixljs.bin"] != preview["application_sha256"] or source_id != preview["source_id"]):
                raise RuntimeError("Preview binary SHA-256 or source ID differs from RELEASE_INFO.json.")
            if args.mode == "release" and not matches:
                raise RuntimeError("Release binary SHA-256 mismatch; no firmware artifacts exported. See build.log.")
            if args.stack_report:
                if args.backend == "docker":
                    with tarfile.open(export / "stack-usage.tar") as usage:
                        usage.extractall(export / "stack-usage", filter="data")
                stack = stack_report(export / "stack-usage")
                stack_path = destination / "STACK_USAGE.json"
                stack_path.write_text(json.dumps(stack, indent=2) + "\n", encoding="utf-8")
                shutil.copytree(export / "stack-usage", destination / "stack-usage")
                record["stack_usage"] = {"report_sha256": sha256(stack_path),
                                         "files": len(stack["compiler_files_sha256"]),
                                         "frames": stack["frame_count"]}
            for name in (*ARTIFACTS, "production-inputs.json"):
                shutil.copyfile(export / name, destination / name)
            record["status"] = "passed" if args.mode in ("release", "preview") else "unsigned_" + args.mode
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
