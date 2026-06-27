// Confidence scoring for the break. Turns the raw statistics into honest,
// human-readable confidence so the UI can show HOW sure the diagnosis is and
// WHERE the user should intervene first — never a bare yes/no.

import { ENGLISH_IOC, RANDOM_IOC, averageIocForPeriod } from './ioc';
import { MIN_COLUMN_LENGTH } from './break';
import type { Analysis } from './break';
import type { ColumnSolve } from './types';

export type ConfidenceLabel = 'high' | 'medium' | 'low' | 'inconclusive';

export interface KeyLengthConfidence {
  score: number; // 0..1
  label: ConfidenceLabel;
  /** IoC of the chosen period normalised between random (0) and English (1). */
  iocStrength: number;
  /** Whether Kasiski's factor tally independently supports this length. */
  kasiskiSupport: boolean;
  /** Letters per column at this length. */
  columnSize: number;
  /** Plain-English contributing factors, strongest first. */
  reasons: string[];
}

/** Normalise an IoC value to 0 (uniform random) .. 1 (English). */
export function iocStrength(ioc: number): number {
  return clamp01((ioc - RANDOM_IOC) / (ENGLISH_IOC - RANDOM_IOC));
}

export function keyLengthConfidence(
  analysis: Analysis,
  keyLength: number
): KeyLengthConfidence {
  const { letters, diagnosis, kasiski } = analysis;
  const columnSize = keyLength > 0 ? Math.floor(letters.length / keyLength) : 0;

  if (keyLength < 1) {
    return {
      score: 0,
      label: 'inconclusive',
      iocStrength: 0,
      kasiskiSupport: false,
      columnSize: 0,
      reasons: ['No key-length hypothesis could be formed from the statistics.'],
    };
  }

  const ioc = averageIocForPeriod(letters, keyLength);
  const strength = iocStrength(ioc);

  const maxCount = kasiski.factors.length > 0 ? kasiski.factors[0].count : 0;
  const factor = kasiski.factors.find((f) => f.factor === keyLength);
  const kasiskiSupport = maxCount > 0 && (factor?.count ?? 0) >= 0.5 * maxCount;

  // Column-size factor: full credit at/above the reliability floor, scaling down.
  const sizeFactor = clamp01(columnSize / (MIN_COLUMN_LENGTH * 2));

  // Weighted blend: IoC carries the most weight, Kasiski corroborates, column
  // size gates reliability.
  const score = clamp01(
    0.55 * strength + 0.2 * (kasiskiSupport ? 1 : 0) + 0.25 * sizeFactor
  );

  const reasons: string[] = [];
  reasons.push(
    strength >= 0.75
      ? `Strong IoC: period ${keyLength} columns look English-like (IoC ${ioc.toFixed(4)}).`
      : strength >= 0.45
        ? `Moderate IoC at period ${keyLength} (${ioc.toFixed(4)}).`
        : `Weak IoC at period ${keyLength} (${ioc.toFixed(4)}) — columns barely resemble English.`
  );
  reasons.push(
    kasiskiSupport
      ? 'Kasiski factor analysis corroborates this length.'
      : kasiski.repeats.length === 0
        ? 'Kasiski found no repeats — IoC is carrying the diagnosis alone.'
        : 'Kasiski does not clearly corroborate this length.'
  );
  if (columnSize < MIN_COLUMN_LENGTH) {
    reasons.push(`Thin columns (~${columnSize} letters each) make per-column solving unreliable.`);
  } else {
    reasons.push(`Healthy column size (~${columnSize} letters each).`);
  }
  if (diagnosis.converges) reasons.unshift('Kasiski and IoC converge — the strongest possible signal.');

  return {
    score,
    label: scoreToLabel(score),
    iocStrength: strength,
    kasiskiSupport,
    columnSize,
    reasons,
  };
}

export type ColumnVerdict = 'clear winner' | 'close call' | 'too little data';

export interface ColumnConfidence {
  index: number;
  /** Relative chi-squared gap between best and runner-up shift. */
  gap: number;
  score: number; // 0..1
  verdict: ColumnVerdict;
}

/**
 * Per-column confidence from the chi-squared separation between the best and the
 * runner-up shift. A wide gap = a clear winner; a narrow gap = a close call the
 * user may need to arbitrate; too few letters = not enough data.
 */
export function columnConfidence(col: ColumnSolve): ColumnConfidence {
  const best = col.chiByShift[col.rankedShifts[0]];
  const second = col.chiByShift[col.rankedShifts[1]];

  if (col.letters.length < MIN_COLUMN_LENGTH || !Number.isFinite(best) || best <= 0) {
    return { index: col.index, gap: 0, score: 0, verdict: 'too little data' };
  }

  const gap = (second - best) / best; // larger = more separated
  // Map the gap to a 0..1 score; ~0.5 relative gap is already a confident solve.
  const score = clamp01(gap / 0.6);
  const verdict: ColumnVerdict = gap >= 0.25 ? 'clear winner' : 'close call';
  return { index: col.index, gap, score, verdict };
}

/** Columns most in need of attention (lowest confidence first). */
export function suspiciousColumns(cols: ColumnSolve[]): ColumnConfidence[] {
  return cols
    .map(columnConfidence)
    .filter((c) => c.verdict !== 'clear winner')
    .sort((a, b) => a.score - b.score);
}

function scoreToLabel(score: number): ConfidenceLabel {
  if (score >= 0.7) return 'high';
  if (score >= 0.45) return 'medium';
  if (score > 0) return 'low';
  return 'inconclusive';
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
