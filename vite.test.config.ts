import { defineConfig } from 'vite';
// bundles the node-side tests (offline audio renders) so they can import the app's modules
export default defineConfig({
  build: { ssr: true, outDir: 'tests/out', emptyOutDir: false, target: 'node22', rollupOptions: { input: { pictureclock: 'tests/picture-clock.ts', mix: 'tests/mix.ts', calib: 'tests/calib.ts', import: 'tests/import.ts', ut2: 'tests/ut2.ts', sound: 'tests/sound.ts', gen: 'tests/gen.ts', originals: 'tests/originals.ts', audio: 'tests/audio.ts', chart: 'tests/chart.ts', level: 'tests/level.ts', voicecost: 'tests/voicecost.ts', partlevel: 'tests/partlevel.ts' } } },
  ssr: { external: ['node-web-audio-api'], noExternal: ['@tonejs/midi'] }
});
