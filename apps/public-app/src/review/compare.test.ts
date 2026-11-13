import { describe, expect, it } from 'vitest';
import type { FormDef, FormDefCandidate } from '@formtwin/contracts';
import { compareWithAdopted, placementToBox } from './compare.ts';

const page = { index: 0, width: 600, height: 800 };
const adopted = {
  page,
  fields: [
    { fieldId: 'familyName', semanticKey: 'fullName', placement: { page: 0, x: 120, y: 600, width: 180, fontSize: 10 } },
    { fieldId: 'residenceCardNumber', semanticKey: 'residenceCardNumber', placement: { page: 0, x: 120, y: 400, width: 120, fontSize: 10 } },
  ],
} as unknown as FormDef;

const field = (semanticKey: string | null, box: [number, number, number, number], status = 'resolved') =>
  ({ labelJa: 'x', labelEn: 'x', kind: 'text', semanticKey, status, page: 0, box }) as FormDefCandidate['fields'][number];

describe('placementToBox', () => {
  it('converts points (bottom-left) to a normalized top-left box', () => {
    expect(placementToBox({ x: 120, y: 600, width: 180, fontSize: 10 }, page)).toEqual([238, 200, 254, 500]);
  });
});

describe('compareWithAdopted', () => {
  it('reports agreement, missing and extra keys', () => {
    const c = compareWithAdopted(
      { fields: [field('fullName', [240, 210, 252, 400]), field('periodOfStayExpiry', [10, 10, 20, 20]), field(null, [1, 1, 2, 2], 'unsupported')] },
      adopted,
    );
    const byKey = Object.fromEntries(c.keys.map((k) => [k.semanticKey, k]));
    expect(byKey['fullName']).toMatchObject({ status: 'both', overlaps: true });
    expect(byKey['residenceCardNumber']).toMatchObject({ status: 'adopted_only', overlaps: false });
    expect(byKey['periodOfStayExpiry']).toMatchObject({ status: 'candidate_only' });
    expect(c.otherCandidateFields).toBe(1);
  });

  it('flags a same-key candidate placed elsewhere', () => {
    const c = compareWithAdopted({ fields: [field('fullName', [900, 900, 950, 990])] }, adopted);
    expect(c.keys.find((k) => k.semanticKey === 'fullName')).toMatchObject({ status: 'both', overlaps: false });
  });
});
