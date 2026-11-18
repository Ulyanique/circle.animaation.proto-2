#!/bin/bash
# setup.sh — rebuilds the CHECKING environment outside the repo. Nothing here is needed to run or build the site.
#   /tmp/tools   headless Chromium + puppeteer-core, a python venv (numpy, scipy, pillow, opencv, ffmpeg), the *.mjs tools
#   /tmp/work    the reference film's 1213 frames and scratch space (sheets, renders, poses)
#   /home/user/work/{bin,shots,tracks} -> links into tools/ (the scripts were written against these paths)
# After it: start the dev server (npm run dev), then
#   cd /tmp/tools && export LD_LIBRARY_PATH=/tmp/al2023/lib FONTCONFIG_PATH=/tmp/fonts && node dumpposes.mjs /tmp/work/poses_flown.json
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p /home/user/work /tmp/work/frames /tmp/work/sheets /tmp/work/tex /tmp/work/motion /tmp/tools
ln -sfn "$REPO/tools" /home/user/work/bin
ln -sfn "$REPO/tools/shots" /home/user/work/shots
ln -sfn "$REPO/tools/tracks" /home/user/work/tracks
[ -d "$REPO/node_modules" ] || (cd "$REPO" && npm install --no-audit --no-fund)
cd /tmp/tools
[ -d node_modules ] || { cp "$REPO/tools/headless.package.json" package.json; npm install --no-audit --no-fund; }
[ -d venv ] || { python3 -m venv venv; ./venv/bin/pip install -q --disable-pip-version-check numpy scipy pillow opencv-python-headless imageio-ffmpeg; }
ln -sf "$(./venv/bin/python -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')" ffmpeg
cp "$REPO"/tools/*.mjs .
[ -d /tmp/al2023 ] || node inflate.mjs
# the reference film itself is not in the repo any more: point REFERENCE at a copy to extract its frames
if [ "$(ls /tmp/work/frames | wc -l)" != 1213 ]; then
  [ -n "$REFERENCE" ] || { echo "set REFERENCE=/path/to/the/reference/film.mp4 (or put its 1213 frames in /tmp/work/frames)"; exit 1; }
  ./ffmpeg -v error -i "$REFERENCE" -q:v 2 /tmp/work/frames/f_%04d.jpg
fi
[ -f /tmp/work/motion/img_orig.json ] || (cd /tmp/work && /tmp/tools/venv/bin/python "$REPO/tools/imgflow.py" orig '/tmp/work/frames/f_%04d.jpg' 1 1213 | tail -1)
echo "ready: $(ls /tmp/work/frames | wc -l) frames, node_modules $(ls node_modules | wc -l), python $(./venv/bin/python -c 'import numpy, cv2; print(numpy.__version__, cv2.__version__)')"
