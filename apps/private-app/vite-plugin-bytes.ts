import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * `import bytes from './file.bin?bytes'` → Uint8Array built into the bundle.
 * Fixed assets (official form, font) must not be fetched at runtime (CLAUDE.md rule 4).
 */
export function bytesPlugin(): Plugin {
  return {
    name: 'formtwin-bytes',
    enforce: 'pre',
    load(id) {
      if (!id.endsWith('?bytes')) return null;
      const file = id.slice(0, -'?bytes'.length);
      const b64 = readFileSync(file).toString('base64');
      return `const s = atob(${JSON.stringify(b64)});
const a = new Uint8Array(s.length);
for (let i = 0; i < s.length; i += 1) a[i] = s.charCodeAt(i);
export default a;`;
    },
  };
}
