"""Open a real modeled App661 volume with both firmware engines, in both directions."""
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
FW = HERE.parents[1]
sys.path.insert(0, str(FW / "scripts"))
from packed_identity import identity

APP661_ENGINE = "2b27ee2d3f58687f768689893b8ed40bc7ec49ba2c17a02fd9246c0e416d0248"


class SmallCreateCompatibility(unittest.TestCase):
    def test_remount_with_exact_app661_engine(self):
        frozen = FW.parent / "web/third-party/packed-simulator-de355"
        old_core, old_lfs = frozen / "core", frozen / "littlefs"
        current = FW / "application/src/mod/vfs"
        current_lfs = FW / "components/littlefs"

        self.assertEqual(identity(old_core, old_lfs)[1], APP661_ENGINE)
        current_identity = identity(current, current_lfs)[1]
        header = (current / "vfs_packed_identity.h").read_text()
        reported = re.search(r'^#define PIXL_PACKED_ENGINE_SHA256 "([0-9a-f]{64})"$', header, re.M)
        self.assertIsNotNone(reported)
        self.assertEqual(reported[1], current_identity)
        self.assertNotEqual(current_identity, APP661_ENGINE)

        arm = os.environ.get("PIXL_ARM32") == "1"
        sanitizer = os.environ.get("PIXL_SANITIZE") == "1"
        cc = "arm-linux-gnueabihf-gcc" if arm else "gcc"
        flags = ["-static"] if arm else []
        if sanitizer and not arm:
            flags += ["-fsanitize=address,undefined", "-fno-sanitize-recover=all", "-fno-pie", "-no-pie"]
        runner = ["qemu-arm"] if arm else []

        with tempfile.TemporaryDirectory(prefix="packed-small-compat-") as temp:
            root = Path(temp)
            old_exe, new_exe = root / "app661.exe", root / "candidate.exe"
            for core, lfs, exe in ((old_core, old_lfs, old_exe), (current, current_lfs, new_exe)):
                cmd = [cc, "-std=c11", "-O1", "-DLFS_NO_MALLOC", "-DLFS_NO_DEBUG", "-DLFS_NO_WARN",
                       "-DLFS_NO_ERROR", "-DLFS_NO_ASSERT", *flags]
                if exe == new_exe:
                    cmd.append("-DCANDIDATE_WRITER")
                cmd += ["-I"+str(core), "-I"+str(lfs), "-I"+str(HERE), HERE/"packed_small_compat_de389.c",
                        HERE/"packed_vfs_nor_de344.c", core/"packed_fs.c", lfs/"lfs.c", lfs/"lfs_util.c", "-o", exe]
                subprocess.run(cmd, check=True, timeout=120)
            disk = root / "nor.img"
            for exe, phase in ((old_exe, "seed"), (new_exe, "append"), (old_exe, "read")):
                subprocess.run([*runner, exe, disk, phase], check=True, timeout=120)
        print("PASS App661 to current and back: 32 original files with metadata, 128 new files, "
              "zero/one/540/572-byte reads and exclusive-create collisions.")


if __name__ == "__main__":
    unittest.main()
