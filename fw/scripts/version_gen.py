#!/usb/bin/env python3

import subprocess
import os
import json
import re
from datetime import date, datetime, timezone


class GitVersion:
    def __init__(self, source_dir):
        self.source_dir = source_dir

    def get_version_info(self):
        commit = self._optional_git("rev-parse --short HEAD")
        if not commit or not re.fullmatch(r"[0-9a-fA-F]{4,64}", commit):
            commit = "unknown"

        # Unknown metadata is not evidence of a clean source tree. The legacy
        # firmware bool stays conservative; JSON and KNOWN preserve the distinction.
        dirty = None
        if commit != "unknown":
            try:
                self._exec_git("diff --quiet")
                dirty = False
            except subprocess.CalledProcessError as error:
                if error.returncode == 1:
                    dirty = True
            except (OSError, UnicodeError):
                pass

        # If WORKFLOW_BRANCH_OR_TAG is set in environment, is has precedence
        # (set by CI)
        branch = (
            os.environ.get("WORKFLOW_BRANCH_OR_TAG", None)
            or self._optional_git("rev-parse --abbrev-ref HEAD")
            or ("source-archive" if commit == "unknown" else "unknown")
        )
        if not self._valid_text(branch):
            branch = "source-archive" if commit == "unknown" else "unknown"

        branch_num = self._optional_git("rev-list --count HEAD")
        if not branch_num or not re.fullmatch(r"[0-9]+", branch_num):
            branch_num = "n/a"

        # APP_VERSION from the build environment (set by the Makefile) is the
        # single source of truth for the version string when provided.
        version = os.environ.get("APP_VERSION", None)
        if version is None:
            if commit == "unknown":
                raise ValueError("APP_VERSION is required when Git metadata is unavailable (source archive).")
            ref_type = os.environ.get("GITHUB_REF_TYPE", None)
            if ref_type == "tag":
                version = os.environ.get("GITHUB_REF_NAME", None)
            elif ref_type == "branch":
                run_number = os.environ.get("GITHUB_RUN_NUMBER", "")
                if not re.fullmatch(r"[0-9]+", run_number):
                    raise ValueError("GITHUB_RUN_NUMBER must be numeric, or provide APP_VERSION.")
                version = "b" + run_number
            else:
                version = self._optional_git("describe --tags --abbrev=0 --exact-match") or "unknown"
        if not self._valid_text(version):
            raise ValueError("Firmware version must be nonempty and contain no control characters.")

        return {
            "GIT_COMMIT": commit,
            "GIT_BRANCH": branch,
            "GIT_BRANCH_NUM": branch_num,
            "VERSION": version,
            "BUILD_DIRTY": 0 if dirty is False else 1,
            "BUILD_DIRTY_KNOWN": 0 if dirty is None else 1,
        }

    @staticmethod
    def _valid_text(value):
        return isinstance(value, str) and bool(value.strip()) and all(ord(c) >= 32 and ord(c) != 127 for c in value)

    def _optional_git(self, args):
        try:
            return self._exec_git(args)
        except (subprocess.CalledProcessError, OSError, UnicodeError):
            return None

    def _exec_git(self, args):
        cmd = ["git"]
        cmd.extend(args.split(" "))
        return (
            subprocess.check_output(cmd, cwd=self.source_dir, stderr=subprocess.STDOUT)
            .strip()
            .decode()
        )


class Main(object):

    def get_root_dir(self):
        dirname, filename = os.path.split(os.path.abspath(__file__)) 
        return os.path.normpath(os.path.join(dirname,".."))

    def generate(self):
        current_info = GitVersion(".").get_version_info()

        if "SOURCE_DATE_EPOCH" in os.environ:
            build_date = datetime.fromtimestamp(int(os.environ["SOURCE_DATE_EPOCH"]), timezone.utc)
        else:
            build_date = date.today()

        current_info.update(
            {
                "BUILD_DATE": build_date.strftime("%Y-%m-%d"),
                "TARGET": 0,
            }
        )

        if current_info["VERSION"] == 'unknown' and "APP_VERSION" not in os.environ:
            if "FW_VERSION" in os.environ:
                current_info["VERSION"] = os.environ["FW_VERSION"]
            else:
                current_info["VERSION"] = current_info["GIT_BRANCH"] + "_" + current_info["GIT_COMMIT"]

        version_values = []
        for key in current_info:
            val = current_info[key]
            if isinstance(val, str):
                val = json.dumps(val, ensure_ascii=False)
            version_values.append(f"#define {key} {val}")

        new_version_info_fmt = "\n".join(version_values) + "\n"

        current_version_info = None
        outdir = os.path.join(self.get_root_dir(),"application", "src") 
        version_header_name = os.path.join(outdir, "version.inc.h")
        version_json_name = os.path.join(outdir, "version.json")

        try:
            with open(version_header_name, "r") as file:
                current_version_info = file.read()
        except EnvironmentError as e:
            print(e)

        if current_version_info != new_version_info_fmt:
            print("old: ", current_version_info)
            print("new: ", new_version_info_fmt)
            with open(version_header_name, "w", newline="\n") as file:
                file.write(new_version_info_fmt)
            # os.utime("../lib/toolbox/version.c", None)
            print("Version information updated")
        else:
            print("Version information hasn't changed")

        version_json = {
            "firmware_build_date": current_info["BUILD_DATE"],
            "firmware_commit": current_info["GIT_COMMIT"],
            "firmware_branch": current_info["GIT_BRANCH"],
            "firmware_target": current_info["TARGET"],
            "firmware_build_dirty": (bool(current_info["BUILD_DIRTY"])
                if current_info["BUILD_DIRTY_KNOWN"] else None),
        }
        with open(version_json_name, "w", newline="\n") as file:
            json.dump(version_json, file, indent=4)
        return 0


if __name__ == "__main__":
    m = Main()
    m.generate()
