import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '../..');

export default defineConfig({
  root: here,
  plugins: [vue()],
  resolve: {
    alias: [
      { find: '@/infra/storage', replacement: resolve(here, 'mock-storage.ts') },
      { find: 'wxt/browser', replacement: resolve(here, 'browser-shim.ts') },
      { find: '@', replacement: resolve(projectRoot, 'src') },
    ],
  },
  define: {
    __PROMPT_BOX_BUILD_CLIENT_ID__: 'null',
    __PROMPT_BOX_BUILD_SURFACE__: '"chrome"',
  },
  server: {
    host: '127.0.0.1',
    strictPort: false,
  },
});
