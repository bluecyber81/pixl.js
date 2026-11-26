"""Rebuild the web license inventory from the exact npm archives in the lockfile."""
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import tarfile
from urllib.parse import urlsplit
from urllib.request import urlopen

WEB = Path(__file__).resolve().parents[1]
OUT = WEB / "third-party/npm"


def package_notices(item):
    (name, version), entry = item
    url = entry["resolved"]
    if urlsplit(url).hostname != "registry.npmjs.org" or urlsplit(url).scheme != "https":
        raise ValueError(f"Unexpected registry for {name}")
    with urlopen(url, timeout=90) as response:
        data = response.read()
    algorithm, expected = entry["integrity"].split("-", 1)
    if hashlib.new(algorithm, data).digest() != base64.b64decode(expected, validate=True):
        raise ValueError(f"Integrity check failed for {name}")
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        manifests = [m for m in archive.getmembers() if m.isfile() and PurePosixPath(m.name).name == "package.json"]
        manifest = min(manifests, key=lambda m: len(PurePosixPath(m.name).parts))
        archive_root = PurePosixPath(manifest.name).parent
        metadata = json.load(archive.extractfile(manifest))
        if (metadata["name"], metadata["version"]) != (name, version):
            raise ValueError(f"Package identity mismatch for {name}")
        folder = Path("licenses") / (name.lstrip("@").replace("/", "__") + "-" + version)
        notices = []
        for member in sorted(archive.getmembers(), key=lambda m: m.name):
            path = PurePosixPath(member.name)
            if path.parent != archive_root or not member.isfile():
                continue
            filename = path.name
            if not any(word in filename.lower() for word in ("license", "licence", "copying", "notice")):
                continue
            contents = archive.extractfile(member).read()
            relative = folder / filename
            (OUT / folder).mkdir(parents=True, exist_ok=True)
            (OUT / relative).write_bytes(contents)
            notices.append({"file": relative.as_posix(), "sha256": hashlib.sha256(contents).hexdigest()})
    record = {"name": name, "version": version, "declared_license": metadata["license"]}
    for field in ("author", "repository"):
        if field in metadata:
            record[field] = metadata[field]
    return dict(record, notice_files=notices, standalone_notice_found=bool(notices))


def main():
    entries = {}
    for location, entry in json.loads((WEB / "package-lock.json").read_bytes())["packages"].items():
        if location:
            name = entry.get("name", location.rsplit("node_modules/", 1)[-1])
            key = (name, entry["version"])
            if key in entries and entry["integrity"] != entries[key]["integrity"]:
                raise ValueError(f"Conflicting archives for {key}")
            entries[key] = entry
    with ThreadPoolExecutor(max_workers=4) as pool:
        packages = list(pool.map(package_notices, sorted(entries.items())))
    inventory = {"scope": "Runtime, build and optional platform packages pinned in package-lock.json. "
                          "Root license and notice files are copied from integrity-verified npm archives. "
                          "Packages without a standalone notice retain their declared license and provenance.",
                 "packages": packages}
    (OUT / "SOURCES.json").write_bytes((json.dumps(inventory, indent=2, ensure_ascii=False) + "\n").encode())
    print(f"{len(packages)} pinned package identities, including optional platforms")


if __name__ == "__main__":
    main()
