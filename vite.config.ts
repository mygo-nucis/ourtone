import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

// the deployed site's page: it names the first song's notes, so they download alongside the app's code instead of
// after it (the page opens on the library's first song; one round trip less on a slow connection), and links the
// web app manifest
const firstSong = (JSON.parse(readFileSync('src/data/library.json', 'utf-8')) as { id: string }[])[0].id;
const webPage: Plugin = {
  name: 'web-page', apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(_html, ctx) {
      const c = Object.values(ctx.bundle ?? {}).find(c => c.type === 'chunk' && c.facadeModuleId?.endsWith(`/data/songs/${firstSong}.json`));
      const head = (tag: string, attrs: Record<string, string>) => ({ tag, attrs, injectTo: 'head' as const });
      return [
        ...(c ? [head('link', { rel: 'modulepreload', crossorigin: '', href: './' + c.fileName })] : []),
        // a phone can keep the site on its home screen, and opens it from there without the browser's bars
        head('link', { rel: 'manifest', href: './manifest.webmanifest', crossorigin: 'use-credentials' }),
        head('link', { rel: 'apple-touch-icon', href: './apple-touch-icon.png' }),
        head('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }),
        head('meta', { name: 'mobile-web-app-capable', content: 'yes' }),
        head('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }),
        head('meta', { name: 'apple-mobile-web-app-title', content: 'Ourtone' }),
        // this explicit test entry keeps its renderer/probe when launched from the home screen
        { tag: 'script', injectTo: 'head' as const, children: `try{var q=new URLSearchParams(location.search);if(q.has('perf')&&q.get('playRenderer')==='retained'&&(q.get('playProbe')||'normal')==='normal'){document.querySelector('link[rel="manifest"]').href='./manifest-playtest.webmanifest';document.querySelector('meta[name="apple-mobile-web-app-title"]').content='Ourtone Test'}}catch(e){}` }
      ];
    }
  }
};

// `vite build` makes the deployable site (hashed files, self-hosted fonts);
// `vite build --mode single` folds everything into one HTML file for previews.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [svelte(), ...(mode === 'single' ? [viteSingleFile({ removeViteModuleLoader: true })] : [webPage])],
  build: mode === 'single'
    // terser never names a variable `id`: an `id=` followed by a long string reads as review-page markup to the artifact publisher
    ? { outDir: 'dist-single', assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 100_000, minify: 'terser' as const, terserOptions: { mangle: { reserved: ['id', 'ID', 'Id', 'iD'] } } }
    : { outDir: 'dist', chunkSizeWarningLimit: 2000 }
}));
