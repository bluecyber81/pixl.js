#!/usr/bin/env python3
"""Convert a directory of still images to a PIXV animation for the 128×64 player."""
import argparse
import os
from pathlib import Path
import struct
import tempfile

from PIL import Image


HEADER = struct.Struct("<IHHHHI")
MAGIC = 0x50495856


def write_clip(fps, input_dir, output_file):
    if not 1 <= fps <= 60:
        raise ValueError("frame rate must be between 1 and 60 fps")
    output_file = output_file.parent.resolve() / output_file.name
    frames = sorted(input_dir.resolve().iterdir(), key=lambda path: path.name)
    if output_file in frames:
        # Allow re-export next to the inputs, but never replace a source image.
        with output_file.open("rb") as previous:
            if previous.read(4) != struct.pack("<I", MAGIC):
                raise ValueError(f"output would replace an input: {output_file.name}")
        frames.remove(output_file)
    if not 1 <= len(frames) <= 65535:
        raise ValueError("the input directory must contain 1 to 65535 image frames")

    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=output_file.parent, delete=False) as stream:
            temporary = Path(stream.name)
            for index, path in enumerate(frames):
                if not path.is_file():
                    raise ValueError(f"expected an image file: {path.name}")
                with Image.open(path) as image:
                    if index == 0:
                        width, height = image.size
                        if not (1 <= width <= 128 and 1 <= height <= 64):
                            raise ValueError(f"{path.name}: {width}×{height} exceeds the 128×64 display")
                        stream.write(HEADER.pack(MAGIC, len(frames), fps, width, height, 0))
                    elif image.size != (width, height):
                        raise ValueError(f"{path.name}: expected {width}×{height}, got {image.width}×{image.height}")
                    # Preserve Pillow's original one-bit dithering. The player's
                    # XBM rows use dark=1, least significant pixel first, with padding.
                    with image.convert("1") as mono:
                        stream.write(mono.tobytes("raw", "1;IR"))
            size = stream.tell()
        os.replace(temporary, output_file)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return len(frames), width, height, size


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fps", type=int, help="frames per second (1–60)")
    parser.add_argument("input_dir", type=Path, help="images of equal size, in filename order")
    parser.add_argument("output_file", type=Path, help="destination PIXV file")
    args = parser.parse_args()
    try:
        count, width, height, size = write_clip(args.fps, args.input_dir, args.output_file)
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError) as exc:
        parser.exit(1, f"Cannot create clip: {exc}\n")
    print(f"successfully created {args.output_file.name} with {width}x{height}@{args.fps}fps, "
          f"{count} frames, {size} bytes")


if __name__ == "__main__":
    main()
