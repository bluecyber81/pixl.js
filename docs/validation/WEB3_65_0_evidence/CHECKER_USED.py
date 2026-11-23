#!/usr/bin/env python3
"""Check the prepared Pages delivery with ordinary HTTP GETs after deployment.

Without --execute this prints the local plan and makes no network requests.
Execution requires a successful Pages workflow receipt for the exact prepared
tree. The checker does not control a browser or mutate any remote state.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
PREP = ROOT / "build_20261123/pages_preparation"
BASE_URL = "https://bluecyber81.github.io/pixl.js/"
HEADERS = ("Content-Type", "Content-Length", "Content-Encoding", "ETag", "Last-Modified",
    "Cache-Control", "Age", "Expires", "Date", "X-Cache", "X-Cache-Hits", "X-Served-By",
    "Via", "X-GitHub-Request-Id", "Retry-After")
RETRY_HTTP = {404, 408, 425, 429, 500, 502, 503, 504}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def utc():
    return datetime.now(timezone.utc).isoformat()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(path)


def validate_manifest(path, preparation, expected_files):
    raw = path.read_bytes()
    manifest = json.loads(raw)
    require(manifest["baseUrl"] == BASE_URL, "Unexpected public base URL")
    require(sha(raw) == preparation["deliveryManifestSha256"], "Delivery manifest no longer matches the preparation receipt")
    require(manifest["sourceCommit"] == preparation["sourceCommit"], "Web source provenance differs")
    require(len(manifest["files"]) == expected_files, "Unexpected manifest file count")
    names = set()
    for item in manifest["files"]:
        name = item["path"]
        relative = PurePosixPath(name)
        require(name and not relative.is_absolute() and ".." not in relative.parts and
            str(relative) == name and not any(c in name for c in "\\\0\r\n?#"), "Unsafe manifest path")
        require(name not in names, "Duplicate manifest path")
        names.add(name)
        require(type(item["bytes"]) is int and item["bytes"] >= 0 and
            re.fullmatch(r"[0-9a-f]{64}", item["sha256"]), "Invalid manifest size or hash")
    return manifest, sha(raw)


def deployment_gate(path, preparation):
    require(path is not None, "--deployment-evidence is required with --execute")
    raw = path.read_bytes()
    data = json.loads(raw)
    for _ in range(4):
        if isinstance(data, dict) and isinstance(data.get("structuredContent"), dict):
            data = data["structuredContent"]
        elif isinstance(data, dict) and isinstance(data.get("content"), str) and data["content"].lstrip().startswith("{"):
            data = json.loads(data["content"])
        elif isinstance(data, dict) and isinstance(data.get("run"), dict):
            data = data["run"]
        else:
            break
    def get(*keys):
        return next((data[k] for k in keys if data.get(k) is not None), None)
    run_id = get("runId", "run_id", "id")
    head = get("headCommit", "head_sha", "headSha")
    branch = get("headBranch", "head_branch", "branch")
    tree = get("tree", "headTree") or data.get("head_commit", {}).get("tree_id")
    name = get("workflowName", "name")
    require(get("status", "runStatus") == "completed" and get("conclusion", "runConclusion") == "success",
        "Pages deployment has not completed successfully")
    require(type(run_id) is int and run_id > 0 and isinstance(head, str) and re.fullmatch(r"[0-9a-f]{40}", head),
        "Missing deployment run identity")
    require(branch == "gh-pages" and isinstance(name, str) and "pages" in name.lower(), "Receipt is not a Pages deployment run")
    require(tree == preparation["localTree"], "Successful deployment does not identify the exact prepared Pages tree")
    return {"runId": run_id, "headCommit": head, "headBranch": branch, "tree": tree,
        "workflowName": name, "status": "completed", "conclusion": "success",
        "url": "https://github.com/bluecyber81/pixl.js/actions/runs/" + str(run_id),
        "evidence": str(path), "evidenceSha256": sha(raw)}


def previous_fingerprints(preparation, items):
    """Only known different bytes from the previous public Pages commit are cache evidence."""
    repo = Path(preparation["pagesCheckout"])
    ref = preparation["basePagesCommit"]
    def git(*args):
        return subprocess.check_output(["git", *args], cwd=repo)
    paths = {item["path"]: item for item in items}
    changed = git("diff", "--name-only", "-z", ref, preparation["localCommit"]).decode().split("\0")[:-1]
    tree = {}
    for line in git("ls-tree", "-rz", "--full-tree", ref).split(b"\0"):
        if line:
            identity, name = line.split(b"\t", 1)
            tree[name.decode()] = identity.decode().split()[2]
    known = {}
    for name in changed:
        if name in paths and name in tree:
            data = git("cat-file", "blob", tree[name])
            digest = sha(data)
            if digest != paths[name]["sha256"]:
                known[name] = {"bytes": len(data), "sha256": digest, "commit": ref}
    return known


class RestrictedRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self):
        self.history = []

    def redirect_request(self, request, fp, code, message, headers, new_url):
        target = urllib.parse.urlsplit(new_url)
        self.history.append({"status": code, "from": request.full_url, "to": new_url})
        if target.scheme != "https" or target.netloc != "bluecyber81.github.io" or not target.path.startswith("/pixl.js/"):
            raise urllib.error.URLError("Unexpected redirect outside the requested Pages origin/path")
        return super().redirect_request(request, fp, code, message, headers, new_url)


def fetch(item, mode, sequence, deployment, known, timeout, stamp):
    canonical = BASE_URL + urllib.parse.quote(item["path"], safe="/")
    requested = canonical
    request_headers = {"User-Agent": "Allmiibo-Pages-Verification/3.65.0", "Accept-Encoding": "identity"}
    if mode == "cache-busted":
        requested += "?verify=app675-" + deployment["headCommit"][:12] + "-" + stamp + "-" + str(sequence)
        request_headers["Cache-Control"] = "no-cache"
    row = {"sequence": sequence, "mode": mode, "requestedUrl": requested, "startedAt": utc(), "passed": False}
    redirects = RestrictedRedirect()
    start = time.monotonic()
    try:
        request = urllib.request.Request(requested, headers=request_headers, method="GET")
        opener = urllib.request.build_opener(redirects)
        try:
            response = opener.open(request, timeout=timeout)
        except urllib.error.HTTPError as error_response:
            response = error_response
        with response:
            row["status"] = response.status
            row["finalUrl"] = response.geturl()
            row["headers"] = {key: response.headers.get(key) for key in HEADERS if response.headers.get(key) is not None}
            parsed = urllib.parse.urlsplit(row["finalUrl"])
            row["pathMatches"] = parsed.scheme == "https" and parsed.netloc == "bluecyber81.github.io" and parsed.path == urllib.parse.urlsplit(canonical).path
            digest, size = hashlib.sha256(), 0
            limit = max(item["bytes"] + 1024 * 1024, 2 * 1024 * 1024)
            complete = True
            while chunk := response.read(256 * 1024):
                size += len(chunk)
                digest.update(chunk)
                if size > limit:
                    complete = False
                    break
            row["bodyComplete"] = complete
            row["bytes"] = size
            row["sha256" if complete else "partialBodySha256"] = digest.hexdigest()
            row["bytesMatch"] = complete and size == item["bytes"]
            row["sha256Matches"] = complete and digest.hexdigest() == item["sha256"]
            row["passed"] = row["status"] == 200 and row["pathMatches"] and row["bytesMatch"] and row["sha256Matches"]
            old = known.get(item["path"])
            row["matchesPreviousPublicBytes"] = bool(complete and old and size == old["bytes"] and digest.hexdigest() == old["sha256"])
            if row["passed"]:
                row["outcome"] = "verified"
            elif row["status"] != 200:
                row["outcome"] = "http-error"
            elif not row["pathMatches"]:
                row["outcome"] = "unexpected-final-path"
            elif row["matchesPreviousPublicBytes"]:
                row["outcome"] = "previous-public-bytes-observed"
                row["previousPublicCommit"] = old["commit"]
            elif not complete:
                row["outcome"] = "response-size-limit-exceeded"
            else:
                row["outcome"] = "unexplained-byte-or-hash-mismatch"
    except Exception as error:
        row.update(outcome="request-error", errorType=type(error).__name__, error=str(error))
    row["redirects"] = redirects.history
    row["elapsedSeconds"] = round(time.monotonic() - start, 3)
    return row


def retryable(row):
    return row["outcome"] in {"request-error", "previous-public-bytes-observed", "unexplained-byte-or-hash-mismatch"} or row.get("status") in RETRY_HTTP


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=PREP / "DELIVERY_MANIFEST.json")
    parser.add_argument("--preparation", type=Path, default=PREP / "PAGES_PREPARATION.json")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent / "results")
    parser.add_argument("--expected-files", type=int, default=323)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--deployment-evidence", type=Path)
    parser.add_argument("--retry-report", type=Path, help="Recheck only unresolved canonical paths from this previous report")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--timeout", type=float, default=30)
    parser.add_argument("--retry-delay", type=float, default=3)
    parser.add_argument("--max-attempts", type=int, default=3, choices=(1, 2, 3))
    args = parser.parse_args()
    require(1 <= args.workers <= 12 and 0 < args.timeout <= 60 and 0 <= args.retry_delay <= 30, "Invalid concurrency or time bounds")
    preparation = json.loads(args.preparation.read_bytes())
    manifest, manifest_sha = validate_manifest(args.manifest, preparation, args.expected_files)
    plan = {"baseUrl": BASE_URL, "expectedFiles": len(manifest["files"]), "expectedBytes": sum(x["bytes"] for x in manifest["files"]),
        "manifestSha256": manifest_sha, "expectedPagesTree": preparation["localTree"], "sourceCommit": manifest["sourceCommit"],
        "workers": args.workers, "maxAttemptsPerPath": args.max_attempts}
    if not args.execute:
        print(json.dumps({"status": "prepared-no-http-requests", **plan}, indent=2))
        return 0
    deployment = deployment_gate(args.deployment_evidence, preparation)
    started = utc()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    known = previous_fingerprints(preparation, manifest["files"])
    records = {x["path"]: {"path": x["path"], "expectedBytes": x["bytes"], "expectedSha256": x["sha256"], "attempts": []} for x in manifest["files"]}
    inherited_from = None
    if args.retry_report:
        previous_raw = args.retry_report.read_bytes()
        previous = json.loads(previous_raw)
        require(previous["manifestSha256"] == manifest_sha and previous["deployment"]["headCommit"] == deployment["headCommit"], "Retry report identifies another delivery")
        require({r["path"] for r in previous["results"]} == set(records), "Retry report path coverage differs")
        records = {r["path"]: r for r in previous["results"]}
        inherited_from = {"path": str(args.retry_report), "sha256": sha(previous_raw), "onlyPreviouslyUnresolvedPathsRechecked": True}
    selected = [x for x in manifest["files"] if not records[x["path"]].get("passed", False)]
    requested_count = 0
    for round_number in range(args.max_attempts):
        if not selected:
            break
        if round_number:
            time.sleep(args.retry_delay)
        mode = "cache-busted" if round_number == 1 else "canonical"
        print(json.dumps({"round": round_number + 1, "mode": mode, "paths": len(selected)}), flush=True)
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {pool.submit(fetch, item, mode, len(records[item["path"]]["attempts"]) + 1, deployment, known, args.timeout, stamp): item for item in selected}
            completed = 0
            for future in as_completed(futures):
                item = futures[future]
                result = future.result()
                record = records[item["path"]]
                record["attempts"].append(result)
                record["passed"] = result["passed"] and mode == "canonical"
                requested_count += 1
                completed += 1
                if not result["passed"]:
                    print(json.dumps({"path": item["path"], "mode": mode, "outcome": result["outcome"], "status": result.get("status")}), flush=True)
                elif completed % 40 == 0:
                    print(json.dumps({"completedThisRound": completed, "totalThisRound": len(selected)}), flush=True)
        selected = [x for x in selected if not records[x["path"]].get("passed", False) and
            (records[x["path"]]["attempts"][-1]["passed"] or retryable(records[x["path"]]["attempts"][-1]))]
    results = [records[x["path"]] for x in manifest["files"]]
    for record in results:
        record["cacheBustedBytesVerified"] = any(a["mode"] == "cache-busted" and a["passed"] for a in record["attempts"])
        record["previousPublicBytesObserved"] = any(a.get("matchesPreviousPublicBytes") for a in record["attempts"])
        record["passed"] = bool(record.get("passed", False))
    passed = [r for r in results if r["passed"]]
    failures = [r for r in results if not r["passed"]]
    summary = {"schema": 1, "status": "passed" if not failures else "unresolved-http-or-cache-failures",
        "startedAt": started, "completedAt": utc(), **plan, "deployment": deployment, "requestsThisRun": requested_count,
        "verifiedFiles": len(passed), "verifiedBytes": sum(r["expectedBytes"] for r in passed), "failed": len(failures),
        "canonicalUrlSuccessRequired": True, "cacheBustedOnlyFiles": sum(r["cacheBustedBytesVerified"] and not r["passed"] for r in results),
        "previousPublicBytesObservedFiles": sum(r["previousPublicBytesObserved"] for r in results),
        "inheritedResults": inherited_from, "scope": "Ordinary HTTP GET byte/size/path verification; no browser, Bluetooth or device test.",
        "retryPolicy": "Canonical GET; only observed failures retried with a cache-busting query; final canonical recheck. Unresolved canonical failures remain failures."}
    report = {**summary, "results": results}
    write_json(args.output / "HTTP_RESULTS.json", report)
    write_json(args.output / "HTTP_SUMMARY.json", {**summary, "failures": failures})
    print(json.dumps({key: summary[key] for key in ["status", "verifiedFiles", "expectedFiles", "verifiedBytes", "failed", "cacheBustedOnlyFiles", "requestsThisRun"]}), flush=True)
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
