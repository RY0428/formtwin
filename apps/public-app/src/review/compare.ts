import type { FormDef, FormDefCandidate } from '@formtwin/contracts';
import { SEMANTIC_KEYS, type SemanticKey } from '@formtwin/domain';

/** [yMin, xMin, yMax, xMax] normalized to 0–1000, top-left origin (same as candidates). */
export type Box = readonly [number, number, number, number];

/** Adopted placement (PDF points, bottom-left origin, baseline y) → normalized box around the text line. */
export function placementToBox(
  p: { x: number; y: number; width: number; fontSize: number },
  page: { width: number; height: number },
): Box {
  const top = page.height - (p.y + p.fontSize);
  const bottom = page.height - (p.y - p.fontSize * 0.3);
  const n = (v: number, max: number) => Math.round(Math.min(1000, Math.max(0, (v / max) * 1000)));
  return [n(top, page.height), n(p.x, page.width), n(bottom, page.height), n(p.x + p.width, page.width)];
}

function intersects(a: Box, b: Box): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

export interface KeyComparison {
  readonly semanticKey: SemanticKey;
  readonly adoptedFields: readonly string[];
  readonly candidateLabels: readonly string[];
  readonly status: 'both' | 'adopted_only' | 'candidate_only' | 'neither';
  /** Whether a candidate box overlaps an adopted box for the same key (layout agreement, not correctness). */
  readonly overlaps: boolean;
}

export interface Comparison {
  readonly keys: readonly KeyComparison[];
  readonly otherCandidateFields: number;
}

export function compareWithAdopted(candidate: FormDefCandidate, adopted: FormDef): Comparison {
  const keys = SEMANTIC_KEYS.map((key): KeyComparison => {
    const a = adopted.fields.filter((f) => f.semanticKey === key);
    const c = candidate.fields.filter((f) => f.status === 'resolved' && f.semanticKey === key);
    const aBoxes = a.map((f) => placementToBox(f.placement, adopted.page));
    const overlaps = c.some((f) => aBoxes.some((b) => intersects(f.box, b)));
    const status = a.length > 0 && c.length > 0 ? 'both' : a.length > 0 ? 'adopted_only' : c.length > 0 ? 'candidate_only' : 'neither';
    return { semanticKey: key, adoptedFields: a.map((f) => f.fieldId), candidateLabels: c.map((f) => f.labelJa), status, overlaps };
  });
  return { keys, otherCandidateFields: candidate.fields.filter((f) => f.status !== 'resolved').length };
}
