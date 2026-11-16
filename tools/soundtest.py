"""soundtest.py — test sounds for tools/soundtest.mjs and tools/soundershot.mjs, written to OUTDIR as _test_*:

  _test_clicks.wav     48 kHz stereo, 70 s: a quiet tone in each channel (440 Hz left at 0.1, 997 Hz right at 0.05)
                       and a click at each second of CLICKS — one cycle of 2 kHz, 0.9 high, in both channels
  _test_clicks.mp3     the same at 44.1 kHz, MP3
  _test_clicks.m4a     … 48 kHz, AAC
  _test_clicks.ogg     … 44.1 kHz, Vorbis
  _test_clicks.opus    … 48 kHz, Opus
  _test_clicks.flac    … 48 kHz, FLAC
  _test_short.mp3      its first 8 s: music that is over long before the film is
  _test_odd.wav        37.8 kHz, six channels (the front pair carries the signal): a rate and a width no encoder takes
  _test_music.mp3      140 s that look like music — an intro, a verse, a rise, a refrain, a break, the refrain again,
                       an ending — with a hit at second 58 (the refrain comes in). For the picture in the README.

    /tmp/tools/venv/bin/python tools/soundtest.py [OUTDIR]        (default /tmp/work/sound/files; FFMPEG in the
                                                                   environment: the ffmpeg to encode with)
The numbers the checks rely on (CLICKS, the levels) are repeated in tools/soundtest.mjs.
"""
import os
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

out = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/work/sound/files')
out.mkdir(parents=True, exist_ok=True)
FFMPEG = os.environ.get('FFMPEG', '/tmp/tools/ffmpeg')
CLICKS = [0.5, 1.0, 2.25, 5.0, 12.0, 19.0, 30.0, 45.0, 60.0]
SECONDS = 70


def clicks(rate, seconds=SECONDS, channels=2):
    """The test signal: tones and clicks. -> float array (samples, channels)."""
    n = int(seconds * rate)
    t = np.arange(n) / rate
    x = np.zeros((n, channels))
    x[:, 0] = 0.1 * np.sin(2 * np.pi * 440 * t)
    x[:, 1] = 0.05 * np.sin(2 * np.pi * 997 * t)
    k = np.arange(int(round(rate / 2000)))
    for at in CLICKS:
        i = int(round(at * rate))
        if i + len(k) <= n:
            x[i:i + len(k), :2] = (0.9 * np.sin(2 * np.pi * k / len(k)))[:, None]
    return x


def write_wav(path, x, rate):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((np.clip(x, -1, 1) * 32767).round().astype('<i2').tobytes())


def encode(src, dst, *args):
    subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(src), *args, str(dst)], check=True)


def music(rate=44100, seconds=140, bpm=120):
    """Something with the shape of a piece of music: sections of different loudness, a beat, a hit where the refrain comes in."""
    rng = np.random.default_rng(7)
    n = int(seconds * rate)
    t = np.arange(n) / rate
    beat = 60 / bpm
    # how much of each voice sounds, section by section: (from second, pad, drums, bass, lead)
    plan = [(0, 0.5, 0.0, 0.0, 0.0), (16, 0.5, 0.7, 0.6, 0.0), (48, 0.6, 0.35, 0.3, 0.0), (58, 0.8, 1.0, 1.0, 0.8),
            (90, 0.6, 0.0, 0.4, 0.3), (106, 0.8, 1.0, 1.0, 0.8), (130, 0.5, 0.0, 0.0, 0.0)]

    def level(col):
        y = np.zeros(n)
        for i, row in enumerate(plan):
            a = int(row[0] * rate)
            b = int(plan[i + 1][0] * rate) if i + 1 < len(plan) else n
            y[a:b] = row[col]
        # sections do not switch on a single sample
        w = int(0.05 * rate)
        return np.convolve(np.pad(y, w, mode='edge'), np.ones(2 * w + 1) / (2 * w + 1), mode='valid')

    chords = [(220.0, 261.63, 329.63), (174.61, 220.0, 261.63), (130.81, 164.81, 196.0), (196.0, 246.94, 293.66)]
    bar = 4 * beat
    which = (t // bar).astype(int) % len(chords)
    pad = np.zeros(n)
    bass = np.zeros(n)
    lead = np.zeros(n)
    for i, chord in enumerate(chords):
        on = which == i
        for f in chord:
            pad[on] += np.sin(2 * np.pi * f * t[on]) + 0.4 * np.sin(2 * np.pi * 2 * f * t[on] + 0.5)
        root = chord[0] / 2
        phase = (t[on] % (beat / 2)) / (beat / 2)
        bass[on] = np.sin(2 * np.pi * root * t[on]) * np.exp(-3 * phase)
        note = np.array(chord)[(np.floor(t[on] / (beat / 2)).astype(int)) % 3] * 2
        lead[on] = np.sin(2 * np.pi * note * t[on]) * np.exp(-4 * ((t[on] % (beat / 2)) / (beat / 2)))
    pad *= 0.06 * (0.8 + 0.2 * np.sin(2 * np.pi * t / (2 * bar)))
    # drums: a kick on every beat, a hat between the beats, a snare on two and four
    ph = t % beat
    kick = np.sin(2 * np.pi * (48 * ph + 30 * (1 - np.exp(-ph * 30)) / 30 * 4)) * np.exp(-ph * 14)
    hat = rng.standard_normal(n) * np.exp(-((t + beat / 2) % beat) * 60) * 0.25
    two = (t + beat) % (2 * beat)
    snare = rng.standard_normal(n) * np.exp(-two * 22) * 0.4
    drums = 0.55 * kick + hat + snare
    x = level(1) * pad + level(2) * drums * 0.6 + level(3) * bass * 0.32 + level(4) * lead * 0.14
    # the rise before the refrain, and the hit it comes in with
    rise = np.clip((t - 48) / 10, 0, 1) * (t < 58)
    x += rng.standard_normal(n) * 0.10 * rise ** 2
    for at in (58.0, 106.0):
        d = t - at
        x += (d >= 0) * (np.sin(2 * np.pi * 55 * d) * np.exp(-d * 5) * 0.6 + rng.standard_normal(n) * np.exp(-np.maximum(d, 0) * 9) * 0.5)
    x *= np.clip((seconds - t) / 8, 0, 1) ** 1.5 * np.clip(t / 0.02, 0, 1)
    x = np.tanh(3.2 * x)      # as loud as a finished recording is: the hits no longer tower over the rest
    x *= 0.89 / np.abs(x).max()
    return np.stack([x, np.roll(x, int(0.011 * rate)) * 0.96], axis=1)


master = out / '_test_clicks.wav'
write_wav(master, clicks(48000), 48000)
encode(master, out / '_test_clicks.mp3', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k')
encode(master, out / '_test_clicks.m4a', '-c:a', 'aac', '-b:a', '192k')
encode(master, out / '_test_clicks.ogg', '-ar', '44100', '-c:a', 'libvorbis', '-q:a', '6')
encode(master, out / '_test_clicks.opus', '-c:a', 'libopus', '-b:a', '160k')
encode(master, out / '_test_clicks.flac', '-c:a', 'flac')
encode(master, out / '_test_short.mp3', '-t', '8', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k')
write_wav(out / '_test_odd.wav', clicks(37800, 20, 6), 37800)
tmp = out / '_music.wav'
write_wav(tmp, music(), 44100)
encode(tmp, out / '_test_music.mp3', '-c:a', 'libmp3lame', '-b:a', '192k')
tmp.unlink()
for f in sorted(out.glob('_test_*')):
    print(f'{f.name:20s} {f.stat().st_size:9d} bytes')
