// Per-column Caesar solver via chi-squared against English letter frequencies.

import { indexToLetter, letterToIndex } from './cipher';

/**
 * English letter frequencies (relative, A–Z), from standard corpus counts.
 * Values are fractions summing to ~1.0. Source: widely-cited concatenated
 * English-text frequencies (Lewand / Cornell). Used for both IoC sanity and
 * chi-squared scoring.
 */
export const ENGLISH_FREQ: number[] = [
  0.08167, 0.01492, 0.02782, 0.04253, 0.12702, 0.02228, 0.02015, 0.06094,
  0.06966, 0.00153, 0.00772, 0.04025, 0.02406, 0.06749, 0.07507, 0.01929,
  0.00095, 0.05987, 0.06327, 0.09056, 0.02758, 0.00978, 0.0236, 0.0015,
  0.01974, 0.00074,
];

/** Count of each letter A–Z in a letters-only string. */
export function letterCounts(letters: string): number[] {
  const counts = new Array(26).fill(0);
  for (const ch of letters) counts[letterToIndex(ch)]++;
  return counts;
}

/**
 * Chi-squared statistic for a column hypothesised to have been Caesar-shifted
 * by `shift`. We "decrypt" the column by subtracting the shift, then compare the
 * resulting distribution against expected English counts.
 *
 *   chi2 = Σ (observed - expected)^2 / expected
 *
 * Lower is a better fit to English.
 */
export function chiSquaredForShift(counts: number[], total: number, shift: number): number {
  if (total === 0) return Infinity;
  let chi = 0;
  for (let i = 0; i < 26; i++) {
    // Letter i in the decrypted column came from ciphertext letter (i + shift).
    const observed = counts[(i + shift) % 26];
    const expected = ENGLISH_FREQ[i] * total;
    const diff = observed - expected;
    chi += (diff * diff) / expected;
  }
  return chi;
}

export interface ColumnAnalysis {
  bestShift: number;
  keyLetter: string;
  chiByShift: number[];
  rankedShifts: number[];
  ambiguous: boolean;
}

/**
 * Solve one column as a Caesar shift. Returns the best shift (lowest chi-squared),
 * the implied key letter, the full chi-squared profile, and an ambiguity flag set
 * when the two best shifts are within a small relative margin (a real tie the user
 * should arbitrate, per the spec's edge case).
 */
export function solveColumn(letters: string): ColumnAnalysis {
  const counts = letterCounts(letters);
  const total = letters.length;
  const chiByShift: number[] = [];
  for (let shift = 0; shift < 26; shift++) {
    chiByShift.push(chiSquaredForShift(counts, total, shift));
  }
  const rankedShifts = [...chiByShift.keys()].sort((a, b) => chiByShift[a] - chiByShift[b]);
  const best = rankedShifts[0];
  const second = rankedShifts[1];
  // Ambiguous when the runner-up is within 15% of the best score (and finite).
  const ambiguous =
    Number.isFinite(chiByShift[best]) &&
    Number.isFinite(chiByShift[second]) &&
    chiByShift[second] - chiByShift[best] < 0.15 * chiByShift[best];

  return {
    bestShift: best,
    keyLetter: indexToLetter(best),
    chiByShift,
    rankedShifts,
    ambiguous,
  };
}
