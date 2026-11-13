/**
 * Fake Chrome Prompt API global for E2E. It exercises the real Firebase AI Logic
 * SDK path (ChromeAdapter, data: image conversion, response formatting) without a
 * model. Results from this fake are NOT evidence of real on-device AI execution.
 */
export interface FakeOptions {
  availability: 'unavailable' | 'downloadable' | 'downloading' | 'available';
  response: string;
  /** Optional delay before each prompt resolves (stale-response tests). */
  delayMs?: number;
  /** Optional per-prompt responses (n-th prompt gets the n-th, the last repeats); overrides `response`. */
  responses?: string[];
  /** Optional delay before `create` resolves (preparation cancel tests). */
  createDelayMs?: number;
}

export function installFakeLanguageModel(opts: FakeOptions): void {
  const log: { availability: number; create: number; prompts: { types: string[]; hasConstraint: boolean }[] } = {
    availability: 0,
    create: 0,
    prompts: [],
  };
  let state = opts.availability;
  (window as unknown as { __fakeLM: typeof log }).__fakeLM = log;
  (window as unknown as { LanguageModel: unknown }).LanguageModel = {
    availability: () => {
      log.availability += 1;
      return Promise.resolve(state);
    },
    create: (options?: { monitor?: (m: EventTarget) => void }) => {
      log.create += 1;
      if (state === 'unavailable') return Promise.reject(new Error('unavailable'));
      if (options?.monitor !== undefined) {
        const target = new EventTarget();
        options.monitor(target);
        for (const loaded of [0.25, 1]) {
          const e = new Event('downloadprogress') as Event & { loaded: number };
          e.loaded = loaded;
          target.dispatchEvent(e);
        }
      }
      const session = {
        prompt: (messages: { content: { type: string; value: unknown }[] }[], promptOptions?: { responseConstraint?: unknown }) => {
          const types = messages.flatMap((m) =>
            m.content.map((c) => (c.type === 'image' && c.value instanceof ImageBitmap ? 'image:ImageBitmap' : c.type)),
          );
          log.prompts.push({ types, hasConstraint: promptOptions?.responseConstraint !== undefined });
          const list = opts.responses;
          const answer = list === undefined ? opts.response : list[Math.min(log.prompts.length - 1, list.length - 1)];
          return new Promise((resolve) => setTimeout(() => resolve(answer), opts.delayMs ?? 0));
        },
        destroy: () => undefined,
      };
      return new Promise((resolve) =>
        setTimeout(() => {
          state = 'available';
          resolve(session);
        }, opts.createDelayMs ?? 0),
      );
    },
  };
}
