import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.ts') },
      },
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'shared') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') },
        output: { format: 'cjs' },
      },
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'shared') },
    },
  },
  renderer: {
    root: 'src',
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/index.html') },
      },
    },
    resolve: {
      alias: { '@': resolve(__dirname, 'src'), '@shared': resolve(__dirname, 'shared') },
    },
    plugins: [react()],
  },
});
