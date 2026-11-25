#!/usr/bin/env python3
"""Package a qualified LCD binding without rebuilding or relabeling the simulator.

Run after publishing the production source and setting its immutable commit/tree
in lcd-release-reference.mjs. This script does not execute firmware tests.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile


ROOT = Path(__file__).resolve().parents[2]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encoded(value) -> bytes:
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode()


def load(path: Path):
    return json.loads(path.read_bytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", required=True, type=Path)
    parser.add_argument("--profile", required=True, choices=["de3102", "de41"])
    args = parser.parse_args()
    profile_data = {
        "de3102": ("DE3.102", 675, "lcd-app675-reference.mjs", 23),
        "de41": ("DE4.1", 678, "lcd-release-reference.mjs", 25),
    }
    short_version, counter, reference_file, release_day = profile_data[args.profile]
    stem = short_version.replace(".", "_")
    text = (ROOT / "web/public/dfu" / reference_file).read_text()
    match = re.search(r"export const lcdRelease = Object\.freeze\((\{.*?\})\);", text, re.S)
    assert match, "The current LCD release reference must be a literal JSON object"
    release = json.loads(match.group(1))
    assert release["firmwareVersion"] == "2.22.0-" + short_version and release["applicationCounter"] == counter
    for field in ["productionCommit", "sourceCommit", "productionTree", "localProductionCommit"]:
        assert re.fullmatch(r"[a-f0-9]{40}", release[field]), f"Missing immutable {field}"
    assert release["sourceCommit"] == release["productionCommit"]

    qualification_path = f"docs/validation/{stem}_PFS.json"
    inputs_path = f"docs/validation/{stem}_PRODUCTION_INPUTS.json"
    cross_path = "docs/validation/DE3_99_CROSS_MOUNT.json"
    previous_path = "docs/validation/DE3_99_PFS.json"
    snapshot = "web/third-party/packed-simulator-de399"
    wasm_path = "web/public/lfs-capacity-de399.wasm"
    qualification = load(ROOT / qualification_path)
    inputs = load(ROOT / inputs_path)
    build = load(args.build / "BUILD_RESULT.json")
    pinned = load(ROOT / snapshot / "SOURCE_BINDING.json")
    assert build["exit_code"] == 0 and build["board"] == "LCD"
    assert build["counter"] == release["applicationCounter"]
    assert build["version"] == release["firmwareVersion"]
    assert qualification["counter"] == release["applicationCounter"]
    assert qualification["firmware"] == release["firmwareVersion"]
    assert qualification["capacityProfile"] == args.profile
    assert qualification["sourceId"] == release["sourceId"] == build["source_id_sha256"]
    assert qualification["sourceFiles"] == len(inputs) == build["source_input_count"]
    assert (ROOT / inputs_path).read_bytes() == (args.build / "production-inputs.json").read_bytes()
    assert qualification["elfLoadBytesCompared"] == release["applicationBytes"]
    assert qualification["buildArtifacts"]["pixljs.bin"] == release["applicationBinSha256"]
    for name, digest in qualification["buildArtifacts"].items():
        assert sha((args.build / name).read_bytes()) == digest == build["artifacts_sha256"][name], name
    assert qualification["simulatorProfile"] == "de399"
    assert qualification["crossMountEvidenceMode"] == "reused-identical-engine"
    assert qualification["crossMountOriginFirmware"] == "2.22.0-DE3.99"
    assert sha((ROOT / cross_path).read_bytes()) == qualification["crossMountReportSha256"]
    assert sha((ROOT / previous_path).read_bytes()) == qualification["previousQualificationSha256"]
    assert len(qualification["armLayoutCases"]) == 4
    wasm = (ROOT / wasm_path).read_bytes()
    assert sha(wasm) == qualification["wasmSha256"]
    assert qualification["engine"] == load(ROOT / previous_path)["engine"]
    for name, digest in pinned["sourceFiles"].items():
        assert sha((ROOT / snapshot / name).read_bytes()) == digest, name
    for name, digest in qualification["engine"]["manifest"]["files"].items():
        prefix = "fw/application/src/mod/vfs/" if name.startswith("packed_") else "fw/components/littlefs/"
        assert inputs[prefix + name] == digest, name
    assert inputs["fw/application/src/mod/vfs/vfs_driver_packed.c"] == qualification["adapterSha256"]

    binding = {**release, "capacityProfile": args.profile, "simulatorProfile": "de399",
        "simulatorReuse": f"Byte-identical App672 engine and WASM; App{counter} production identity and linked ARM layout are independently bound.",
        "sourceSnapshot": {"path": snapshot, "sourceFiles": pinned["sourceFiles"],
            "sourceBindingSha256": sha((ROOT / snapshot / "SOURCE_BINDING.json").read_bytes()),
            "engineIdentitySha256": sha((ROOT / snapshot / "ENGINE_IDENTITY.json").read_bytes())},
        "wasm": {"path": wasm_path, "bytes": len(wasm), "sha256": sha(wasm)},
        "productionInputsPath": inputs_path,
        "productionInputsSha256": sha((ROOT / inputs_path).read_bytes()),
        "productionInputCount": len(inputs),
        "qualification": {"path": qualification_path, "sha256": sha((ROOT / qualification_path).read_bytes()),
            "linkedArmLayoutCases": len(qualification["armLayoutCases"]),
            "crossMountReportPath": cross_path, "crossMountReportSha256": qualification["crossMountReportSha256"],
            "crossMountCases": qualification["capacityCrossMount"]["cases"],
            "crossMountExecutedForThisRelease": False,
            "crossMountOriginFirmware": qualification["crossMountOriginFirmware"]},
        "productionSourceUrl": "https://github.com/bluecyber81/pixl.js/tree/" + release["productionCommit"]}
    files = {name: (ROOT / name).read_bytes() for name in [
        qualification_path, inputs_path, cross_path, previous_path, wasm_path,
        "web/scripts/build-capacity-de399.py", "web/scripts/qualify-lcd-capacity.py",
        "web/scripts/package-lcd-simulator-sources.py",
        *[snapshot + "/" + name for name in [
            "ENGINE_IDENTITY.json", "GPL-2.0-LICENSE", "LITTLEFS-LICENSE.md", "SOURCE.txt", "SOURCE_BINDING.json",
            *pinned["sourceFiles"]]]
    ]}
    files[f"APP{counter}_BINDING.json"] = encoded(binding)
    files[f"BUILD_RESULT_APP{counter}.json"] = (args.build / "BUILD_RESULT.json").read_bytes()
    files[f"README_APP{counter}.txt"] = f"""LCD {short_version} / App{counter} – Simulatorquellen und tatsächliche Firmwarebindung

PFS1-Engine und lfs-capacity-de399.wasm sind unverändert zur App672-Lieferung.
Das {args.profile}-Profil bindet diese Engine ausschließlich an {short_version} / Zähler {counter}.
APP{counter}_BINDING.json nennt den tatsächlichen Produktionscommit, dessen Tree,
SourceID, signierten OTA-Hash und BIN-Hash. Vollständige Firmwarequellen:
{binding['productionSourceUrl']}

Die zwölf Simulatorquelldateien, Identitätsdateien, Lizenzen und das
Buildskript build-capacity-de399.py entsprechen unverändert der App672-Lieferung.
Für App{counter} wurde kein neuer WASM-Build erzeugt oder behauptet.

{stem}_PFS.json bindet vier frisch ausgeführte Layoutfälle des App{counter}-ARM-ELF,
den ELF/BIN/HEX-Abgleich und {len(inputs)} Produktionsinputs.
Die sechs Cross-Mount-Fälle in DE3_99_CROSS_MOUNT.json sind unveränderte,
bereits ausgeführte App672-Tests. Sie wurden nicht erneut für App{counter} ausgeführt.
Enginequellen, Geometrie, Speicheradapter und WASM wurden bytegleich abgeglichen.

Reproduktion mit vorhandenem passenden App{counter}-Build:
python web/scripts/qualify-lcd-capacity.py --profile {args.profile} --source FIRMWARE_QUELLE
  --build FINALER_BUILD --reuse-cross-report docs/validation/DE3_99_CROSS_MOUNT.json
  --output docs/validation/{stem}_PFS.json
Benötigt vollständige Webquellen, Python mit Unicorn2 und ARM GNU nm/objcopy.

Archiv erneut erstellen, nachdem lcd-release-reference.mjs den richtigen
öffentlichen Produktionscommit und Tree enthält:
python web/scripts/package-lcd-simulator-sources.py --profile {args.profile} --build FINALER_BUILD
Das Archiv enthält den tatsächlich geprüften BUILD_RESULT_APP{counter}.json.
Dessen unsigned_candidate-Status beschreibt den unveränderten Qualifikationsbuild;
die signierte OTA-Identität steht separat in APP{counter}_BINDING.json.

Keine Gerätemessung oder physische Speicherfreigabe wird behauptet.
Das Archiv enthält keine privaten Schlüssel, Nutzerdateien oder Firmware-ZIP.
""".encode()
    archive_path = f"web/public/sources/LCD_{stem}_App{counter}_Simulatorquellen.zip"
    with zipfile.ZipFile(ROOT / archive_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (2026, 11, release_day, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, data, compresslevel=9)
    data = (ROOT / archive_path).read_bytes()
    manifest = {"path": archive_path, "bytes": len(data), "sha256": sha(data), "files": len(files),
        "productionCommit": release["productionCommit"], "productionTree": release["productionTree"],
        "sourceId": release["sourceId"], "capacityProfile": args.profile, "simulatorProfile": "de399", "wasmRebuilt": False}
    (ROOT / f"docs/validation/{stem}_SIMULATOR_SOURCES.json").write_bytes(encoded(manifest))
    print(json.dumps(manifest))


if __name__ == "__main__":
    main()
