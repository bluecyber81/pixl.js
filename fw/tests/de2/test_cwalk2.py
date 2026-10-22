"""Host-test actual cwalk2 and bundled cwalk, no filesystem or device actions."""
import argparse
import os
from pathlib import Path
import shlex
import subprocess
import tempfile


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cc",default=os.environ.get("CC","gcc"))
    parser.add_argument("--sanitize",action="store_true")
    args=parser.parse_args()
    tests=Path(__file__).resolve().parent
    fw=tests.parents[1]
    src=fw/"application/src"
    with tempfile.TemporaryDirectory(prefix="pixl-cwalk2-de2-") as tmp:
        temp=Path(tmp);(temp/"boards.h").write_text("")
        exe=temp/("cwalk2.exe" if os.name=="nt" else "cwalk2")
        command=shlex.split(args.cc)+["-std=c11","-O1","-g","-Wall","-Wextra","-I",str(temp)]
        for folder in (src/"mod",src/"mod/vfs",fw/"components/cwalk/include"):
            command += ["-I",str(folder)]
        if args.sanitize:
            command += ["-fsanitize=address,undefined","-fno-omit-frame-pointer"]
        command += [str(tests/"cwalk2_host.c"),str(src/"mod/cwalk2.c"),str(fw/"components/cwalk/src/cwalk.c"),"-o",str(exe)]
        subprocess.run(command,check=True,timeout=60)
        subprocess.run([str(exe)],check=True,timeout=30)


if __name__=="__main__":
    main()
