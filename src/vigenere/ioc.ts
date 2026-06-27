// Index of coincidence: the probability that two letters drawn at random from a
// text are equal. Friedman's statistic, used here to score candidate key lengths.

import { letterCounts } from './frequency';
import type { IocCandidate } from './types';

/** Expected IoC of monoalphabetic English text (≈ 0.0667). */
export const ENGLISH_IOC = 0.0667;

/** Expected IoC of uniform-random text over 26 letters (= 1/26 ≈ 0.0385). */
export const RANDOM_IOC = 1 / 26;

/**
 * Index of coincidence of a single string:
 *
 *   IoC = Σ n_i (n_i - 1) / ( N (N - 1) )
 *
 * Returns 0 for strings shorter than 2 (undefined denominator).
 */
export function indexOfCoincidence(letters: string): number {
  const N = letters.length;
  if (N < 2) return 0;
  const counts = letterCounts(letters);
  let sum = 0;
  for (const n of counts) sum += n * (n - 1);
  return sum / (N * (N - 1));
}

/** Split letters into `period` columns (column c = letters at positions ≡ c mod period). */
export function splitColumns(letters: string, period: number): string[] {
  const cols: string[][] = Array.from({ length: period }, () => []);
  for (let i = 0; i < letters.length; i++) {
    cols[i % period].push(letters[i]);
  }
  return cols.map((c) => c.join(''));
}

/** Average IoC across the columns for a given period. */
export function averageIocForPeriod(letters: string, period: number): number {
  const cols = splitColumns(letters, period);
  let sum = 0;
  let counted = 0;
  for (const col of cols) {
    if (col.length >= 2) {
      sum += indexOfCoincidence(col);
      counted++;
    }
  }
  return counted === 0 ? 0 : sum / counted;
}

/**
 * Evaluate every period from 1..maxPeriod, returning the average IoC and its
 * distance from the English target. Ranking is left to the caller (the break
 * combines this with Kasiski).
 */
export function iocCandidates(letters: string, maxPeriod: number): IocCandidate[] {
  const out: IocCandidate[] = [];
  const cap = Math.min(maxPeriod, Math.floor(letters.length / 2));
  for (let period = 1; period <= cap; period++) {
    const averageIoc = averageIocForPeriod(letters, period);
    out.push({
      period,
      averageIoc,
      distanceFromEnglish: Math.abs(averageIoc - ENGLISH_IOC),
    });
  }
  return out;
}
