/** Output fields of the MVP form (field ids in forms/defs/isa-930004094/rev-1.formdef.json). */
export const FIELD_IDS = [
  'familyName',
  'givenName',
  'expiryYear',
  'expiryMonth',
  'expiryDay',
  'residenceCardNumber',
] as const;

export type FieldId = (typeof FIELD_IDS)[number];

export const FIELD_LABELS: Record<FieldId, string> = {
  familyName: 'Family name (3 氏名 Family name)',
  givenName: 'Given name (3 氏名 Given name)',
  expiryYear: 'Expiry year (11 在留期間の満了日 年)',
  expiryMonth: 'Expiry month (月)',
  expiryDay: 'Expiry day (日)',
  residenceCardNumber: 'Residence card number (12 在留カード番号)',
};

/** Format checks only; they do not prove the value is correct. */
export function formatProblem(id: FieldId, value: string): string | undefined {
  if (value === '') return undefined;
  switch (id) {
    case 'familyName':
    case 'givenName':
      if (value.length > 40) return 'Too long for this field.';
      return /[^\x20-\x7E]/.test(value)
        ? 'Contains accented or non-Latin letters; check against the card.'
        : undefined;
    case 'expiryYear':
      return /^\d{4}$/.test(value) ? undefined : 'Use 4 digits, e.g. 2027.';
    case 'expiryMonth': {
      const n = Number(value);
      return /^\d{1,2}$/.test(value) && n >= 1 && n <= 12 ? undefined : 'Use 1–12.';
    }
    case 'expiryDay': {
      const n = Number(value);
      return /^\d{1,2}$/.test(value) && n >= 1 && n <= 31 ? undefined : 'Use 1–31.';
    }
    case 'residenceCardNumber':
      return /^[A-Z]{2}\d{8}[A-Z]{2}$/.test(value) ? undefined : 'Expected 2 letters, 8 digits, 2 letters.';
  }
}

/** Real calendar date check across the three date parts (when all are present and well-formed). */
export function dateProblem(year: string, month: string, day: string): string | undefined {
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) return undefined;
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return d.getUTCMonth() === Number(month) - 1 && d.getUTCDate() === Number(day) ? undefined : 'This date does not exist.';
}
