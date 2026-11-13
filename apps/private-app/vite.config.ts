import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { privateHeaders } from '../../deploy/private/headers.mjs';
import { bytesPlugin } from './vite-plugin-bytes.ts';
import { formPackagePlugin } from './vite-plugin-form-package.ts';

// Dev server (HMR over WebSocket) cannot run under connect-src 'none'.
// Production CSP is verified only with `vite preview` or Firebase Hosting.
/** Short commit of the build (shown in the UI so device reports name the exact build). Not personal data. */
function buildCommit(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const dirty = execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8' }).trim() !== '';
    return dirty ? `${sha}+local` : sha;
  } catch {
    return 'unknown';
  }
}

export default defineConfig(({ mode }) => ({
  define: { __APP_COMMIT__: JSON.stringify(buildCommit()) },
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
