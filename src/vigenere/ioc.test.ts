import { describe, expect, it } from 'vitest';
import {
  ENGLISH_IOC,
  RANDOM_IOC,
  averageIocForPeriod,
  indexOfCoincidence,
  splitColumns,
} from './ioc';
import { ENGLISH_FREQ } from './frequency';
import { encrypt, indexToLetter } from './cipher';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 0x100000000);
}

// Generate text whose letter distribution follows ENGLISH_FREQ.
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

function uniformRandom(rng: () => number, len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += indexToLetter(Math.floor(rng() * 26));
  return out;
}

describe('Index of coincidence', () => {
  it('uniform-random text has IoC ≈ 1/26 (0.0385)', () => {
    const rng = lcg(7);
    const text = uniformRandom(rng, 20000);
    expect(indexOfCoincidence(text)).toBeCloseTo(RANDOM_IOC, 2);
  });

  it('English-like text has IoC notably higher than random and near ~0.0667', () => {
    const rng = lcg(11);
    const text = englishLike(rng, 20000);
    const ioc = indexOfCoincidence(text);
    expect(ioc).toBeGreaterThan(0.06);
    expect(ioc).toBeLessThan(0.075);
    expect(ioc).toBeGreaterThan(RANDOM_IOC + 0.015);
  });

  it('English IoC target constant is ~0.0667', () => {
    expect(ENGLISH_IOC).toBeCloseTo(0.0667, 3);
  });

  it('IoC of short strings is defined (0 for length < 2)', () => {
    expect(indexOfCoincidence('')).toBe(0);
    expect(indexOfCoincidence('A')).toBe(0);
    expect(indexOfCoincidence('AA')).toBe(1);
  });

  it('splitColumns distributes letters by position mod period', () => {
    expect(splitColumns('ABCDEF', 3)).toEqual(['AD', 'BE', 'CF']);
    expect(splitColumns('ABCDEFG', 2)).toEqual(['ACEG', 'BDF']);
  });

  it('averaged column IoC peaks at the true key length for Vigenère ciphertext', () => {
    const rng = lcg(99);
    const plain = englishLike(rng, 3000);
    const key = 'SECRET'; // length 6
    const ct = encrypt(plain, key).lettersOnly;

    const atTrue = averageIocForPeriod(ct, 6);
    const atWrong = averageIocForPeriod(ct, 5);
    const atSeven = averageIocForPeriod(ct, 7);

    expect(atTrue).toBeGreaterThan(0.06);
    expect(atTrue).toBeGreaterThan(atWrong + 0.01);
    expect(atTrue).toBeGreaterThan(atSeven + 0.01);
  });
});
