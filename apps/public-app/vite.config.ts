import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { publicHeaders } from '../../deploy/public/headers.mjs';
import { bytesPlugin } from './vite-plugin-bytes.ts';

// `#cloud-impl` is the real Firebase AI Logic analyzer, except in the E2E build
// (`--mode e2e` → dist-e2e), which uses a fake so tests never call the cloud.
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
  plugins: [bytesPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '#cloud-impl': fileURLToPath(
        new URL(mode === 'e2e' ? './src/cloud/fakeCloud.e2e.ts' : './src/cloud/firebaseCloud.ts', import.meta.url),
      ),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    modulePreload: { polyfill: false },
  },
  preview: {
    port: 4173,
    strictPort: true,
    headers: publicHeaders,
  },
  server: { port: 5173, strictPort: true },
}));
