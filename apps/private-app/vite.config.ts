import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { privateHeaders } from '../../deploy/private/headers.mjs';
import { bytesPlugin } from './vite-plugin-bytes.ts';
import { formPackagePlugin } from './vite-plugin-form-package.ts';

// Dev server (HMR over WebSocket) cannot run under connect-src 'none'.
// Production CSP is verified only with `vite preview` or Firebase Hosting.
export default defineConfig(({ mode }) => ({
  plugins: [formPackagePlugin(mode), bytesPlugin(), react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    // The bundled form and font are large by design (no runtime fetch).
    chunkSizeWarningLimit: 12000,
    // Avoid the inline modulepreload polyfill so script-src 'self' holds.
    modulePreload: { polyfill: false },
  },
  preview: {
    port: 4174,
    strictPort: true,
    headers: privateHeaders,
  },
  server: { port: 5174, strictPort: true },
}));
