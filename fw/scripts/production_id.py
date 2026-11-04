"""Reproducible identifier for the checked-in application source inputs."""
import argparse
import hashlib
import json
from pathlib import Path


def source_hashes(fw):
    # A conservative input set. In particular, generated C tables and the
    # version actually compiled are included. The generated header lives
    # under _build, outside these trees. No Git checkout is required.
    fw = Path(fw)
    files = [fw / "application/Makefile", fw / "ld/application.ld", fw / "scripts/production_id.py"]
    for tree in ("application/src", "application/config", "components", "data"):
        for path in (fw / tree).rglob("*"):
            name = path.relative_to(fw)
            if set(name.parts) & {".git", "__pycache__", "_build", "tests", "examples", "nrf52_sdk", "software"}:
                continue
            if path.is_file() and (tree == "data" or path.suffix.lower() in {
                ".c", ".cpp", ".cc", ".h", ".hpp", ".inc", ".def", ".s", ".a", ".lib"}):
                files.append(path)
    return {"fw/" + path.relative_to(fw).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(files)}


def fingerprint(inputs):
    value = json.dumps(inputs, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(value.encode("ascii")).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--header", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    inputs = source_hashes(Path(__file__).resolve().parents[1])
    for path, value in [(args.header, '#define APP_SOURCE_SHA256 "' + fingerprint(inputs) + '"\n'),
                        (args.manifest, json.dumps(inputs, sort_keys=True, indent=2) + "\n")]:
        content = value.encode("utf-8")
        if not path.exists() or path.read_bytes() != content:
            temporary = path.with_suffix(path.suffix + ".tmp")
            temporary.write_bytes(content)
            temporary.replace(path)


if __name__ == "__main__":
    main()
