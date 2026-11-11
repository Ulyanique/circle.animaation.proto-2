#!/bin/bash
# shoot.sh f1,f2,...  -> renders + builds comparison sheet
export LD_LIBRARY_PATH=/tmp/al2023/lib FONTCONFIG_PATH=/tmp/fonts
cp /home/user/work/bin/shoot.mjs /tmp/tools/shoot.mjs
cd /tmp/tools && node shoot.mjs "$1" 2>&1 | grep -v "^frame" | tail -15
out=$(/tmp/tools/venv/bin/python /home/user/work/bin/cmp.py "$1" ${2:-512}); n=$(date +%H%M%S); cp "$out" "${out%.jpg}_$n.jpg"; echo "${out%.jpg}_$n.jpg"
