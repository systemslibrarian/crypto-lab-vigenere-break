// Cipher panel: plaintext + keyword → ciphertext (and back), with a per-letter
// alignment strip and an optional tabula recta highlighting the active cell.

import { clear, copyButton, el, section } from './dom';
import { process, normalizeKey, type Direction } from '../vigenere/cipher';
import type { CipherResult } from '../vigenere/types';
import { createTableau } from './tableau';

export function createCipherPanel(): HTMLElement {
  const card = section(
    'Cipher · encrypt & decrypt',
    'c_i = (p_i + k_(i mod L)) mod 26. The key repeats under the message — that repetition is exactly what the break exploits.'
  );

  let direction: Direction = 'encrypt';

  const inputLabel = el('label', { for: 'cipher-input', text: 'Plaintext' });
  const input = el('textarea', {
    id: 'cipher-input',
    rows: 3,
    spellcheck: false,
    autocapitalize: 'characters',
  }) as HTMLTextAreaElement;
  input.value = 'We hold these truths to be self evident';

  const keyLabel = el('label', { for: 'cipher-key', text: 'Keyword (letters only)' });
  const keyInput = el('input', { id: 'cipher-key', type: 'text', spellcheck: false, value: 'LIBERTY' }) as HTMLInputElement;

  // Direction toggle (encrypt / decrypt) — keyboard operable, aria-pressed state.
  const encBtn = el('button', { type: 'button', 'aria-pressed': 'true', text: 'Encrypt →' });
  const decBtn = el('button', { type: 'button', 'aria-pressed': 'false', text: '← Decrypt' });
  const toggle = el('div', { class: 'toggle-group', role: 'group', 'aria-label': 'cipher direction' }, [encBtn, decBtn]);

  const keyErr = el('p', { class: 'hint', role: 'alert', style: 'color:var(--alarm)' });
  const outWrap = el('div');
  const stripWrap = el('div', { class: 'strip-wrap' });
  const strip = el('div', { class: 'strip', role: 'img' });
  stripWrap.append(strip);

  const tableau = createTableau();

  function setDirection(d: Direction) {
    direction = d;
    encBtn.setAttribute('aria-pressed', String(d === 'encrypt'));
    decBtn.setAttribute('aria-pressed', String(d === 'decrypt'));
    inputLabel.textContent = d === 'encrypt' ? 'Plaintext' : 'Ciphertext';
    render();
  }
  encBtn.addEventListener('click', () => setDirection('encrypt'));
  decBtn.addEventListener('click', () => setDirection('decrypt'));

  function renderStrip(result: CipherResult) {
    clear(strip);
    if (result.alignment.length === 0) return;
    // Four sticky row labels in the first column.
    const labels = ['in', 'key', 'shift', 'out'];
    strip.style.gridTemplateRows = 'repeat(4, auto)';
    strip.style.gridAutoFlow = 'column';

    const labelCol = el('div', { class: 'cell rowlabel' });
    for (const l of labels) labelCol.append(el('span', { class: 's', text: l }));
    strip.append(labelCol);

    let described = `${direction === 'encrypt' ? 'Encryption' : 'Decryption'} alignment. `;
    result.alignment.forEach((c) => {
      const inLetter = direction === 'encrypt' ? c.plain : c.cipher;
      const outLetter = direction === 'encrypt' ? c.cipher : c.plain;
      const cell = el('div', { class: 'cell' }, [
        el('span', { text: inLetter }),
        el('span', { class: 'k', text: c.key }),
        el('span', { class: 's', text: String(c.shift) }),
        el('span', { text: outLetter }),
      ]);
      strip.append(cell);
      described += `${inLetter} under key ${c.key} shift ${c.shift} gives ${outLetter}. `;
    });
    strip.setAttribute('aria-label', described);

    // Light the tableau for the first letter as an illustrative example
    // (row = key letter, column = plaintext letter).
    const first = result.alignment[0];
    tableau.highlight(first.key, first.plain);
  }

  function render() {
    keyErr.textContent = '';
    clear(outWrap);
    let key: string;
    try {
      key = normalizeKey(keyInput.value);
    } catch (e) {
      keyErr.textContent = (e as Error).message;
      clear(strip);
      tableau.highlight(null, null);
      return;
    }
    if (input.value.trim() === '') {
      outWrap.append(el('p', { class: 'hint', text: 'Type some text above to see the result.' }));
      clear(strip);
      return;
    }

    const result = process(input.value, key, direction);
    const outLabel = direction === 'encrypt' ? 'Ciphertext' : 'Plaintext';
    const head = el('div', { class: 'controls' }, [
      el('label', { text: outLabel, style: 'margin:0' }),
      copyButton(() => result.text, 'Copy output'),
    ]);
    const out = el('p', { class: 'mono-out', 'aria-live': 'polite', text: result.text });
    outWrap.append(head, out);
    renderStrip(result);
  }

  const counts = el('p', { class: 'hint', id: 'cipher-counts', 'aria-live': 'polite' });
  function renderCounts() {
    const norm = input.value.toUpperCase().replace(/[^A-Z]/g, '').length;
    counts.textContent = `${input.value.length} characters · ${norm} letters processed`;
  }

  input.addEventListener('input', () => { renderCounts(); render(); });
  keyInput.addEventListener('input', render);

  card.append(
    el('div', { class: 'row' }, [
      el('div', {}, [inputLabel, input, counts]),
    ]),
    el('div', { class: 'row' }, [
      el('div', {}, [keyLabel, keyInput]),
      el('div', { style: 'flex:0 0 auto' }, [el('label', { text: 'Direction' }), toggle]),
    ]),
    keyErr,
    outWrap,
    el('label', { text: 'Per-letter alignment', style: 'margin-top:0.8rem' }),
    el('p', { class: 'hint', text: 'in = input letter · key = repeating key letter · shift = key index (0–25) · out = result. Scroll horizontally; non-letters are skipped in analysis but kept in the output.' }),
    stripWrap,
    el('div', { style: 'margin-top:0.8rem' }, [tableau.root])
  );

  setDirection('encrypt');
  renderCounts();
  return card;
}
