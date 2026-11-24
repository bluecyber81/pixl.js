# animation player

The animation player can play converted animation files in custom formats. Requires firmware version 2.3.0 or higher.


## Animation file format

The basic format of the file is header + frame1 + frame2 +... + frameN

     # magic + frame_count + fps + width + height + reserved
     # 4b + 2b + 2b + 2b + 2b + 4b = 16 bytes

The header format is as follows

| Field name | Type | Length (bytes) | Description |
| ---- | ----- |---- | ---- |
| magic | bytes | 4 | Fixed prefix, used to quickly determine whether it is an animation file, fixed to 0x56 0x58 0x49 0x50 |
| frame count | uint16 | 2 | How many frames of animation are there in total |
| fps | uint16 | 2 | How many frames of animation per second |
| width | uint16 | 2 | animation width |
| height | uint16 | 2 | animation height |
| reserved | uint32 | 4 | reserved bytes |

Each frame is XBM data with each row padded to a whole byte. Its size is
`((width + 7) / 8) * height` bytes, using integer division.

The DE2 build reads the 16-byte header as little-endian and accepts 1–65535
frames, 1–60 fps, and dimensions from 1×1 to 128×64. Reserved bytes must be zero.
The file must contain exactly the declared number of complete frames, without
trailing data. Invalid or incomplete files stop safely instead of being played.

## How to generate animation files

The converter uses Python and Pillow. FFmpeg is needed only to extract frames from a video. On Ubuntu or WSL, install them with `sudo apt install ffmpeg python3 python3-pil`. On Windows, use your Python interpreter with Pillow and an FFmpeg executable on the search path.

From the repository root, extract frames into an empty folder. This example keeps the first 10 seconds at 10 frames per second and fits the source inside 128 × 64 pixels while preserving its proportions.

```sh
mkdir frames
ffmpeg -i input.mp4 -t 10 -vf "fps=10,scale=128:64:force_original_aspect_ratio=decrease:flags=lanczos,hue=s=0" frames/%04d.bmp
python3 fw/scripts/video_clip_gen.py 10 frames clip.bin
```

Frames are read in filename order. Use 1–65,535 images of the same dimensions and 1–60 frames per second. An invalid frame or rate leaves an existing clip intact. Shorten the clip or reduce its frame size to fit the available device storage.

## Play or stream a clip

In the Allmiibo file manager, upload the completed clip to `E:/player/`. Open Animation Player on the LCD, select the file and press the middle button. On DE3.102 or later, the player also offers Loop and Frame counter for the current session.

To stream a video directly from the PC, open the BLE image receiver on the LCD and run `python3 fw/scripts/stream_video_to_pixl.py input.mp4` with Bleak and FFmpeg installed. The standard video polarity matches the web preview. Use `--invert` to swap black and white.
