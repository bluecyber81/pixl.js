#!/usr/bin/env python3
"""Verify fixed public ZIP chunks and create only their exact GitHub Git blob.

The ZIP and its embedded builder are data. Nothing from the archive is executed.
No ref, tag, release, workflow dispatch or repository setting is changed.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import urllib.error
import urllib.request
import zipfile

REPOSITORY = "bluecyber81/pixl.js"
BRANCH = "publish/web365-source-object"
BASE = "c18bfb4665c493a37a807415cc2437ccddad4bbd"
EXPECTED_HELPER_PARENT = "e538446621df0a32826863b4e0632992a678f8a5"
QUALIFIED = "a0f4fd3ac69fe6cd84ea14ef3e42cfc9a44d5fe4"
WEB_TREE = "17920de14a71fc2a07b00b644e88e6956bfe7d06"
HELPER_PATH = "tools/publish-web365-source-object"
WORKFLOW_PATH = ".github/workflows/publish-web365-source-object.yml"
MANIFEST_SHA256 = "8761a59bd94f2caad7c9d2348d862f3cd90c7978dc67d092e0eabb9ec41e51cf"
ZIP_BYTES = 21249310
ZIP_SHA256 = "de82839b8cdc90f7226b1229119ebbd60a1a5cd67deb4c80e0902a640d8c487c"
ZIP_BLOB = "c504ca28f6c4ef2d8ecaae942887b64b275fbcd1"
SOURCE_MANIFEST_SHA256 = "41b60637dcbaf626571d3eb8ad6c45fd6f41a08c45e23d4548990d0b3f258fd5"
BUILDER_SHA256 = "5ecf8b8815fc1bcd82ccc8adfb732d134b78d38e16eeebf720ee0f38844a33d5"
API_URL = "https://api.github.com/repos/bluecyber81/pixl.js/git/blobs"
HELPER = Path(__file__).resolve().parent
REPO = HELPER.parents[1]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def blob_sha(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=REPO).decode().strip()


def regular_file(path, size=None):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode), "Expected a regular data file, not a symlink")
    require(size is None or info.st_size == size, "Data file size differs from the fixed manifest")
    return path.read_bytes()


def require_git_file(relative_path, data, expected_blob=None):
    row = git("ls-tree", "HEAD", "--", relative_path)
    identity, name = row.split("\t", 1)
    mode, kind, stored_blob = identity.split()
    require(name == relative_path and mode == "100644" and kind == "blob", "Unexpected checked-out data entry")
    require(stored_blob == blob_sha(data), "Working file differs from the checked-out immutable Git blob")
    require(expected_blob is None or stored_blob == expected_blob, "Chunk Git blob differs from the fixed manifest")


def checkout_identity():
    head = git("rev-parse", "HEAD")
    require(re.fullmatch(r"[0-9a-f]{40}", head) is not None, "Invalid checkout commit")
    headers = git("cat-file", "-p", "HEAD").split("\n\n", 1)[0]
    parents = [line.split(" ", 1)[1] for line in headers.splitlines() if line.startswith("parent ")]
    require(parents == [EXPECTED_HELPER_PARENT], "Helper commit is not based directly on the approved public helper predecessor")
    return head


def require_github_context(head):
    expected = {"GITHUB_ACTIONS": "true", "GITHUB_REPOSITORY": REPOSITORY,
        "GITHUB_EVENT_NAME": "push", "GITHUB_REF": "refs/heads/" + BRANCH,
        "GITHUB_SHA": head, "GITHUB_SERVER_URL": "https://github.com",
        "GITHUB_API_URL": "https://api.github.com",
        "GITHUB_WORKFLOW_REF": REPOSITORY + "/" + WORKFLOW_PATH + "@refs/heads/" + BRANCH}
    for key, value in expected.items():
        require(os.environ.get(key) == value, "Publication context mismatch: " + key)
    require(git("remote", "get-url", "origin") in {
        "https://github.com/" + REPOSITORY, "https://github.com/" + REPOSITORY + ".git"},
        "Unexpected checkout origin")
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    require(bool(event_path), "Missing GitHub push event")
    event = json.loads(Path(event_path).read_bytes())
    require(event.get("repository", {}).get("full_name") == REPOSITORY and
        event.get("ref") == "refs/heads/" + BRANCH and event.get("after") == head and
        event.get("deleted") is False and event.get("forced") is False,
        "The push event does not authorize this exact helper checkout")


def verify_zip_identity(data):
    require(len(data) == ZIP_BYTES, "Whole ZIP byte count differs")
    require(sha(data) == ZIP_SHA256, "Whole ZIP SHA-256 differs")
    require(blob_sha(data) == ZIP_BLOB, "Whole ZIP Git blob differs")


def verify_artifact():
    head = checkout_identity()
    manifest_raw = regular_file(HELPER / "manifest.json")
    require(sha(manifest_raw) == MANIFEST_SHA256, "Manifest differs from its hardcoded SHA-256")
    require_git_file(HELPER_PATH + "/manifest.json", manifest_raw)
    require_git_file(HELPER_PATH + "/run.py", regular_file(HELPER / "run.py"))
    manifest = json.loads(manifest_raw)
    require(manifest["repository"] == REPOSITORY and manifest["helperBranch"] == BRANCH and
        manifest["baseCommit"] == manifest["sourceCommit"] == BASE and
        manifest["qualifiedBuildCommit"] == QUALIFIED and manifest["sourceWebSubtree"] == WEB_TREE,
        "Manifest provenance differs from the fixed release")
    require(len(manifest["chunks"]) == 3, "Expected exactly three source data chunks")
    pieces = []
    for index, chunk in enumerate(manifest["chunks"], 1):
        expected_path = f"chunks/source-{index:03d}.part"
        require(chunk["path"] == expected_path, "Chunk path or order differs")
        data = regular_file(HELPER / expected_path, chunk["bytes"])
        require(sha(data) == chunk["sha256"] and blob_sha(data) == chunk["gitBlob"], "Chunk content hash differs")
        require_git_file(HELPER_PATH + "/" + expected_path, data, chunk["gitBlob"])
        pieces.append(data)
    archive_data = b"".join(pieces)
    verify_zip_identity(archive_data)
    prefix = "Allmiibo_Dateimanager_3_65_0_Quellcode/"
    with zipfile.ZipFile(io.BytesIO(archive_data)) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)) == 1894, "Unexpected ZIP entry count or duplicate name")
        require(all(name.startswith(prefix) and not PurePosixPath(name).is_absolute() and
            ".." not in PurePosixPath(name).parts and "\\" not in name for name in names), "Unsafe ZIP entry name")
        require(archive.testzip() is None, "ZIP CRC verification failed")
        source_manifest_raw = archive.read(prefix + "SOURCE_MANIFEST.json")
        require(sha(source_manifest_raw) == SOURCE_MANIFEST_SHA256, "Embedded source manifest differs")
        source_manifest = json.loads(source_manifest_raw)
        require(source_manifest["sourceCommit"] == BASE and source_manifest["qualifiedBuildCommit"] == QUALIFIED and
            source_manifest["sourceWebSubtree"] == WEB_TREE and source_manifest["publicationStatus"] == "public",
            "Embedded source provenance differs")
        require(sha(archive.read(prefix + "SOURCE_ARCHIVE_BUILD.py")) == BUILDER_SHA256, "Embedded builder bytes differ")
    receipt = {"repository": REPOSITORY, "helperCommit": head, "sourceCommit": BASE,
        "qualifiedBuildCommit": QUALIFIED, "manifestSha256": MANIFEST_SHA256,
        "chunksVerified": 3, "bytes": ZIP_BYTES, "sha256": ZIP_SHA256, "gitBlob": ZIP_BLOB,
        "archiveFiles": 1894, "zipCrcVerified": True, "sourceBindingVerified": True,
        "method": "Reassembled fixed data chunks; no code from the ZIP was executed and no compression was performed"}
    return archive_data, receipt


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        raise urllib.error.URLError("Authenticated GitHub requests must not follow redirects")


def upload_blob(data, token):
    # Keep the exact-byte gate at the only network-writing function as well.
    verify_zip_identity(data)
    require(isinstance(token, str) and bool(token) and all(33 <= ord(character) <= 126 for character in token),
        "Missing or invalid job-scoped GITHUB_TOKEN")
    payload = json.dumps({"content": base64.b64encode(data).decode("ascii"), "encoding": "base64"},
        separators=(",", ":")).encode()
    request = urllib.request.Request(API_URL, data=payload, method="POST", headers={
        "Authorization": "Bearer " + token, "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json",
        "User-Agent": "Allmiibo-Web365-Source-Object"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=60) as response:
            require(response.status == 201 and response.geturl() == API_URL, "Unexpected GitHub blob POST response")
            result_raw = response.read(1024 * 1024 + 1)
            require(len(result_raw) <= 1024 * 1024, "Unexpectedly large GitHub API response")
    except urllib.error.HTTPError as error:
        raise RuntimeError("GitHub blob POST failed with HTTP " + str(error.code)) from None
    except urllib.error.URLError:
        raise RuntimeError("GitHub blob POST failed; no redirect or alternate host was followed") from None
    result = json.loads(result_raw)
    require(result.get("sha") == ZIP_BLOB and result.get("url") == API_URL + "/" + ZIP_BLOB,
        "GitHub did not return the exact expected blob identity")
    return {"uploadedGitBlob": result["sha"], "gitBlobUrl": result["url"], "authenticatedRequests": 1,
        "requestMethod": "POST", "requestEndpoint": API_URL, "refsChanged": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["verify", "publish"])
    args = parser.parse_args()
    if args.mode == "publish":
        require_github_context(checkout_identity())
    data, receipt = verify_artifact()
    if args.mode == "publish":
        receipt.update(upload_blob(data, os.environ.get("GITHUB_TOKEN")))
    else:
        receipt.update(authenticatedRequests=0, remoteMutation=False)
    print(json.dumps(receipt, sort_keys=True))


if __name__ == "__main__":
    main()
