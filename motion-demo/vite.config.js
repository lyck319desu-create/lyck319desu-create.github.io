import { defineConfig } from 'vite';

// The built demo is served from GitHub Pages at /motion/, so assets use relative paths.
export default defineConfig({
  base: './',
  build: {
    outDir: '../motion',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
});
