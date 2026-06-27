import { describe, expect, it } from 'vitest';
import { ENGLISH_FREQ, chiSquaredForShift, letterCounts, solveColumn } from './frequency';
import { encrypt, indexToLetter } from './cipher';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 0x100000000);
}

function englishLike(rng: () => number, len: number): string {
  const cum: number[] = [];
  let acc = 0;
  for (const f of ENGLISH_FREQ) cum.push((acc += f));
  let out = '';
  for (let i = 0; i < len; i++) {
    const r = rng() * acc;
    let idx = cum.findIndex((c) => r <= c);
    if (idx < 0) idx = 25;
    out += indexToLetter(idx);
  }
  return out;
}

describe('Frequency / chi-squared column solver', () => {
  it('English frequency table sums to ~1.0', () => {
    const sum = ENGLISH_FREQ.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 2);
  });

  it('letterCounts tallies correctly', () => {
    expect(letterCounts('AABBC')).toMatchObject({ 0: 2, 1: 2, 2: 1 });
  });

  it('chi-squared is lowest at the true shift for a Caesar-shifted English column', () => {
    const rng = lcg(3);
    const col = englishLike(rng, 2000);
    const shift = 7; // shift the whole column by H
    const shifted = [...col].map((ch) => indexToLetter(ch.charCodeAt(0) - 65 + shift)).join('');
    const counts = letterCounts(shifted);
    let best = 0;
    let bestChi = Infinity;
    for (let s = 0; s < 26; s++) {
      const chi = chiSquaredForShift(counts, shifted.length, s);
      if (chi < bestChi) {
        bestChi = chi;
        best = s;
      }
    }
    expect(best).toBe(shift);
  });

  it('solveColumn recovers the key letter for an encrypted column', () => {
    const rng = lcg(5);
    const col = englishLike(rng, 1500);
    // Encrypt the column with a single key letter 'K' (shift 10) => a Caesar shift
    const ct = encrypt(col, 'K').lettersOnly;
    const solved = solveColumn(ct);
    expect(solved.bestShift).toBe(10);
    expect(solved.keyLetter).toBe('K');
  });

  it('returns Infinity chi-squared for an empty column', () => {
    expect(chiSquaredForShift(new Array(26).fill(0), 0, 0)).toBe(Infinity);
  });
});
