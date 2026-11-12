/**
 * Turning extraction candidates into field proposals. Nothing here writes to fields:
 * the person applies each proposal explicitly (requirements.md §3 Must 4–5).
 */

/** All ways to split a one-line name at a space into family / given. No automatic choice. */
export function nameSplitOptions(fullName: string): { family: string; given: string }[] {
  const tokens = fullName.trim().split(/\s+/).filter((t) => t !== '');
  const options: { family: string; given: string }[] = [];
  for (let i = 1; i < tokens.length; i += 1) {
    options.push({ family: tokens.slice(0, i).join(' '), given: tokens.slice(i).join(' ') });
  }
  return options;
}

/** Accepts `YYYY年MM月DD日` or `YYYY-MM-DD` (original notation stays visible to the person). */
export function splitDate(text: string): { year: string; month: string; day: string } | undefined {
  const s = text.trim();
  const m = /^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日$/.exec(s) ?? /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m === null) return undefined;
  const [, year = '', month = '', day = ''] = m;
  return { year, month: month.padStart(2, '0'), day: day.padStart(2, '0') };
}
