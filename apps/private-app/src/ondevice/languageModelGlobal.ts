import type { DeviceAvailability } from './OnDeviceLLM.ts';

/**
 * Minimal view of Chrome's Prompt API global, used ONLY to check availability
 * (CLAUDE.md rule 3). Generation always goes through Firebase AI Logic.
 */
interface LanguageModelStatic {
  availability(options?: unknown): Promise<string>;
}

export function getLanguageModelGlobal(): LanguageModelStatic | undefined {
  const candidate = (globalThis as { LanguageModel?: unknown }).LanguageModel;
  if (
    typeof candidate === 'function' ||
    (typeof candidate === 'object' && candidate !== null)
  ) {
    const availability = (candidate as { availability?: unknown }).availability;
    if (typeof availability === 'function') return candidate as LanguageModelStatic;
  }
  return undefined;
}

const KNOWN: readonly string[] = ['unavailable', 'downloadable', 'downloading', 'available'];

export async function checkAvailability(options: unknown): Promise<DeviceAvailability> {
  const lm = getLanguageModelGlobal();
  if (lm === undefined) return 'api_missing';
  const value = await lm.availability(options);
  return KNOWN.includes(value) ? (value as DeviceAvailability) : 'unavailable';
}
