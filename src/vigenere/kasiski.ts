// Kasiski examination: find repeated substrings, measure the spacings between
// their occurrences, factor those spacings, and rank factors as key-length
// candidates. Repeated plaintext encrypted at the same key offset produces
// repeated ciphertext; the spacing is therefore a multiple of the key length.

import type { FactorTally, KasiskiRepeat, KasiskiResult } from './types';

/** All factors of n in [2, maxFactor]. */
export function factorsOf(n: number, maxFactor: number): number[] {
  const out: number[] = [];
  const cap = Math.min(maxFactor, n);
  for (let f = 2; f <= cap; f++) {
    if (n % f === 0) out.push(f);
  }
  return out;
}

/** Greatest common divisor (used for the GCD-of-spacings view). */
export function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

/**
 * Find repeated substrings of length `minLen`..`maxLen` and their positions.
 * Only substrings occurring at least twice are kept. Positions index into the
 * letters-only text.
 */
export function findRepeats(letters: string, minLen = 3, maxLen = 5): KasiskiRepeat[] {
  const seen = new Map<string, number[]>();
  for (let len = minLen; len <= maxLen; len++) {
    for (let i = 0; i + len <= letters.length; i++) {
      const sub = letters.slice(i, i + len);
      const arr = seen.get(sub);
      if (arr) arr.push(i);
      else seen.set(sub, [i]);
    }
  }

  const repeats: KasiskiRepeat[] = [];
  for (const [substring, positions] of seen) {
    if (positions.length < 2) continue;
    const spacings: number[] = [];
    for (let i = 1; i < positions.length; i++) {
      spacings.push(positions[i] - positions[i - 1]);
    }
    repeats.push({ substring, positions, spacings });
  }

  // Longer, more-frequent repeats first — they're the strongest evidence.
  repeats.sort(
    (a, b) =>
      b.substring.length - a.substring.length ||
      b.positions.length - a.positions.length ||
      a.substring.localeCompare(b.substring)
  );
  return repeats;
}

/**
 * Tally factors across all spacings. A spacing of S contributes one count to
 * every factor of S in [2, maxFactor]. Factor 1 is excluded (trivial). The most
 * frequent factors are the strongest key-length candidates.
 */
export function tallyFactors(spacings: number[], maxFactor: number): FactorTally[] {
  const counts = new Map<number, number>();
  for (const s of spacings) {
    for (const f of factorsOf(s, maxFactor)) {
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([factor, count]) => ({ factor, count }))
    .sort((a, b) => b.count - a.count || a.factor - b.factor);
}

export interface KasiskiOptions {
  minLen?: number;
  maxLen?: number;
  maxKeyLength?: number;
}

/**
 * Full Kasiski examination. Returns repeats, the flat list of spacings, the
 * factor tally, and ranked candidate key lengths (most-supported factor first).
 * When no repeats are found, `candidates` is empty and the caller must fall back
 * to IoC-only analysis.
 */
export function kasiski(letters: string, options: KasiskiOptions = {}): KasiskiResult {
  const { minLen = 3, maxLen = 5, maxKeyLength = 20 } = options;
  const repeats = findRepeats(letters, minLen, maxLen);
  const spacings = repeats.flatMap((r) => r.spacings);
  const factors = tallyFactors(spacings, maxKeyLength);
  const candidates = factors.map((f) => f.factor);
  return { repeats, spacings, factors, candidates };
}
