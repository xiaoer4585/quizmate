import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { resolve } from 'path';

const desktopCore = resolve(__dirname, '../../desktop-core');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(desktopCore, 'electron/main.ts') },
      },
    },
    resolve: {
      alias: { '@shared': resolve(desktopCore, 'shared') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(desktopCore, 'electron/preload.ts') },
        output: { format: 'cjs' },
      },
    },
    resolve: {
      alias: { '@shared': resolve(desktopCore, 'shared') },
    },
  },
  renderer: {
    root: resolve(desktopCore, 'src'),
    build: {
      rollupOptions: {
        input: { index: resolve(desktopCore, 'src/index.html') },
      },
    },
    resolve: {
      alias: { '@': resolve(desktopCore, 'src'), '@shared': resolve(desktopCore, 'shared') },
    },
    plugins: [
      react(),
      {
        name: 'shared-postcss-config',
        async config() {
          return { css: { postcss: { plugins: [tailwindcss(), autoprefixer()] } } };
        },
      },
    ],
  },
});
