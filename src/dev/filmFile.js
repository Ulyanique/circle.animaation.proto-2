// The film as a video file. Every frame is drawn in its turn — not in real time, so none is dropped and none comes
// late — handed to the browser's own video encoder (WebCodecs) and packed, with the soundtrack, into an MP4 or a WebM.
// The packing is done by mediabunny, which is fetched when the tool is opened for the first time.
// The soundtrack is the one the page plays (src/sound.js, or what the sound tool holds unsaved): the film's own goes
// into an MP4 as it is; music of one's own is put in its place, levelled and encoded anew.
// The core of the dev server's video tool (dev/exporter.js). Not part of the build.

import { FPS, LAST_FRAME } from '../core/util.js';
import { urlOf } from '../core/assets.js';
import { settleVideos } from '../core/slots.js';
import { OWN_SOUND, gainAt, untouched } from '../core/soundSettings.js';
import { SOUND } from '../core/soundtrack.js';

/** What the file can be: the container, the picture's codec, and what the soundtrack becomes in it. */
export const FORMATS = {
  mp4: { ext: 'mp4', codec: 'avc', label: 'MP4 · H.264', sound: 'aac' },
  webm: { ext: 'webm', codec: 'vp9', label: 'WebM · VP9', sound: 'opus' },
};
export const SIZES = [[1280, 720], [1920, 1080], [2560, 1440], [3840, 2160]];
export const RATES = [24, 30, 60];
const OPUS_BITRATE = 192000, AAC_BITRATE = 317000;      // what stereo Opus is asked for; what public/audio.m4a holds
const ENCODED = { opus: OPUS_BITRATE / 2, aac: 128000 };      // bits per second and channel a soundtrack is encoded with
const MOST = 1e8;      // bits per second: the file is put together in memory, and 50 s of this are 630 MB

/**
 * Bits per second the picture's encoder is asked for. `level`: 0, 1 or 2. The film is hard on an encoder — grain,
 * dust and sparks over soft gradients of light — so the numbers are generous: at level 1 a 1920×1080 file at 24 frames
 * gets 16 Mbit/s (the reference film, 1280×720, spends 10.6). It is a ceiling: an encoder that has nothing
 * more to say stays below it (tools/NOTES.md).
 */
export function pictureBitrate(width, height, fps, level = 1) {
  const base = [8e6, 16e6, 32e6][level] ?? 16e6;
  return Math.min(MOST, Math.round((base * ((width * height) / (1920 * 1080)) ** 0.85 * (fps / FPS) ** 0.5) / 1e5) * 1e5);
}
/**
 * Bits per second of the soundtrack in a file of this format, about: the film's own goes into an MP4 as it is;
 * anything else is encoded, as stereo.
 */
export function soundBitrate(format, music = SOUND) {
  if (music?.off) return 0;
  const codec = FORMATS[format]?.sound ?? 'opus';
  return codec === 'aac' && music.src === OWN_SOUND && untouched(music) ? AAC_BITRATE : ENCODED[codec] * 2;
}

/** How many frames a file of frames `from`…`to` of the film holds at `fps`. */
export const frameCount = (from, to, fps) => Math.ceil(((to - from + 1) * fps) / FPS);

let library = null;
const load = () => (library ??= import('mediabunny'));

/** Can this browser encode such a picture? `{ width, height, fps, format, bitrate }` → true / false. */
export async function canMake({ width, height, format, bitrate }) {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return false;
  try {
    const mb = await load();
    return await mb.canEncodeVideo(FORMATS[format].codec, { width, height, bitrate });
  } catch { return false; }
}

// One turn of the page's event loop: the page shows the progress and hears «Стоп». A message, not a timer — timers
// are held back to one a second in a tab that is not in front, and the file must not take an hour there.
const channel = typeof MessageChannel === 'undefined' ? null : new MessageChannel();
let wake = null;
if (channel) channel.port1.onmessage = () => { const w = wake; wake = null; w?.(); };
const breath = () => new Promise((resolve) => { if (!channel) return setTimeout(resolve); wake = resolve; channel.port2.postMessage(0); });

const stopped = () => new DOMException('stopped', 'AbortError');
const LOST = 'the graphics card dropped the picture (WebGL context lost) — a smaller size may do';
const SHORT = 'the graphics card could not draw a picture of this size (out of memory) — a smaller size may do';

/**
 * Can sound be encoded like this? A browser without an AAC encoder of its own (Chrome has none on Linux) gets the one
 * built from FFmpeg's, fetched when it is first needed.
 */
async function canEncode(mb, codec, config) {
  if (await mb.canEncodeAudio(codec, config)) return true;
  if (codec !== 'aac') return false;
  try { (await import('@mediabunny/aac-encoder')).registerAacEncoder(); } catch { return false; }
  return mb.canEncodeAudio(codec, config);
}

/**
 * The soundtrack between seconds `t0` and `t1` of the film, as a track for the file. `music`: its settings
 * (core/soundSettings.js). `feed(until)` hands over what sounds before second `until` of the file: sound and picture
 * go into it side by side.
 */
async function openSound(mb, music, format, t0, t1) {
  const url = urlOf(music.src), res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const input = new mb.Input({ source: new mb.BlobSource(await res.blob()), formats: mb.ALL_FORMATS });
  let track = null;
  try { track = await input.getPrimaryAudioTrack(); } catch { /* not a file the library reads */ }
  if (!track) { input.dispose(); throw new Error(`no sound in ${music.src}`); }
  const codec = FORMATS[format].sound;
  if (codec === track.codec && untouched(music)) {
    // The soundtrack is in the file's own codec already (AAC into an MP4, Opus into a WebM) and sounds as it is: its
    // packets go in as they are, nothing is decoded and encoded anew. A decoder gets a moment right only if it has
    // heard what came before, so the piece begins a little earlier than the picture — a packet of AAC, a few of
    // Opus — and the file says how much of its sound is this run-up and is not played: an edit list in an MP4, the
    // codec delay in a WebM (the library writes both from packets that begin before zero).
    const sink = new mb.EncodedPacketSink(track), source = new mb.EncodedAudioPacketSource(track.codec);
    let packet = (await sink.getPacket(t0 - ((await track.getPreRollDuration()) ?? 0))) ?? (await sink.getFirstPacket()), sent = 0;
    const first = packet?.timestamp ?? t0, config = { ...(await track.getDecoderConfig()) };
    if (track.codec === 'opus' && config.description) {
      // …and the Opus header has to name the same run-up (its «pre-skip»), or a browser will not play the track
      const d = config.description, head = new Uint8Array(d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d.slice(0));
      if (head.length >= 12) new DataView(head.buffer).setUint16(10, Math.min(65535, Math.round(Math.max(0, t0 - first) * 48000)), true);
      config.description = head;
    }
    const meta = { decoderConfig: config };
    return {
      source, how: 'copied',
      most: Math.ceil(((t1 - first) * track.sampleRate) / (track.codec === 'opus' ? 120 : 1024)) + 8,      // packets, at most (AAC: 1024 samples each)
      async feed(until) {
        while (packet && packet.timestamp < t1 && packet.timestamp - t0 < until) {
          await source.add(packet.clone({ timestamp: packet.timestamp - t0 }), sent++ ? undefined : meta);
          packet = await sink.getNextPacket(packet);
        }
      },
      close() { input.dispose(); },
    };
  }
  // Otherwise it is decoded and encoded anew — Opus for a WebM, AAC for an MP4 — and on the way put in its place and
  // levelled, sample by sample: the file's sound begins with the file and lasts as long as its picture, silent where
  // the music has not come in yet or is over. AAC keeps the music's own rate where the encoder takes it (up to
  // 48 kHz: not every player goes beyond); otherwise the sound is brought to 48 kHz. Opus is 48 kHz inside: the
  // music is brought to it here — a browser's encoder does that too if left to it, but 0.7 ms late (tools/NOTES.md).
  // More channels than two become two.
  const rate = track.sampleRate, channels = track.numberOfChannels, wide = Math.min(2, channels);
  const config = (sampleRate) => ({ numberOfChannels: wide, sampleRate, bitrate: ENCODED[codec] * wide });
  if (!(await track.canDecode())) { input.dispose(); throw new Error(`cannot decode ${music.src} (${track.codec ?? 'an unknown codec'})`); }
  let outRate = 0;
  for (const r of codec === 'opus' || rate > 48000 ? [48000] : [rate, 48000]) if (!outRate && (await canEncode(mb, codec, config(r)))) outRate = r;
  if (!outRate) { input.dispose(); return null; }      // the browser has no encoder for this: a file without sound
  const transform = wide === channels && outRate === rate ? undefined : { numberOfChannels: wide, sampleRate: outRate };
  const source = new mb.AudioSampleSource({ codec, quality: new mb.Quality({ bitrate: ENCODED[codec] * wide }), transform });
  const first = Math.round((t0 + music.start) * rate);      // the music's sample that sounds at the file's first moment
  const total = Math.round((t1 - t0) * rate);               // samples the file holds
  const last = (t1 + music.start) * rate;                   // the music's sample the file ends before
  // Vorbis: the first packet a decoder is given returns nothing, and what the second returns the library stamps with
  // the first one's time — every sample then comes out that packet's length too early: 3 ms when the music is read
  // from its beginning, 23 ms from its middle. Such music is always read from its beginning, where the packet is
  // known and its length can be given back. (Reading what is skipped takes a moment, not minutes.)
  const lead = last > 0 && track.codec === 'vorbis' ? await new mb.EncodedPacketSink(track).getFirstPacket() : null;
  const samples = last > 0 ? new mb.AudioSampleSink(track).samples(lead ? undefined : Math.max(0, first / rate), last / rate) : null;
  const level = music.volume !== 1 || music.fadeIn > 0 || music.fadeOut > 0;
  // samples handed over; the decoded piece in hand, the music's sample it begins with and how many it holds
  let done = 0, piece = null, at = 0, held = 0, over = !samples, shift = null;
  /** The next decoded piece of the music. One that is over before the music's sample `want` is not kept. */
  async function pull(want) {
    const next = await samples.next();
    piece = null;
    if (next.done) { over = true; return; }
    const sample = next.value;
    // (a library that stamps the first piece with the second packet's time needs nothing given back)
    shift ??= lead && Math.abs(sample.timestamp - lead.timestamp) < 0.5 / rate ? Math.round(lead.duration * rate) : 0;
    at = Math.round(sample.timestamp * rate) + shift;
    held = sample.numberOfFrames;
    if (want < at + held) {
      piece = new Float32Array(held * channels);
      sample.copyTo(piece, { planeIndex: 0, format: 'f32' });
    }
    sample.close();
  }
  return {
    source, how: 'encoded', most: Math.ceil((t1 - t0) * 134) + 64,      // packets, at most: none is shorter than 10 ms, and a third to spare
    async feed(until) {
      const target = Math.min(total, Math.ceil(until * rate));
      while (done < target) {
        const n = Math.min(target - done, 4800), data = new Float32Array(n * channels);      // (zeros: silence)
        for (let k = 0; k < n;) {
          const want = first + done + k;                                          // the music's sample that belongs here
          if (want < 0) { k += Math.min(n - k, -want); continue; }                // the music has not come in yet
          while (!over && (!piece || want >= at + held)) await pull(want);
          if (!piece) break;                                                      // the music is over
          if (want < at) { k += Math.min(n - k, at - want); continue; }           // a gap in the music file
          const take = Math.min(n - k, at + held - want);
          data.set(piece.subarray((want - at) * channels, (want - at + take) * channels), k * channels);
          k += take;
        }
        if (level) {
          for (let k = 0; k < n; k++) {
            const g = gainAt(t0 + (done + k) / rate, music);
            for (let c = 0; c < channels; c++) data[k * channels + c] *= g;
          }
        }
        const sample = new mb.AudioSample({ data, format: 'f32', numberOfChannels: channels, sampleRate: rate, timestamp: done / rate });
        await source.add(sample);
        sample.close();
        done += n;
      }
    },
    async close() { try { await samples?.return(); } catch { /* it is over anyway */ } input.dispose(); },
  };
}

/**
 * Draws frames `from`…`to` of the film (1-based, as everywhere) and returns them as a video file.
 *   width, height   the picture, 16:9, even numbers
 *   fps             frames per second of the file; the film is drawn at any moment, so 60 is 60 different pictures
 *   format          'mp4' | 'webm'
 *   bitrate         bits per second for the picture
 *   sound           false: a silent file
 *   music           the soundtrack's settings (core/soundSettings.js); by default those the page plays with
 *   signal          an AbortSignal: «Стоп»
 *   onProgress      (framesDone, framesInAll, filmFrame) after every frame
 * While it works, `player.hold` is set: the page's own loop (main.js) draws nothing and lays nothing out; when the
 * flag is cleared, the picture is back at the window's size.
 * Resolves to { blob, type, ext, frames, seconds, width, height, fps, bitrate, sound, soundError, took }. `sound`:
 * 'copied' | 'encoded' | null — null: the file has no sound, because none was asked for, because the browser cannot
 * encode it (soundError null), or because the music could not be read (soundError says why).
 */
export async function filmFile(player, stage, { width, height, fps = FPS, format = 'mp4', bitrate, sound = true, music = SOUND, from = 1, to = LAST_FRAME, signal, onProgress } = {}) {
  const kind = FORMATS[format];
  if (!kind) throw new Error(`unknown format ${format}`);
  if (!(width > 0 && height > 0) || width % 2 || height % 2 || Math.abs(width * 9 - height * 16) > 16) throw new Error(`the picture is 16:9 with even sides, not ${width}×${height}`);
  if (!(from >= 1 && to <= LAST_FRAME && from <= to)) throw new Error(`frames ${from}…${to}?`);
  if (player.hold) throw new Error('a file is being made already');
  bitrate ??= pictureBitrate(width, height, fps);
  const mb = await load();
  const t0 = (from - 1) / FPS, t1 = to / FPS, frames = frameCount(from, to, fps), started = performance.now();
  const canvas = stage.renderer.domElement, gl = stage.renderer.getContext();

  const output = new mb.Output({
    // An MP4's index stands at its head — the file plays from a web page before it has arrived whole. Room for it is
    // kept there from the start (both tracks say how many packets they will hold at most), so the packets go
    // straight into the file and are not held a second time until the end.
    format: format === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'reserve' }) : new mb.WebMOutputFormat(),
    target: new mb.BufferTarget(),
  });
  const picture = new mb.CanvasSource(canvas, { codec: kind.codec, quality: new mb.Quality({ bitrate }), keyFrameInterval: 1, latencyMode: 'quality' });
  output.addVideoTrack(picture, { frameRate: fps, maximumPacketCount: frames + 8 });
  let track = null, soundError = null;
  if (sound && !music?.off) {      // src/sound.js: off — файл-ролик выходит без звука
    try { track = await openSound(mb, music, format, t0, t1); } catch (e) { soundError = e; }
    if (track) output.addAudioTrack(track.source, { maximumPacketCount: track.most });
  }

  const css = [canvas.style.width, canvas.style.height];
  player.pause();
  player.hold = true;
  let lost = false, failure = null;
  const onLost = () => { lost = true; };
  canvas.addEventListener('webglcontextlost', onLost);
  // «Стоп» is heard between two frames, and while the file is being closed
  const halt = new Promise((_, reject) => { signal?.addEventListener('abort', () => reject(stopped()), { once: true }); });
  halt.catch(() => {});
  try {
    for (let i = 0; i < 16 && gl.getError() !== gl.NO_ERROR; i++);      // (errors of the past are not this file's)
    stage.resize(width, height, 1);                              // the drawing buffer is the file's frame, pixel for pixel…
    [canvas.style.width, canvas.style.height] = css;             // …and the page goes on showing it at the size it had
    // (a browser may give a smaller buffer than it was asked for, and say so only here)
    if (canvas.width !== width || canvas.height !== height || gl.drawingBufferWidth !== width || gl.drawingBufferHeight !== height) throw new Error(`the picture came out ${gl.drawingBufferWidth}×${gl.drawingBufferHeight}, not ${width}×${height}`);
    await output.start();
    for (let k = 0; k < frames; k++) {
      if (signal?.aborted) throw stopped();
      if (lost) throw new Error(LOST);
      const f = from + (k * FPS) / fps;
      await settleVideos(f, FPS / fps);                          // videos in the windows: each on the frame it shows now
      player.renderAt(f);
      if (k === 0) {
        // a graphics card without the memory for buffers of this size keeps its context and draws black; only its
        // error codes tell
        for (let i = 0, error; i < 8 && (error = gl.getError()) !== gl.NO_ERROR; i++) if (error === gl.OUT_OF_MEMORY || error === gl.INVALID_FRAMEBUFFER_OPERATION) throw new Error(SHORT);
      }
      await picture.add(k / fps, 1 / fps);                       // reads the canvas at once, in the turn that drew it
      await track?.feed((k + 1) / fps);
      onProgress?.(k + 1, frames, f);
      await breath();
    }
    await track?.feed(Infinity);
    await Promise.race([output.finalize(), halt]);
  } catch (e) {
    failure = lost && e?.name !== 'AbortError' ? new Error(LOST) : e;      // whatever broke first, this is what was behind it
  }
  // the page gets its picture back first; tidying up after a failure may take its time, but not for ever
  canvas.removeEventListener('webglcontextlost', onLost);
  player.hold = false;
  const tidy = [(async () => track?.close())()];
  if (failure) tidy.push(output.cancel());
  await Promise.race([Promise.allSettled(tidy), new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (failure) throw failure;
  const type = await output.getMimeType();
  const blob = new Blob([output.target.buffer], { type: type.split(';')[0] });
  return {
    blob, type, ext: kind.ext, frames, seconds: frames / fps, width, height, fps, bitrate,
    sound: track ? track.how : null, soundError: soundError ? String(soundError.message || soundError) : null,
    took: (performance.now() - started) / 1000,
  };
}
