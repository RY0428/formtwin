import { describe, expect, it, vi } from 'vitest';
import type { CloudFormAnalyzer } from '../cloud/CloudFormAnalyzer.ts';
import { EgressGateway, RATE_LIMIT_COOLDOWN_MS, isRateLimited } from './gateway.ts';

// The real cloud implementations are never loaded in unit tests (each test injects its own fakes).
vi.mock('#cloud-impl', () => ({ createCloudFormAnalyzer: vi.fn(), createFieldExplainer: vi.fn() }));
vi.mock('../catalog/approvedSources.ts', async () => {
  const bytes = new TextEncoder().encode('%PDF-approved');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const sha = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
  const sources = [
    { formId: 'ok', sha256: sha, bytes, targetPages: [0], mimeType: 'application/pdf' },
    { formId: 'tampered', sha256: '0'.repeat(64), bytes, targetPages: [0], mimeType: 'application/pdf' },
  ];
  return {
    resolveApprovedSource: (id: unknown) => sources.find((s) => s.formId === id),
    sha256Hex: async (b: Uint8Array) =>
      Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource)), (x) =>
        x.toString(16).padStart(2, '0'),
      ).join(''),
  };
});

vi.mock('../catalog/adopted.ts', () => ({
  adoptedRevisionFor: (id: string) =>
    id === 'ok'
      ? {
          formDef: {
            fields: [
              { fieldId: 'familyName', labelJa: '氏名', labelEn: 'Family name' },
              { fieldId: 'residenceCardNumber', labelJa: '在留カード番号', labelEn: 'Residence card number' },
            ],
          },
        }
      : undefined,
}));

const CANDIDATE = {
  fields: [
    { labelJa: '氏名', labelEn: 'Name', kind: 'text', semanticKey: 'fullName', status: 'resolved', page: 0, box: [1, 2, 3, 4] },
  ],
};

function analyzer(response: { text: string; inferenceSource: string | undefined } | Error): CloudFormAnalyzer & {
  analyze: ReturnType<typeof vi.fn>;
} {
  return {
    model: 'test-model',
    endpointHost: 'example.invalid',
    analyze: vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
  };
}

const okResponse = { text: JSON.stringify(CANDIDATE), inferenceSource: 'in_cloud' };

describe('errorDetail', () => {
  it('flattens and truncates', async () => {
    const { errorDetail } = await import('./gateway.ts');
    expect(errorDetail(new Error('x'.repeat(900)))).toHaveLength(600);
  });
});

describe('EgressGateway', () => {
  it.each([
    ['unknown id', 'other-form'],
    ['a File-like object', { name: 'filled.pdf', size: 10 }],
    ['a URL', 'https://example.com/form.pdf'],
    ['bytes', new Uint8Array([37, 80, 68, 70])],
    ['undefined', undefined],
  ])('rejects %s without calling the cloud', async (_n, input) => {
    const a = analyzer(okResponse);
    const g = new EgressGateway(a);
    expect(await g.analyzeApprovedForm(input)).toEqual({ ok: false, reason: 'not_approved' });
    expect(a.analyze).not.toHaveBeenCalled();
    expect(g.entries().map((e) => e.status)).toEqual(['rejected']);
  });

  it('rejects an approved id whose bytes no longer match the approved hash', async () => {
    const a = analyzer(okResponse);
    const g = new EgressGateway(a);
    expect(await g.analyzeApprovedForm('tampered')).toEqual({ ok: false, reason: 'hash_mismatch' });
    expect(a.analyze).not.toHaveBeenCalled();
  });

  it('sends only the approved bytes and returns a validated candidate', async () => {
    const a = analyzer(okResponse);
    const g = new EgressGateway(a);
    const out = await g.analyzeApprovedForm('ok');
    expect(out.ok).toBe(true);
    const [req] = a.analyze.mock.calls[0] as [{ pdfBase64: string; prompt: string }];
    expect(atob(req.pdfBase64)).toBe('%PDF-approved');
    expect(g.entries().map((e) => e.status)).toEqual(['planned', 'started', 'completed']);
  });

  it.each([
    ['on_device source', { text: JSON.stringify(CANDIDATE), inferenceSource: 'on_device' }, 'source_mismatch'],
    ['missing source', { text: JSON.stringify(CANDIDATE), inferenceSource: undefined }, 'source_mismatch'],
    ['broken JSON', { text: '{', inferenceSource: 'in_cloud' }, 'invalid_output'],
    ['schema violation', { text: '{"fields":[]}', inferenceSource: 'in_cloud' }, 'invalid_output'],
    [
      'field outside target pages',
      { text: JSON.stringify({ fields: [{ ...CANDIDATE.fields[0], page: 3 }] }), inferenceSource: 'in_cloud' },
      'invalid_output',
    ],
  ])('rejects %s', async (_n, response, reason) => {
    const g = new EgressGateway(analyzer(response));
    expect(await g.analyzeApprovedForm('ok')).toEqual({ ok: false, reason });
  });

  it('logs a started request that throws as unknown, not as unsent', async () => {
    const g = new EgressGateway(analyzer(new Error('network\n  down')));
    expect(await g.analyzeApprovedForm('ok')).toEqual({ ok: false, reason: 'request_failed', detail: 'Error: network down' });
    expect(g.entries().map((e) => e.status)).toEqual(['planned', 'started', 'unknown']);
  });

  it('log entries carry no bodies', async () => {
    const g = new EgressGateway(analyzer(okResponse));
    await g.analyzeApprovedForm('ok');
    expect(JSON.stringify(g.entries())).not.toContain('氏名');
  });
});

describe('diagnoseApprovedForm', () => {
  it('rejects unapproved input without sending', async () => {
    const a = analyzer(okResponse);
    expect(await new EgressGateway(a).diagnoseApprovedForm('https://example.com/x.pdf')).toBe('not_approved');
    expect(a.analyze).not.toHaveBeenCalled();
  });

  it('sends each fixed variant once with the approved bytes only', async () => {
    const a = analyzer(okResponse);
    const out = await new EgressGateway(a).diagnoseApprovedForm('ok');
    expect(Array.isArray(out) && out.map((r) => r.outcome)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
    const variants = a.analyze.mock.calls.map((c) => (c[0] as { variant: string }).variant);
    expect(variants).toEqual(['none', 'json', 'schema-s1', 'schema-s2', 'schema-s3', 'schema-full']);
    for (const c of a.analyze.mock.calls) expect(atob((c[0] as { pdfBase64: string }).pdfBase64)).toBe('%PDF-approved');
  });
});

describe('rate limits (429)', () => {
  const err429 = Object.assign(new Error('[429 ] Resource exhausted. (fake)'), { customErrorData: { status: 429 } });

  it('detects 429 from the SDK status or message only', () => {
    expect(isRateLimited(err429)).toBe(true);
    expect(isRateLimited(new Error('RESOURCE_EXHAUSTED: quota'))).toBe(true);
    expect(isRateLimited(new Error('[400 ] invalid argument'))).toBe(false);
    expect(isRateLimited(new Error('field 4290 missing'))).toBe(false);
  });

  it('reports rate_limited, never retries, and sends nothing during the cooldown', async () => {
    let t = 1_000;
    const a = analyzer(err429);
    const g = new EgressGateway(a, () => undefined, () => t);
    expect(await g.analyzeApprovedForm('ok')).toMatchObject({ ok: false, reason: 'rate_limited' });
    expect(a.analyze).toHaveBeenCalledTimes(1);
    t += RATE_LIMIT_COOLDOWN_MS - 1;
    expect(await g.analyzeApprovedForm('ok')).toMatchObject({ ok: false, reason: 'rate_limited' });
    expect(await g.diagnoseApprovedForm('ok')).toBe('rate_limited');
    expect(a.analyze).toHaveBeenCalledTimes(1);
    expect(g.entries().at(-1)).toMatchObject({ status: 'rejected', reason: 'rate_limited' });
    t += 1;
    expect(g.cooldownMs()).toBe(0);
    await g.analyzeApprovedForm('ok');
    expect(a.analyze).toHaveBeenCalledTimes(2);
  });

  it('diagnostics stop at the first 429', async () => {
    const a = analyzer(err429);
    const g = new EgressGateway(a);
    const r = await g.diagnoseApprovedForm('ok');
    expect(Array.isArray(r) && r.length).toBe(1);
    expect(a.analyze).toHaveBeenCalledTimes(1);
  });
});

describe('explainApprovedFields (hybrid, public labels only)', () => {
  const answer = (source: string, ids = ['familyName', 'residenceCardNumber']) => ({
    inferenceSource: source,
    text: JSON.stringify({ items: ids.map((fieldId) => ({ fieldId, explanation: `About ${fieldId}.` })) }),
  });
  const explainer = (r: { text: string; inferenceSource: string | undefined } | Error) => ({
    explain: vi.fn(async (req: { prompt: string; fieldIds: readonly string[] }) => {
      void req;
      if (r instanceof Error) throw r;
      return r;
    }),
  });

  it('sends only the adopted labels of an approved form and reports the source', async () => {
    for (const source of ['in_cloud', 'on_device'] as const) {
      const ex = explainer(answer(source));
      const g = new EgressGateway(analyzer(new Error('unused')), () => undefined, Date.now, ex);
      const out = await g.explainApprovedFields('ok');
      expect(out).toMatchObject({ ok: true, inferenceSource: source });
      const req = ex.explain.mock.calls[0]?.[0];
      expect(req?.fieldIds).toEqual(['familyName', 'residenceCardNumber']);
      expect(req?.prompt).toContain('氏名 / Family name');
      expect(req?.prompt).not.toContain('%PDF');
      expect(g.entries().map((e) => e.status)).toEqual(['planned', 'started', 'completed']);
      expect(JSON.stringify(g.entries())).not.toContain('About familyName');
    }
  });

  it('rejects unapproved ids, unknown sources, missing or extra fields', async () => {
    expect(await new EgressGateway(analyzer(new Error('x')), undefined, Date.now, explainer(answer('in_cloud'))).explainApprovedFields('nope')).toMatchObject({ ok: false, reason: 'not_approved' });
    expect(await new EgressGateway(analyzer(new Error('x')), undefined, Date.now, explainer(answer('somewhere'))).explainApprovedFields('ok')).toMatchObject({ ok: false, reason: 'source_mismatch' });
    expect(await new EgressGateway(analyzer(new Error('x')), undefined, Date.now, explainer(answer('in_cloud', ['familyName']))).explainApprovedFields('ok')).toMatchObject({ ok: false, reason: 'invalid_output' });
    expect(await new EgressGateway(analyzer(new Error('x')), undefined, Date.now, explainer(answer('in_cloud', ['familyName', 'other']))).explainApprovedFields('ok')).toMatchObject({ ok: false, reason: 'invalid_output' });
  });

  it('a 429 that was not absorbed by the fallback starts the shared cooldown', async () => {
    let t = 0;
    const err = Object.assign(new Error('[429 ] exhausted'), { customErrorData: { status: 429 } });
    const ex = explainer(err);
    const g = new EgressGateway(analyzer(new Error('x')), undefined, () => t, ex);
    expect(await g.explainApprovedFields('ok')).toMatchObject({ ok: false, reason: 'rate_limited' });
    expect(await g.analyzeApprovedForm('ok')).toMatchObject({ ok: false, reason: 'rate_limited' });
    t += 60_000;
    expect(g.cooldownMs()).toBe(0);
    expect(ex.explain).toHaveBeenCalledTimes(1);
  });
});

describe('explain time limit', () => {
  it('a stalled explainer ends as request_failed and frees the gateway', async () => {
    vi.useFakeTimers();
    try {
      const g = new EgressGateway(analyzer(new Error('x')), undefined, Date.now, { explain: () => new Promise(() => undefined) });
      const run = g.explainApprovedFields('ok');
      await vi.advanceTimersByTimeAsync(45_000);
      expect(await run).toMatchObject({ ok: false, reason: 'request_failed' });
      expect(g.entries().at(-1)).toMatchObject({ status: 'unknown', sourceSha256: null, promptVersion: 'explain-2' });
    } finally {
      vi.useRealTimers();
    }
  });
});
