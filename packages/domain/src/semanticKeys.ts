/**
 * Semantic keys enabled for the MVP.
 *
 * PROVISIONAL: the final target fields are fixed at the Day 1–2 gate
 * (requirements.md §2, §6). Do not treat this list as the accepted scope yet.
 */
export const SEMANTIC_KEYS = [
  'fullName',
  'residenceCardNumber',
  'periodOfStayExpiry',
] as const;

export type SemanticKey = (typeof SEMANTIC_KEYS)[number];

export const ONTOLOGY_VERSION = '0.0.0-provisional';

export function isSemanticKey(value: string): value is SemanticKey {
  return (SEMANTIC_KEYS as readonly string[]).includes(value);
}
