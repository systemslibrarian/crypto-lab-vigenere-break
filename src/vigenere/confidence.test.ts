import { describe, expect, it } from 'vitest';
import { analyzeCiphertext, runBreak } from './break';
import { columnConfidence, keyLengthConfidence, suspiciousColumns } from './confidence';
import { sampleById } from '../samples';

describe('Key-length confidence', () => {
  it('is high for a long sample with a short key (Declaration / LEMON)', () => {
    const s = sampleById('declaration')!;
    const analysis = analyzeCiphertext(s.ciphertext);
    const conf = keyLengthConfidence(analysis, 5);
    expect(conf.label === 'high' || conf.label === 'medium').toBe(true);
    expect(conf.score).toBeGreaterThan(0.55);
    expect(conf.iocStrength).toBeGreaterThan(0.6);
    expect(conf.reasons.length).toBeGreaterThan(0);
  });

  it('is inconclusive when no key length is found', () => {
    const s = sampleById('short')!;
    const analysis = analyzeCiphertext(s.ciphertext);
    const conf = keyLengthConfidence(analysis, 0);
    expect(conf.label).toBe('inconclusive');
    expect(conf.score).toBe(0);
  });

  it('drops confidence for an implausible (wrong) length', () => {
    const s = sampleById('declaration')!;
    const analysis = analyzeCiphertext(s.ciphertext);
    const right = keyLengthConfidence(analysis, 5);
    const wrong = keyLengthConfidence(analysis, 7);
    expect(right.score).toBeGreaterThan(wrong.score);
  });
});

describe('Per-column confidence', () => {
  it('flags clear winners on a clean break', () => {
    const s = sampleById('declaration')!;
    const result = runBreak(s.ciphertext);
    const verdicts = result.columns.map((c) => columnConfidence(c).verdict);
    expect(verdicts.filter((v) => v === 'clear winner').length).toBeGreaterThan(0);
  });

  it('suspiciousColumns excludes clear winners and sorts weakest first', () => {
    const s = sampleById('declaration')!;
    const result = runBreak(s.ciphertext);
    const sus = suspiciousColumns(result.columns);
    for (const c of sus) expect(c.verdict).not.toBe('clear winner');
    for (let i = 1; i < sus.length; i++) expect(sus[i].score).toBeGreaterThanOrEqual(sus[i - 1].score);
  });
});
