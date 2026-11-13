import { z } from 'zod';

/**
 * Zod 4 probes `new Function('')` on first use to decide whether to JIT-compile object parsers.
 * Both SPAs forbid eval through CSP (no 'unsafe-eval'), so the probe only raises a CSP violation
 * (measured 2026-11-13 by the M9 canary E2E). Jitless mode skips the probe; parsing stays the same.
 */
z.config({ jitless: true });
