// @vitest-environment happy-dom
// DOM smoke tests: mount the panels, confirm they render without throwing and
// that the break workbench actually surfaces the recovered key for a sample.

import { beforeEach, describe, expect, it } from 'vitest';
import { createCipherPanel } from './cipherPanel';
import { createBreakWorkbench } from './breakWorkbench';
import { SAMPLES } from '../samples';

// Stub clipboard so copy buttons don't throw under happy-dom.
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => {} },
  });
});

describe('Cipher panel (DOM)', () => {
  it('mounts and shows ciphertext for the default input', () => {
    const panel = createCipherPanel();
    document.body.append(panel);
    const out = panel.querySelector('.mono-out');
    expect(out).toBeTruthy();
    expect(out!.textContent!.length).toBeGreaterThan(0);
    // Alignment strip rendered cells.
    expect(panel.querySelectorAll('.strip .cell').length).toBeGreaterThan(1);
  });

  it('shows an error for a non-letter key without crashing', () => {
    const panel = createCipherPanel();
    document.body.append(panel);
    const key = panel.querySelector('#cipher-key') as HTMLInputElement;
    key.value = '123';
    key.dispatchEvent(new Event('input'));
    const alert = panel.querySelector('[role="alert"]');
    expect(alert!.textContent).toMatch(/letters/i);
  });
});

describe('Break workbench (DOM)', () => {
  it('mounts and renders all four steps', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    expect(wb.querySelectorAll('.step').length).toBe(4);
  });

  it('surfaces the recovered key for the Declaration sample (LEMON)', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    // Default sample is the first one (declaration / LEMON).
    const keyout = wb.querySelector('.keyout');
    expect(keyout).toBeTruthy();
    expect(keyout!.textContent).toBe('LEMON');
    // Broken banner present.
    expect(wb.textContent).toMatch(/Cipher broken/i);
  });

  it('reports inconclusive for the short sample', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    const select = wb.querySelector('#sample-pick') as HTMLSelectElement;
    const short = SAMPLES.find((s) => s.id === 'short')!;
    select.value = short.id;
    select.dispatchEvent(new Event('change'));
    expect(wb.textContent).toMatch(/inconclusive|more text|too short/i);
  });

  it('lets the user override key length and re-renders columns', () => {
    const wb = createBreakWorkbench();
    document.body.append(wb);
    const klSelect = wb.querySelector('#key-length-select') as HTMLSelectElement;
    expect(klSelect).toBeTruthy();
    klSelect.value = '5';
    klSelect.dispatchEvent(new Event('change'));
    // 5 columns when length forced to 5.
    expect(wb.querySelectorAll('.col-card').length).toBe(5);
  });
});
