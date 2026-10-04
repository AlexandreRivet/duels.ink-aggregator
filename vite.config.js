import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  // Relative paths: the page also works under https://<user>.github.io/<repo>/
  base: './',
  // Collected data is served as is: data/core-bo1/index.json → ./core-bo1/index.json
  publicDir: '../data',
  server: { fs: { allow: ['..'] } },
  build: { outDir: '../dist', emptyOutDir: true },
});
