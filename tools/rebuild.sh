#!/bin/bash
# rebuild.sh SHOT [uvtrack options...] — bake (geometry, raw camera, textures) -> smooth camera -> footage uv track -> smooth trails
set -e
PY=/tmp/tools/venv/bin/python; B=/home/user/work/bin
cd /tmp/work
SHOT="$1"
$PY $B/bake.py "$1" 2>&1 | tail -3 | cut -c1-180
$PY $B/smoothcam.py /home/user/circle.animaation.proto-2/src/shots/data "$1" | tail -1
shift
if [ -n "$1" ]; then $PY $B/uvtrack.py "$@" 2>&1 | sed -n 1,3p; fi
# The light (src/fx/hero.js) is baked against the camera as flown: after any camera change re-bake it too —
#   node dumpposes.mjs /tmp/work/poses_flown.json   (dev server running)
#   $PY $B/heropath.py
echo "camera changed: re-run dumpposes.mjs and heropath.py to re-bake the light"
