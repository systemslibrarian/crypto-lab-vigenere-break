// Orchestrates the full break: Kasiski + IoC → key-length hypothesis →
// per-column chi-squared solve → recovered key → decryption. Nothing here is
// hardcoded; every number is derived from the ciphertext passed in.

import { decryptWithShifts, normalize } from './cipher';
import { solveColumn } from './frequency';
import { averageIocForPeriod, iocCandidates, splitColumns } from './ioc';
import { kasiski } from './kasiski';
import type { BreakResult, ColumnSolve, IocCandidate, KasiskiResult } from './types';

export const DEFAULT_MAX_KEY_LENGTH = 20;

/**
 * The maximum averaged IoC across periods must clear this floor before we trust
 * any key-length hypothesis. English columns sit ~0.066; uniform random ~0.0385.
 * A max below this means no period looks English-like — report inconclusive.
 */
export const IOC_MAX_FLOOR = 0.058;

/**
 * Two periods are "equally English-like" when their averaged IoC differ by less
 * than this. Used to pick the fundamental period (smallest divisor of the
 * argmax period whose IoC is within this margin of the maximum) rather than one
 * of its multiples, and to exclude proper sub-divisors whose IoC is markedly
 * lower (e.g. period 3 under a length-6 key).
 */
export const IOC_PEAK_DELTA = 0.008;

/** Minimum letters before the statistics are worth trusting at all. */
export const MIN_LETTERS_FOR_STATS = 50;

/**
 * A period is only considered if each of its columns holds at least this many
 * letters. Without this, a large period splits a short text into 2–3 letter
 * columns whose IoC swings wildly high by chance and fakes a confident peak.
 */
export const MIN_COL_FOR_IOC = 8;

/** Minimum letters per column for chi-squared frequency analysis to be reliable. */
export const MIN_COLUMN_LENGTH = 12;

export interface KeyLengthDiagnosis {
  suggested: number | null;
  /** Smallest period whose averaged IoC clears the English-like threshold. */
  iocPeak: number | null;
  /** Periods (ascending) the IoC flags as English-like. */
  strongIocPeriods: number[];
  /** True when Kasiski's top factor and the IoC peak agree — the satisfying convergence. */
  converges: boolean;
}

/**
 * Choose a key-length hypothesis from Kasiski + IoC evidence.
 *
 * IoC rises at the true period AND stays high at its multiples, so the raw
 * maximum can land on a multiple. We therefore take the *smallest* period whose
 * averaged IoC sits within a small margin of the maximum (and clears the
 * English-like threshold) as the fundamental length.
 *
 * Note we do NOT trust Kasiski's most-frequent factor directly: small factors
 * (2, 3) divide every spacing that the true factor divides, so they always
 * out-count it. Kasiski is used to CONFIRM the IoC peak (convergence), not to
 * pick the length on its own.
 */
export function diagnoseKeyLength(
  letters: string,
  kas: KasiskiResult,
  iocs: IocCandidate[]
): KeyLengthDiagnosis {
  // Too little text to trust any statistic — refuse to fabricate a length.
  if (letters.length < MIN_LETTERS_FOR_STATS) {
    return { suggested: null, iocPeak: null, strongIocPeriods: [], converges: false };
  }

  // Only consider periods whose columns are big enough for IoC to be meaningful.
  const usable = iocs.filter(
    (c) => c.period >= 2 && Math.floor(letters.length / c.period) >= MIN_COL_FOR_IOC
  );
  if (usable.length === 0) {
    return { suggested: null, iocPeak: null, strongIocPeriods: [], converges: false };
  }

  const iocByPeriod = new Map(usable.map((c) => [c.period, c.averageIoc]));
  const argmax = usable.reduce((best, c) => (c.averageIoc > best.averageIoc ? c : best));
  const maxIoc = argmax.averageIoc;

  // Periods whose IoC is within a hair of the maximum — for a Vigenère key of
  // length L these are L and its multiples, which all "light up" together. This
  // mutual reinforcement is the convergence cue shown in the UI.
  const strongIocPeriods = usable
    .filter((c) => c.averageIoc >= maxIoc - IOC_PEAK_DELTA)
    .map((c) => c.period)
    .sort((a, b) => a - b);

  // The fundamental period is the smallest divisor of the argmax period whose IoC
  // is also near the maximum. A proper sub-divisor (e.g. 3 under a length-6 key)
  // has a markedly lower IoC and is excluded; a multiple is larger and loses to
  // the smaller divisor.
  let iocPeak: number | null = null;
  if (maxIoc >= IOC_MAX_FLOOR) {
    for (let d = 2; d <= argmax.period; d++) {
      if (argmax.period % d === 0 && (iocByPeriod.get(d) ?? 0) >= maxIoc - IOC_PEAK_DELTA) {
        iocPeak = d;
        break;
      }
    }
  }

  // Kasiski factor support, normalised against the most-supported factor.
  const maxCount = kas.factors.length > 0 ? kas.factors[0].count : 0;
  const factorCount = new Map(kas.factors.map((f) => [f.factor, f.count]));
  const wellSupported = (p: number) =>
    maxCount > 0 && (factorCount.get(p) ?? 0) >= 0.5 * maxCount;

  const converges = iocPeak !== null && wellSupported(iocPeak);

  // If IoC found no peak at all, fall back to Kasiski's largest well-supported
  // factor — but only when a repeat genuinely occurred.
  let suggested = iocPeak;
  if (suggested === null && kas.candidates.length > 0) {
    const top = kas.factors
      .filter((f) => f.count === maxCount)
      .map((f) => f.factor)
      .sort((a, b) => b - a);
    suggested = top[0] ?? null;
  }

  return { suggested, iocPeak, strongIocPeriods, converges };
}

export interface Analysis {
  letters: string;
  kasiski: KasiskiResult;
  iocCandidates: IocCandidate[];
  diagnosis: KeyLengthDiagnosis;
}

/** Run the diagnostic stages (Kasiski + IoC + key-length diagnosis) only. */
export function analyzeCiphertext(
  ciphertext: string,
  maxKeyLength = DEFAULT_MAX_KEY_LENGTH
): Analysis {
  const letters = normalize(ciphertext);
  const kas = kasiski(letters, { maxKeyLength });
  const iocs = iocCandidates(letters, maxKeyLength);
  const diagnosis = diagnoseKeyLength(letters, kas, iocs);
  return { letters, kasiski: kas, iocCandidates: iocs, diagnosis };
}

/** Solve every column of `letters` at the given period via chi-squared. */
export function solveColumns(letters: string, keyLength: number): ColumnSolve[] {
  const cols = splitColumns(letters, keyLength);
  return cols.map((letters, index) => {
    const a = solveColumn(letters);
    return {
      index,
      letters,
      bestShift: a.bestShift,
      keyLetter: a.keyLetter,
      chiByShift: a.chiByShift,
      rankedShifts: a.rankedShifts,
      ambiguous: a.ambiguous,
    };
  });
}

export interface BreakOptions {
  /** Force a key-length hypothesis (user override). When omitted, it is diagnosed. */
  keyLength?: number;
  /** Per-column shift overrides (index → shift) applied after solving. */
  shiftOverrides?: Record<number, number>;
  maxKeyLength?: number;
}

/**
 * Run the whole pipeline on a raw ciphertext (punctuation allowed; it is
 * stripped for analysis and re-inserted in the decryption).
 */
export function runBreak(ciphertext: string, options: BreakOptions = {}): BreakResult {
  const { shiftOverrides = {}, maxKeyLength = DEFAULT_MAX_KEY_LENGTH } = options;
  const letters = normalize(ciphertext);

  const kas = kasiski(letters, { maxKeyLength });
  const iocs = iocCandidates(letters, maxKeyLength);
  const diagnosis = diagnoseKeyLength(letters, kas, iocs);

  const tooShort = letters.length < MIN_LETTERS_FOR_STATS;
  const keyLength = options.keyLength ?? diagnosis.suggested ?? 0;

  // No hypothesis at all, or not enough text: report honestly, don't fabricate.
  if (keyLength < 1 || (tooShort && options.keyLength === undefined)) {
    return {
      kasiski: kas,
      iocCandidates: iocs,
      keyLength: keyLength < 1 ? 0 : keyLength,
      columns: [],
      key: '',
      plaintext: '',
      inconclusive: true,
      note: tooShort
        ? `Ciphertext has only ${letters.length} letters — below the ~${MIN_LETTERS_FOR_STATS} needed for Kasiski and IoC to resolve a key length. Need more text.`
        : 'No repeated substrings and no clear IoC peak — the statistics are inconclusive. Try a longer ciphertext or set a key length manually.',
    };
  }

  const columns = solveColumns(letters, keyLength);
  const shifts = columns.map((c) =>
    Object.prototype.hasOwnProperty.call(shiftOverrides, c.index)
      ? ((shiftOverrides[c.index] % 26) + 26) % 26
      : c.bestShift
  );
  const key = shifts.map((s) => String.fromCharCode(65 + s)).join('');
  const plaintext = decryptWithShifts(ciphertext, shifts).text;

  // Low-confidence flag: columns too thin for reliable chi-squared, or the
  // chosen length approaches the text length (the OTP boundary).
  const minColLen = Math.floor(letters.length / keyLength);
  const nearOtp = keyLength >= letters.length / 2;
  const thinColumns = minColLen < MIN_COLUMN_LENGTH;

  let inconclusive = false;
  let note = '';
  if (nearOtp) {
    inconclusive = true;
    note = `Key length ${keyLength} approaches the ciphertext length (${letters.length}) — this is the one-time-pad boundary, where each column has too few letters to analyse and the cipher becomes effectively unbreakable by these methods.`;
  } else if (thinColumns) {
    inconclusive = true;
    note = `At key length ${keyLength} each column holds only ~${minColLen} letters (< ${MIN_COLUMN_LENGTH}); chi-squared column solving is unreliable here. Treat the recovered key as low-confidence.`;
  } else {
    note = diagnosis.converges
      ? `Kasiski and IoC agree on length ${keyLength} — strong convergence.`
      : `Working hypothesis: key length ${keyLength}. Kasiski and IoC did not fully agree; try alternatives if the plaintext does not read as English.`;
  }

  return {
    kasiski: kas,
    iocCandidates: iocs,
    keyLength,
    columns,
    key,
    plaintext,
    inconclusive,
    note,
  };
}

/** Convenience: average IoC of a candidate period (re-exported for the UI). */
export { averageIocForPeriod };
