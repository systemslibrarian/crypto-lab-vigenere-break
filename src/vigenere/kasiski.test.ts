import { describe, expect, it } from 'vitest';
import { factorsOf, findRepeats, gcd, kasiski, tallyFactors } from './kasiski';
import { encrypt } from './cipher';
import { SAMPLES } from '../samples';

describe('Kasiski examination', () => {
  it('factorsOf returns proper factors within range', () => {
    expect(factorsOf(12, 20)).toEqual([2, 3, 4, 6, 12]);
    expect(factorsOf(15, 20)).toEqual([3, 5, 15]);
    expect(factorsOf(7, 20)).toEqual([7]); // prime
  });

  it('gcd is correct', () => {
    expect(gcd(12, 18)).toBe(6);
    expect(gcd(35, 14)).toBe(7);
  });

  it('finds repeated substrings and their spacings', () => {
    // ABCXXABC: "ABC" repeats at 0 and 5 → spacing 5
    const repeats = findRepeats('ABCXXABC', 3, 3);
    const abc = repeats.find((r) => r.substring === 'ABC');
    expect(abc).toBeDefined();
    expect(abc!.positions).toEqual([0, 5]);
    expect(abc!.spacings).toEqual([5]);
  });

  it('tallyFactors counts every factor of every spacing', () => {
    // spacings 6 and 9 → factors of 6: 2,3,6 ; factors of 9: 3,9 ; 3 appears twice
    const tally = tallyFactors([6, 9], 20);
    const three = tally.find((t) => t.factor === 3);
    expect(three!.count).toBe(2);
  });

  it('surfaces the true key length among top factor candidates (known short key)', () => {
    const key = 'LEMON'; // length 5
    const sample = SAMPLES.find((s) => s.id === 'declaration')!;
    const ct = encrypt(sample.plaintext, key).lettersOnly;
    const result = kasiski(ct, { maxKeyLength: 20 });
    // 5 should be among the strongest candidates
    expect(result.candidates).toContain(5);
    expect(result.candidates.slice(0, 3)).toContain(5);
  });

  it('returns no candidates when there are no repeats', () => {
    const result = kasiski('ABCDEFGHIJ', { maxKeyLength: 20 });
    expect(result.repeats).toEqual([]);
    expect(result.candidates).toEqual([]);
  });
});
