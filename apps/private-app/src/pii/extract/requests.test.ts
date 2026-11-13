import { describe, expect, it } from 'vitest';
import { ExtractionRequests } from './requests.ts';

describe('ExtractionRequests', () => {
  it('accepts the current response once', () => {
    const q = new ExtractionRequests();
    const r = q.begin();
    expect(q.settle(r)).toBe(true);
    expect(q.settle(r)).toBe(false);
  });

  it('discards a response superseded by a newer request', () => {
    const q = new ExtractionRequests();
    const old = q.begin();
    const fresh = q.begin();
    expect(q.settle(old)).toBe(false);
    expect(q.settle(fresh)).toBe(true);
  });

  it('discards a response after the image changed', () => {
    const q = new ExtractionRequests();
    const r = q.begin();
    q.newDocument();
    expect(q.settle(r)).toBe(false);
  });

  it('discards a response after the session ended', () => {
    const q = new ExtractionRequests();
    const r = q.begin();
    q.endSession();
    expect(q.settle(r)).toBe(false);
    expect(q.settle(q.begin())).toBe(true);
  });

  it('document token: valid until the image changes or the session ends', () => {
    const r = new ExtractionRequests();
    const t = r.documentToken();
    expect(r.isDocument(t)).toBe(true);
    r.newDocument();
    expect(r.isDocument(t)).toBe(false);
    const t2 = r.documentToken();
    r.endSession();
    expect(r.isDocument(t2)).toBe(false);
  });
});
