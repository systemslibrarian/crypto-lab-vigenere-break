// @vitest-environment happy-dom
// DOM smoke tests: mount the panels, confirm they render without throwing and
// that the workbench surfaces keys, confidence, heatmaps, challenge mode, the
// solver transcript, sample metadata, and shareable URL state.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCipherPanel } from './cipherPanel';
import { createBreakWorkbench } from './breakWorkbench';
import { createExplainer } from './explainer';
import { SAMPLES } from '../samples';
import { encrypt } from '../vigenere/cipher';
import { analyzeCiphertext, runBreak } from '../vigenere/break';
import { plaintextQuality } from '../vigenere/quality';
import { buildTranscript } from './transcript';

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => {} },
  });
  // Reset URL state so one workbench instance does not leak into the next.
  history.replaceState(null, '', location.pathname);
  document.body.innerHTML = '';
});

describe('Cipher panel (DOM)', () => {
  it('mounts and shows ciphertext for the default input', () => {
    const panel = createCipherPanel();
    document.body.append(panel);
    const out = panel.querySelector('.mono-out');
    expect(out!.textContent!.length).toBeGreaterThan(0);
    expect(panel.querySelectorAll('.strip .cell').length).toBeGreaterThan(1);
  });

  it('shows an error for a non-letter key without crashing', () => {
    const panel = createCipherPanel();
    document.body.append(panel);
    const key = panel.querySelector('#cipher-key') as HTMLInputElement;
    key.value = '123';
    key.dispatchEvent(new Event('input'));
    expect(panel.querySelector('[role="alert"]')!.textContent).toMatch(/letters/i);
  });
});

describe('Break workbench (DOM)', () => {
  it('renders the five steps and the progress rail', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    expect(wb.querySelectorAll('.step').length).toBe(5);
    expect(wb.querySelectorAll('.rail-step').length).toBe(4);
  });

  it('verifies the solver candidate against the bundled Declaration answer (LEMON)', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    expect(wb.querySelector('.keyout')!.textContent).toBe('LEMON');
    expect(wb.textContent).toMatch(/Verified against the bundled answer/i);
    expect(wb.querySelector('.rail-step:last-child')?.className).toMatch(/done/);
  });

  it('keeps a high-scoring wrong MEMON candidate unverified for custom ciphertext', () => {
    // Reproducer: the wrong first shift corrupts every fifth letter, yet
    // surviving words and bigrams push the English heuristic above its floor.
    const plain = 'We can meet at the river in the morning and take the road to the old house. We should bring some food and water with us because the walk will take more time than we think. The people from the town will be there when we arrive and they will help us find the way home. '.repeat(10);
    const ciphertext = encrypt(plain, 'LEMON').text;
    const wrong = runBreak(ciphertext, { keyLength: 5, shiftOverrides: { 0: 12, 1: 4, 2: 12, 3: 14, 4: 13 } });
    expect(wrong.key).toBe('MEMON');
    expect(wrong.plaintext).not.toBe(plain.toUpperCase());
    expect(plaintextQuality(wrong.plaintext).combined).toBeCloseTo(0.685601, 5);
    const transcript = buildTranscript(analyzeCiphertext(ciphertext), wrong);
    expect(transcript[transcript.length - 1]).toMatch(/plausible candidate only/i);
    expect(buildTranscript(analyzeCiphertext(ciphertext), wrong).join(' ')).not.toMatch(/cipher is broken/i);

    const wb = createBreakWorkbench();
    document.body.append(wb);
    const input = wb.querySelector('#ct-input') as HTMLTextAreaElement;
    input.value = ciphertext;
    input.dispatchEvent(new Event('input'));
    const length = wb.querySelector('#key-length-select') as HTMLSelectElement;
    length.value = '5';
    length.dispatchEvent(new Event('change'));
    const shifts = [12, 4, 12, 14, 13];
    shifts.forEach((shift, i) => {
      const select = wb.querySelectorAll('.col-card select')[i] as HTMLSelectElement;
      select.value = String(shift);
      select.dispatchEvent(new Event('change'));
    });
    expect(wb.querySelector('.keyout')?.textContent).toBe('MEMON');
    expect(wb.textContent).toMatch(/English-like candidate; custom ciphertext has no bundled answer/i);
    expect(wb.textContent).toMatch(/manually chosen or hinted/i);
    expect(wb.querySelector('.rail-step:last-child')?.className).toMatch(/active/);
    expect(wb.textContent).not.toMatch(/Verified against the bundled answer/i);
  });

  it('requires the bundled answer in challenge mode, not English-likeness', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    (wb.querySelectorAll('.toggle-group button')[1] as HTMLButtonElement).click();
    [12, 4, 12, 14, 13].forEach((shift, i) => {
      const select = wb.querySelectorAll('.col-card select')[i] as HTMLSelectElement;
      select.value = String(shift);
      select.dispatchEvent(new Event('change'));
    });
    [...wb.querySelectorAll('button')].find((b) => b.textContent === 'Submit solution')!.click();
    expect(wb.querySelector('.keyout')?.textContent).toBe('MEMON');
    expect(wb.textContent).toMatch(/Score 0\/100/);
    expect(wb.textContent).toMatch(/Not verified against the bundled answer/i);
    expect(wb.querySelector('.rail-step:last-child')?.className).toMatch(/active/);
  });

  it('shows sample metadata (category + what to notice)', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    const meta = wb.querySelector('#sample-meta')!;
    expect(meta.textContent).toMatch(/Ideal case/i);
    expect(meta.textContent).toMatch(/convergence/i);
  });

  it('shows letter counters', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    expect(wb.querySelector('#ct-counts')!.textContent).toMatch(/letters \(analysed\)/);
  });

  it('shows a confidence dashboard with a labelled level', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    expect(wb.textContent).toMatch(/Key-length confidence/i);
    expect(wb.querySelector('.conf-badge')).toBeTruthy();
  });

  it('renders a 26-cell chi-squared heatmap per column', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    const firstHeatmap = wb.querySelector('.heatmap')!;
    expect(firstHeatmap.querySelectorAll('.heat-cell').length).toBe(26);
  });

  it('reports inconclusive for the short sample', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    const select = wb.querySelector('#sample-pick') as HTMLSelectElement;
    select.value = 'short';
    select.dispatchEvent(new Event('change'));
    expect(wb.textContent).toMatch(/inconclusive|more text|too short/i);
  });

  it('flags the non-English (Latin) sample as not reading like English', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    const select = wb.querySelector('#sample-pick') as HTMLSelectElement;
    select.value = 'latin';
    select.dispatchEvent(new Event('change'));
    expect(wb.textContent).toMatch(/partially readable|not English|gibberish/i);
  });

  it('lets the user override key length and re-renders columns', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    const klSelect = wb.querySelector('#key-length-select') as HTMLSelectElement;
    klSelect.value = '5';
    klSelect.dispatchEvent(new Event('change'));
    expect(wb.querySelectorAll('.col-card').length).toBe(5);
    // Override is reflected in the shareable URL.
    expect(location.hash).toMatch(/kl=5/);
  });

  it('honours max key length, limiting the IoC candidate range', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    const maxKl = wb.querySelector('#max-kl') as HTMLInputElement;
    maxKl.value = '8';
    maxKl.dispatchEvent(new Event('change'));
    const bars = wb.querySelectorAll('.bars .bar-row');
    // Periods L=1..8 → 8 rows, well below the default cap of 20.
    expect(bars.length).toBeLessThanOrEqual(8);
    expect(bars.length).toBeGreaterThan(1);
  });

  it('challenge mode hides the key and offers submit + hints', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    (wb.querySelectorAll('.toggle-group button')[1] as HTMLButtonElement).click(); // Challenge
    expect(wb.textContent).toMatch(/Challenge mode/i);
    expect([...wb.querySelectorAll('button')].some((b) => /Submit/i.test(b.textContent || ''))).toBe(true);
    expect([...wb.querySelectorAll('button')].some((b) => /Hint/i.test(b.textContent || ''))).toBe(true);
    // Key letters are masked.
    expect([...wb.querySelectorAll('.keyletter')].some((k) => k.textContent === '?')).toBe(true);
  });

  it('"Run the attack" reveals the solver transcript', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    (wb.querySelector('#run-attack') as HTMLButtonElement).click();
    const t = wb.querySelector('#transcript')!;
    expect((t as HTMLElement).hidden).toBe(false);
    expect(t.textContent).toMatch(/Solver transcript/i);
  });

  it('retires an in-flight solver transcript when the ciphertext changes', async () => {
    vi.useFakeTimers();
    try {
      const wb = createBreakWorkbench();
      document.body.append(wb);
      const run = wb.querySelector('#run-attack') as HTMLButtonElement;
      const transcript = wb.querySelector('#transcript') as HTMLElement;

      run.click();
      expect(transcript.hidden).toBe(false);
      expect(transcript.textContent).toMatch(/Solver transcript/i);

      const ciphertext = wb.querySelector('#ct-input') as HTMLTextAreaElement;
      ciphertext.value = 'A different ciphertext';
      ciphertext.dispatchEvent(new Event('input'));

      expect(transcript.hidden).toBe(true);
      expect(transcript.textContent).toBe('');
      expect(run.disabled).toBe(false);

      // Let the superseded delay resume. It must see the changed revision and leave the
      // retired transcript empty instead of appending conclusions from the old ciphertext.
      await vi.runAllTimersAsync();
      expect(transcript.hidden).toBe(true);
      expect(transcript.textContent).toBe('');
      expect(run.disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores state from the URL hash', () => {
    history.replaceState(null, '', location.pathname + '#s=gettysburg&kl=6');
    const wb = createBreakWorkbench();
    document.body.append(wb);
    expect((wb.querySelector('#sample-pick') as HTMLSelectElement).value).toBe('gettysburg');
    expect(wb.querySelectorAll('.col-card').length).toBe(6);
  });
});

describe('Explainer (DOM)', () => {
  it('mounts, spotlights columns, and toggles to the history view', () => {
    const ex = createExplainer();
    document.body.append(ex);
    expect(ex.textContent).toMatch(/Caesar cipher/i);
    const histBtn = [...ex.querySelectorAll('button')].find((b) => /history/i.test(b.textContent || ''))!;
    histBtn.click();
    expect(ex.textContent).toMatch(/Kasiski/i);
  });
});

describe('Samples', () => {
  it('exposes the six teaching scenarios plus the short failure case', () => {
    expect(SAMPLES.length).toBe(7);
    expect(SAMPLES.map((s) => s.category)).toContain('non-english');
    expect(SAMPLES.map((s) => s.category)).toContain('boundary');
  });
});
