# cmpdir.py A B — two renders of the film against each other, frame by frame (files with the same names, as seq.mjs
# writes them): how many frames differ at all, and the ten that differ most (largest difference of a channel, mean
# difference, name). "The frames are the same as before a change" means: `frames that differ: 0`.
import sys, os, numpy as np
from PIL import Image
a, b = sys.argv[1], sys.argv[2]
names = sorted(set(os.listdir(a)) & set(os.listdir(b)))
only = (set(os.listdir(a)) ^ set(os.listdir(b)))
worst = []
for name in names:
    x = np.asarray(Image.open(os.path.join(a, name)).convert('RGB'), dtype=np.int16)
    y = np.asarray(Image.open(os.path.join(b, name)).convert('RGB'), dtype=np.int16)
    d = np.abs(x - y)
    if d.max() > 0: worst.append((int(d.max()), round(float(d.mean()), 5), name))
print(f'{len(names)} frames compared ({names[0]} .. {names[-1]}); in one directory only: {len(only)}; frames that differ: {len(worst)}')
for w in sorted(worst, reverse=True)[:10]: print('  ', w)
