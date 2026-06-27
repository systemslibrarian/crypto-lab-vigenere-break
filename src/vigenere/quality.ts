// Plaintext quality: "does this read as English?" — a more honest signal than
// whole-text IoC alone. Combines word-hit rate (decryption preserves spaces, so
// real word boundaries survive), common-bigram coverage, and IoC. Used for the
// result cue and to guide users toward the column that is still wrong.

import { ENGLISH_IOC, RANDOM_IOC, indexOfCoincidence } from './ioc';

/** ~150 most common English words — function words dominate real text. */
const COMMON_WORDS = new Set(
  (
    'the of and a to in is be that it for not on with he as you do at this but his by from they we ' +
    'say her she or an will my one all would there their what so up out if about who get which go me ' +
    'when make can like time no just him know take people into year your good some could them see other ' +
    'than then now look only come its over think also back after use two how our work first well way even ' +
    'new want because any these give day most us are was were has had been have more when men women life ' +
    'man made great little world own under last right move thing should through where before here own those'
  ).split(/\s+/)
);

/** Most common English bigrams with approximate relative frequencies. */
const COMMON_BIGRAMS: Record<string, number> = {
  TH: 0.0356, HE: 0.0307, IN: 0.0243, ER: 0.0205, AN: 0.0199, RE: 0.0185, ON: 0.0176,
  AT: 0.0149, EN: 0.0145, ND: 0.0135, TI: 0.0134, ES: 0.0134, OR: 0.0128, TE: 0.012,
  OF: 0.0117, ED: 0.0117, IS: 0.0113, IT: 0.0112, AL: 0.0109, AR: 0.0107, ST: 0.0105,
  TO: 0.0104, NT: 0.0104, NG: 0.0095, SE: 0.0093, HA: 0.0093, AS: 0.0087, OU: 0.0087,
  IO: 0.0083, LE: 0.0083, VE: 0.0083, CO: 0.0079, ME: 0.0079, DE: 0.0076, HI: 0.0076,
  RI: 0.0073, RO: 0.0073, IC: 0.007,
};
const EXPECTED_BIGRAM_MASS = Object.values(COMMON_BIGRAMS).reduce((a, b) => a + b, 0);

export type QualityLabel = 'reads as English' | 'partially readable' | 'looks like gibberish';

export interface QualityScore {
  ioc: number;
  iocNorm: number; // 0..1
  wordHitRate: number; // 0..1 of tokens that are common words
  bigramScore: number; // 0..1 coverage vs expected common-bigram mass
  combined: number; // 0..1
  label: QualityLabel;
}

export function plaintextQuality(text: string): QualityScore {
  const letters = text.toUpperCase().replace(/[^A-Z]/g, '');
  const ioc = indexOfCoincidence(letters);
  const iocNorm = clamp01((ioc - RANDOM_IOC) / (ENGLISH_IOC - RANDOM_IOC));

  // Word-hit rate over real tokens (spaces/punctuation survive decryption).
  const tokens = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  let hits = 0;
  for (const t of tokens) if (COMMON_WORDS.has(t)) hits++;
  const wordHitRate = tokens.length > 0 ? hits / tokens.length : 0;

  // Common-bigram coverage in the letters-only stream.
  let observedMass = 0;
  const totalBigrams = Math.max(1, letters.length - 1);
  for (let i = 0; i + 1 < letters.length; i++) {
    const bg = letters.slice(i, i + 2);
    if (COMMON_BIGRAMS[bg]) observedMass += 1;
  }
  const observedRate = observedMass / totalBigrams;
  const bigramScore = clamp01(observedRate / EXPECTED_BIGRAM_MASS);

  // Function words make up ~40–50% of real English tokens, so normalise the
  // word-hit rate against ~0.4 for a full-credit signal.
  const wordNorm = clamp01(wordHitRate / 0.4);

  const combined = clamp01(0.5 * wordNorm + 0.3 * bigramScore + 0.2 * iocNorm);

  return {
    ioc,
    iocNorm,
    wordHitRate,
    bigramScore,
    combined,
    label: combined >= 0.6 ? 'reads as English' : combined >= 0.32 ? 'partially readable' : 'looks like gibberish',
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
