// Shared types for the Vigenère cipher and its cryptanalysis.

/** A single aligned position in an encrypt/decrypt operation. */
export interface AlignedCell {
  /** Plaintext letter (uppercase A–Z). */
  plain: string;
  /** Key letter applied at this position (uppercase A–Z). */
  key: string;
  /** Caesar shift applied (0–25), = key letter index. */
  shift: number;
  /** Resulting ciphertext letter (uppercase A–Z). */
  cipher: string;
}

/** Result of an encrypt/decrypt: the output text plus the per-letter alignment. */
export interface CipherResult {
  /** Output text with non-alpha characters preserved in place. */
  text: string;
  /** Letters-only output (analysis form). */
  lettersOnly: string;
  /** Per-letter alignment over the letters only. */
  alignment: AlignedCell[];
}

/** A repeated substring found by Kasiski examination. */
export interface KasiskiRepeat {
  /** The repeated substring (uppercase letters). */
  substring: string;
  /** Zero-based offsets (into letters-only text) where it occurs. */
  positions: number[];
  /** Spacings between consecutive occurrences. */
  spacings: number[];
}

/** Tally of how often a factor divides the observed Kasiski spacings. */
export interface FactorTally {
  factor: number;
  count: number;
}

export interface KasiskiResult {
  repeats: KasiskiRepeat[];
  /** All spacings observed across every repeat. */
  spacings: number[];
  /** Factor → count, sorted by count descending then factor ascending. */
  factors: FactorTally[];
  /** Ranked key-length candidates (most-supported factors first). */
  candidates: number[];
}

/** Index-of-coincidence assessment for a single candidate period. */
export interface IocCandidate {
  period: number;
  /** Average IoC across the L columns. */
  averageIoc: number;
  /** Absolute distance from the English target (~0.0667). */
  distanceFromEnglish: number;
}

/** Per-column Caesar solve via chi-squared. */
export interface ColumnSolve {
  /** Column index (0-based). */
  index: number;
  /** The column's ciphertext letters. */
  letters: string;
  /** Best shift (0–25) by lowest chi-squared. */
  bestShift: number;
  /** Recovered key letter for this column. */
  keyLetter: string;
  /** chi-squared score for every candidate shift (index = shift). */
  chiByShift: number[];
  /** Top candidate shifts (lowest chi-squared first), for tie display. */
  rankedShifts: number[];
  /** True when the top two shifts are statistically close (ambiguous). */
  ambiguous: boolean;
}

export interface BreakResult {
  kasiski: KasiskiResult;
  iocCandidates: IocCandidate[];
  /** The key length the break settled on (hypothesis). */
  keyLength: number;
  columns: ColumnSolve[];
  /** Assembled recovered key. */
  key: string;
  /** Decryption under the recovered key (non-alpha preserved). */
  plaintext: string;
  /** True when the statistics were too weak to trust (short text / long key). */
  inconclusive: boolean;
  /** Human-readable reason when inconclusive. */
  note: string;
}
