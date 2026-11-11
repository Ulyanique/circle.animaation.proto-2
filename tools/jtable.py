"""jtable.py DIR — orig vs render image motion around the linked borders (LK median px/f, global dx/dy, mean abs diff)"""
import json, sys, subprocess, numpy as np
d = sys.argv[1]; name = d.rstrip('/').split('/')[-1]
orig = {r['f']: r for r in json.load(open('/tmp/work/motion/img_orig.json'))}
for at, a, b in ((335, 320, 350), (469, 454, 484), (577, 562, 592), (656, 641, 671), (739, 724, 754)):
    subprocess.run(['/tmp/tools/venv/bin/python', '/home/user/work/bin/imgflow.py', name + '_%d' % at, 'render:' + d, str(a), str(b)], capture_output=True)
    ours = {r['f']: r for r in json.load(open('/tmp/work/motion/img_%s_%d.json' % (name, at)))}
    print('--- border f%d   f: orig mag (dx,dy) diff | ours mag (dx,dy) diff' % at)
    for f in range(at - 9, at + 10):
        o, r = orig.get(f, {}), ours.get(f, {})
        g = lambda x, k: ('%6.1f' % x[k]) if k in x else '     -'
        print('%4d%s %s (%s,%s) %s | %s (%s,%s) %s' % (f, '*' if f == at else ' ', g(o, 'mag'), g(o, 'dx'), g(o, 'dy'), g(o, 'diff'), g(r, 'mag'), g(r, 'dx'), g(r, 'dy'), g(r, 'diff')))
