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

  it('small factors do NOT always score highest (5-letter key tops its own tally)', () => {
    // Pins the Step-1 caution. 2 and 3 do not divide every spacing: they only
    // divide the ones they happen to divide, plus every true spacing when they
    // divide the key length. With the prime length 5 they do neither, so the
    // key length itself wins outright.
    const sample = SAMPLES.find((s) => s.id === 'declaration')!; // key LEMON, length 5
    const { factors } = kasiski(encrypt(sample.plaintext, 'LEMON').lettersOnly, { maxKeyLength: 20 });
    const count = (f: number) => factors.find((t) => t.factor === f)!.count;
    expect(factors[0].factor).toBe(5);
    expect(count(5)).toBe(61);
    expect(count(2)).toBe(31);
    expect(count(3)).toBe(26);
    expect(count(5)).toBeGreaterThan(count(2));
  });

  it('a composite key length is tied, not out-counted, by its own divisors', () => {
    // The other half of the caution: with length 6, every divisor of 6 divides
    // every true spacing, so 2, 3 and 6 tie and the tally's factor-ascending
    // tie-break puts 2 on top.
    const sample = SAMPLES.find((s) => s.id === 'gettysburg')!; // key CIPHER, length 6
    const { factors } = kasiski(encrypt(sample.plaintext, 'CIPHER').lettersOnly, { maxKeyLength: 20 });
    const count = (f: number) => factors.find((t) => t.factor === f)!.count;
    expect([count(2), count(3), count(6)]).toEqual([70, 70, 70]);
    expect(factors[0].factor).toBe(2);
  });

  it('returns no candidates when there are no repeats', () => {
    const result = kasiski('ABCDEFGHIJ', { maxKeyLength: 20 });
    expect(result.repeats).toEqual([]);
    expect(result.candidates).toEqual([]);
  });
});
