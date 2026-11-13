import { describe, expect, it, vi } from 'vitest';
import type { CloudFormAnalyzer } from '../cloud/CloudFormAnalyzer.ts';
import { EgressGateway } from './gateway.ts';

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
