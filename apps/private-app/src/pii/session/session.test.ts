import { describe, expect, it } from 'vitest';
import { nameSplitOptions, splitDate } from './candidates.ts';
import { dateProblem, formatProblem } from './fields.ts';
import { EMPTY_VALUES, initialSession, isConfirmed, sessionReducer, takeSnapshot, type SessionEvent } from './sessionState.ts';

const run = (events: SessionEvent[]) => events.reduce(sessionReducer, initialSession());

describe('session state', () => {
  it('confirms only a non-empty current value', () => {
    expect(isConfirmed(run([{ type: 'confirm', id: 'familyName' }]).fields.familyName)).toBe(false);
    const s = run([{ type: 'changed', id: 'familyName', filled: true, source: 'manual' }, { type: 'confirm', id: 'familyName' }]);
    expect(isConfirmed(s.fields.familyName)).toBe(true);
  });

  it('withdraws confirmation when the value changes (edit or candidate)', () => {
    const base: SessionEvent[] = [{ type: 'changed', id: 'familyName', filled: true, source: 'manual' }, { type: 'confirm', id: 'familyName' }];
    expect(isConfirmed(run([...base, { type: 'changed', id: 'familyName', filled: true, source: 'manual' }]).fields.familyName)).toBe(false);
    expect(
      isConfirmed(run([...base, { type: 'changed', id: 'familyName', filled: true, source: 'candidate' }]).fields.familyName),
    ).toBe(false);
  });

  it('changes inputRevision on every value or confirmation change, not on no-ops', () => {
    const a = run([{ type: 'changed', id: 'givenName', filled: true, source: 'manual' }]);
    const b = sessionReducer(a, { type: 'confirm', id: 'givenName' });
    const c = sessionReducer(b, { type: 'confirm', id: 'givenName' });
    expect(b.inputRevision).toBeGreaterThan(a.inputRevision);
    expect(c).toBe(b);
  });

  it('snapshot includes confirmed values only and lists the rest', () => {
    const s = run([
      { type: 'changed', id: 'familyName', filled: true, source: 'manual' },
      { type: 'confirm', id: 'familyName' },
      { type: 'changed', id: 'givenName', filled: true, source: 'manual' },
    ]);
    const snap = takeSnapshot(s, { ...EMPTY_VALUES, familyName: 'TANAKA', givenName: 'HANAKO' });
    expect(snap.values).toEqual({ familyName: 'TANAKA' });
    expect(snap.excluded).toContainEqual({ id: 'givenName', reason: 'unconfirmed' });
    expect(snap.excluded).toContainEqual({ id: 'residenceCardNumber', reason: 'empty' });
    expect(Object.isFrozen(snap.values)).toBe(true);
  });

  it('reset clears fill state and bumps the revision', () => {
    const s = run([{ type: 'changed', id: 'familyName', filled: true, source: 'manual' }, { type: 'reset' }]);
    expect(s.fields.familyName.filled).toBe(false);
    expect(s.inputRevision).toBe(2);
  });
});

describe('candidates', () => {
  it('offers every split of a name and never chooses one', () => {
    expect(nameSplitOptions('SANTOS MARIA CLARA')).toEqual([
      { family: 'SANTOS', given: 'MARIA CLARA' },
      { family: 'SANTOS MARIA', given: 'CLARA' },
    ]);
    expect(nameSplitOptions('MADONNA')).toEqual([]);
  });

  it('splits original and ISO dates into zero-padded parts', () => {
    expect(splitDate('2027年03月31日')).toEqual({ year: '2027', month: '03', day: '31' });
    expect(splitDate('2027年3月1日')).toEqual({ year: '2027', month: '03', day: '01' });
    expect(splitDate('2027-03-31')).toEqual({ year: '2027', month: '03', day: '31' });
    expect(splitDate('令和9年3月31日')).toBeUndefined();
  });
});

describe('format checks', () => {
  it('flags malformed values without judging correctness', () => {
    expect(formatProblem('residenceCardNumber', 'AB12345678CD')).toBeUndefined();
    expect(formatProblem('residenceCardNumber', 'AB1234567CD')).toBeDefined();
    expect(formatProblem('expiryMonth', '13')).toBeDefined();
    expect(dateProblem('2027', '02', '30')).toBeDefined();
    expect(dateProblem('2028', '02', '29')).toBeUndefined();
    expect(formatProblem('givenName', 'JOÃO PEDRO')).toBeDefined();
    expect(formatProblem('givenName', 'JOAO PEDRO')).toBeUndefined();
  });
});
