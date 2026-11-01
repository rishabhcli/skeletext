import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.ts',
      name: 'repoDesk',
      fileName: 'app',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['@skeletext/core'],
      output: {
        globals: {
          '@skeletext/core': 'skeletext',
        },
      },
    },
    outDir: 'dist',
    assetsDir: '.',
    emptyOutDir: true,
  },
  base: './',
});
