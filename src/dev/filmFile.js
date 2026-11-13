// The film as a video file. Every frame is drawn in its turn — not in real time, so none is dropped and none comes
// late — handed to the browser's own video encoder (WebCodecs) and packed, with the soundtrack, into an MP4 or a WebM.
// The packing is done by mediabunny, which is fetched when the tool is opened for the first time.
// The core of the dev server's video tool (dev/exporter.js). Not part of the build.

import { FPS, LAST_FRAME } from '../core/util.js';
import { settleVideos } from '../core/slots.js';

/** What the file can be: the container, the picture's codec, and what the soundtrack becomes in it. */
export const FORMATS = {
  mp4: { ext: 'mp4', codec: 'avc', label: 'MP4 · H.264', sound: 'aac' },
  webm: { ext: 'webm', codec: 'vp9', label: 'WebM · VP9', sound: 'opus' },
};
export const SIZES = [[1280, 720], [1920, 1080], [2560, 1440], [3840, 2160]];
export const RATES = [24, 30, 60];
const OPUS_BITRATE = 192000, AAC_BITRATE = 317000;      // what Opus is asked for; what public/audio.m4a holds
const MOST = 1e8;      // bits per second: the file is put together in memory, and 50 s of this are 630 MB

/**
 * Bits per second the picture's encoder is asked for. `level`: 0, 1 or 2. The film is hard on an encoder — grain,
 * dust and sparks over soft gradients of light — so the numbers are generous: at level 1 a 1920×1080 file at 24 frames
 * gets 16 Mbit/s (the reference video.mp4 spends 10.6 on 1280×720). It is a ceiling: an encoder that has nothing
 * more to say stays below it (tools/NOTES.md).
 */
export function pictureBitrate(width, height, fps, level = 1) {
  const base = [8e6, 16e6, 32e6][level] ?? 16e6;
  return Math.min(MOST, Math.round((base * ((width * height) / (1920 * 1080)) ** 0.85 * (fps / FPS) ** 0.5) / 1e5) * 1e5);
}
/** Bits per second of the soundtrack in a file of this format, about. */
export const soundBitrate = (format) => (FORMATS[format]?.sound === 'aac' ? AAC_BITRATE : OPUS_BITRATE);

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
 * The soundtrack between seconds `t0` and `t1` of the film, as a track for the file. `feed(until)` hands over what
 * sounds before second `until` of the file: sound and picture go into it side by side.
 */
async function openSound(mb, url, format, t0, t1) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const input = new mb.Input({ source: new mb.BlobSource(await res.blob()), formats: mb.ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack();
  if (!track) { input.dispose(); return null; }
  if (FORMATS[format].sound === track.codec) {
    // the soundtrack is in the file's own codec already (AAC into MP4): its packets go in as they are, nothing is
    // decoded and encoded anew. The piece starts with a whole packet — up to 21 ms before `t0`.
    const sink = new mb.EncodedPacketSink(track), source = new mb.EncodedAudioPacketSource(track.codec);
    const meta = { decoderConfig: await track.getDecoderConfig() };
    let packet = (await sink.getPacket(t0)) ?? (await sink.getFirstPacket()), sent = 0;
    const first = packet?.timestamp ?? 0;
    return {
      source, how: 'copied', most: Math.ceil(((t1 - first) * track.sampleRate) / 1024) + 8,      // packets, at most (AAC: 1024 samples each)
      async feed(until) {
        while (packet && packet.timestamp < t1 && packet.timestamp - first < until) {
          await source.add(packet.clone({ timestamp: packet.timestamp - first }), sent++ ? undefined : meta);
          packet = await sink.getNextPacket(packet);
        }
      },
      close() { input.dispose(); },
    };
  }
  // otherwise it is decoded and encoded anew (Opus for a WebM)
  if (!(await track.canDecode()) || !(await mb.canEncodeAudio(FORMATS[format].sound, { numberOfChannels: track.numberOfChannels, sampleRate: track.sampleRate, bitrate: OPUS_BITRATE }))) {
    input.dispose();
    return null;
  }
  const source = new mb.AudioSampleSource({ codec: FORMATS[format].sound, quality: new mb.Quality({ bitrate: OPUS_BITRATE }) });
  const samples = new mb.AudioSampleSink(track).samples(t0, t1);
  let next = null;
  return {
    source, how: 'encoded', most: Math.ceil((t1 - t0) * 134) + 64,      // packets, at most: none is shorter than 10 ms, and a third to spare
    async feed(until) {
      next ??= await samples.next();
      while (!next.done && next.value.timestamp - t0 < until) {
        const sample = next.value;
        if (sample.timestamp >= t0 - 1e-6) { sample.setTimestamp(Math.max(0, sample.timestamp - t0)); await source.add(sample); }
        sample.close();
        next = await samples.next();
      }
    },
    async close() { try { if (next && !next.done) next.value.close(); await samples.return(); } catch { /* it is over anyway */ } input.dispose(); },
  };
}

/**
 * Draws frames `from`…`to` of the film (1-based, as everywhere) and returns them as a video file.
 *   width, height   the picture, 16:9, even numbers
 *   fps             frames per second of the file; the film is drawn at any moment, so 60 is 60 different pictures
 *   format          'mp4' | 'webm'
 *   bitrate         bits per second for the picture
 *   sound           false: a silent file
 *   signal          an AbortSignal: «Стоп»
 *   onProgress      (framesDone, framesInAll, filmFrame) after every frame
 * While it works, `player.hold` is set: the page's own loop (main.js) draws nothing and lays nothing out; when the
 * flag is cleared, the picture is back at the window's size.
 * Resolves to { blob, type, ext, frames, seconds, width, height, fps, bitrate, sound: 'copied' | 'encoded' | null, took }.
 */
export async function filmFile(player, stage, { width, height, fps = FPS, format = 'mp4', bitrate, sound = true, from = 1, to = LAST_FRAME, signal, onProgress } = {}) {
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
  if (sound && player.audio?.src) {
    try { track = await openSound(mb, player.audio.src, format, t0, t1); } catch (e) { soundError = e; }
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
