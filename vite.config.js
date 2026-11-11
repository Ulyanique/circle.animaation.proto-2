import { defineConfig } from 'vite';

// The shot data files (src/shots/data/sNN.json) also carry what only the tools need: the raw tracked camera, the light
// trails tracked in the reference video and its flare track. The player reads none of it, so it is not shipped.
const slimShotData = () => ({
  name: 'slim-shot-data',
  enforce: 'pre',
  transform(code, id) {
    if (!/\/src\/shots\/data\/s\w+\.json$/.test(id.split('?')[0])) return null;
    const data = JSON.parse(code);
    for (const key of ['trails', 'camRaw', 'flare']) delete data[key];
    return { code: JSON.stringify(data), map: null };
  },
});

export default defineConfig({
  base: './',
  plugins: [slimShotData()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // allow tunnelled / proxied preview hosts
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
