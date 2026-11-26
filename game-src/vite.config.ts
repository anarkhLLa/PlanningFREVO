import { defineConfig } from 'vite';

// Le jeu est compilé dans ../game (servi par GitHub Pages à côté du planning, même origine).
export default defineConfig({
  base: './',
  build: { outDir: '../game', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] }
});
