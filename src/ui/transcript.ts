// Pure builder for the solver's decision transcript — the running commentary the
// "Run the attack" animation reveals. Kept pure (no DOM) so it is unit-testable
// and so the same lines drive both the animated and reduced-motion paths.

import type { Analysis } from '../vigenere/break';
import type { BreakResult } from '../vigenere/types';
import { keyLengthConfidence, columnConfidence } from '../vigenere/confidence';
import { plaintextQuality } from '../vigenere/quality';
import { indexToLetter } from '../vigenere/cipher';

export function buildTranscript(analysis: Analysis, result: BreakResult): string[] {
  const lines: string[] = [];
  const kas = analysis.kasiski;

  // Stage 1 — Kasiski.
  if (kas.repeats.length > 0) {
    const longest = kas.repeats[0];
    lines.push(
      `Scanning for repeated substrings… found ${kas.repeats.length} (longest “${longest.substring}”, ${longest.positions.length}× ).`
    );
    const topFactors = kas.factors.slice(0, 4).map((f) => `${f.factor}×${f.count}`).join(', ');
    lines.push(`Factoring the spacings between repeats… top factors: ${topFactors || 'none'}.`);
  } else {
    lines.push('Scanning for repeated substrings… none of length ≥ 3. Kasiski is blind here.');
  }

  // Stage 2 — IoC / key length.
  if (result.keyLength < 1) {
    lines.push(
      'Index of coincidence by period… no period looks English-like. The statistics are inconclusive — refusing to guess a key length.'
    );
    if (result.note) lines.push(result.note);
    return lines;
  }

  const conf = keyLengthConfidence(analysis, result.keyLength);
  const iocAtLen = analysis.iocCandidates.find((c) => c.period === result.keyLength);
  lines.push(
    `Index of coincidence by period… peak at L=${result.keyLength}` +
      (iocAtLen ? ` (avg IoC ${iocAtLen.averageIoc.toFixed(4)}, English ≈ 0.0667).` : '.')
  );
  lines.push(
    analysis.diagnosis.converges
      ? `Kasiski and IoC converge on length ${result.keyLength} — ${conf.label} confidence.`
      : kas.repeats.length === 0
        ? `Kasiski found nothing, so IoC is carrying the diagnosis (length ${result.keyLength}, ${conf.label} confidence).`
        : `Kasiski did not clearly corroborate; treating length ${result.keyLength} as a working hypothesis (${conf.label} confidence).`
  );

  // Stage 3 — column solve.
  lines.push(`Splitting into ${result.keyLength} columns, each now a Caesar cipher. Solving by chi-squared vs English…`);
  for (const col of result.columns) {
    const verdict = columnConfidence(col).verdict;
    lines.push(`  Column ${col.index + 1} → key “${indexToLetter(col.bestShift)}” (${verdict}).`);
  }

  // Stage 4 — result.
  const q = plaintextQuality(result.plaintext);
  lines.push(`Assembled key: ${result.key}.`);
  if (q.label === 'reads as English') {
    lines.push('Decryption reads as English → the cipher is broken. The exploit landed.');
  } else if (q.label === 'partially readable') {
    lines.push('Decryption is only partially readable — one or more columns are off, or the language is not English. Inspect the weak columns.');
  } else {
    lines.push('Decryption still looks like gibberish — the hypothesis or a column is wrong. Iterate.');
  }
  return lines;
}
