import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { publicHeaders } from '../../deploy/public/headers.mjs';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: { polyfill: false },
  },
  preview: {
    port: 4173,
    strictPort: true,
    headers: publicHeaders,
  },
  server: { port: 5173, strictPort: true },
});
