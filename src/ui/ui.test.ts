// @vitest-environment happy-dom
// DOM smoke tests: mount the panels, confirm they render without throwing and
// that the workbench surfaces keys, confidence, heatmaps, challenge mode, the
// solver transcript, sample metadata, and shareable URL state.

import { beforeEach, describe, expect, it } from 'vitest';
import { createCipherPanel } from './cipherPanel';
import { createBreakWorkbench } from './breakWorkbench';
import { createExplainer } from './explainer';
import { SAMPLES } from '../samples';

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

  it('surfaces the recovered key and broken banner for Declaration (LEMON)', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    expect(wb.querySelector('.keyout')!.textContent).toBe('LEMON');
    expect(wb.textContent).toMatch(/Cipher broken/i);
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
