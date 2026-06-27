// The Vigenère tableau (tabula recta). Rows = key letter, columns = plaintext
// letter, cell = ciphertext letter (row + col) mod 26. The active row/column/cell
// for the current alignment position can be highlighted.

import { el } from './dom';
import { indexToLetter, letterToIndex, tableauCell } from '../vigenere/cipher';

const LETTERS = Array.from({ length: 26 }, (_, i) => indexToLetter(i));

export interface TableauHandle {
  root: HTMLElement;
  /** Highlight the cell for a given key letter (row) and plaintext letter (col). */
  highlight(keyLetter: string | null, plainLetter: string | null): void;
}

export function createTableau(): TableauHandle {
  const wrap = el('div', { class: 'tableau-wrap' });
  const table = el('table', {
    class: 'tableau',
    'aria-label': 'Vigenère tableau (tabula recta): rows are key letters, columns are plaintext letters, cells are the resulting ciphertext letter',
  });

  // Header row: blank corner + plaintext letters.
  const thead = el('thead');
  const hr = el('tr', {}, [el('th', { scope: 'col', 'aria-label': 'key letter down, plaintext letter across', text: '×' })]);
  for (const c of LETTERS) hr.append(el('th', { scope: 'col', text: c }));
  thead.append(hr);
  table.append(thead);

  const tbody = el('tbody');
  for (let r = 0; r < 26; r++) {
    const tr = el('tr', {}, [el('th', { scope: 'row', text: LETTERS[r] })]);
    for (let c = 0; c < 26; c++) {
      tr.append(el('td', { 'data-r': r, 'data-c': c, text: tableauCell(r, c) }));
    }
    tbody.append(tr);
  }
  table.append(tbody);
  wrap.append(table);

  function highlight(keyLetter: string | null, plainLetter: string | null): void {
    for (const td of table.querySelectorAll('td')) {
      td.classList.remove('lit-row', 'lit-col', 'lit-cell');
    }
    if (keyLetter === null && plainLetter === null) return;
    const row = keyLetter ? letterToIndex(keyLetter) : null;
    const col = plainLetter ? letterToIndex(plainLetter) : null;
    for (const td of table.querySelectorAll('td')) {
      const r = Number(td.getAttribute('data-r'));
      const c = Number(td.getAttribute('data-c'));
      if (row !== null && r === row) td.classList.add('lit-row');
      if (col !== null && c === col) td.classList.add('lit-col');
      if (row !== null && col !== null && r === row && c === col) {
        td.classList.add('lit-cell');
      }
    }
  }

  const root = el('div', {});
  const toggle = el('button', { type: 'button', 'aria-expanded': 'false', class: 'reveal-tableau' }, [
    'Show tabula recta',
  ]);
  const body = el('div', { hidden: true }, [wrap]);
  toggle.addEventListener('click', () => {
    const open = body.hasAttribute('hidden');
    if (open) body.removeAttribute('hidden');
    else body.setAttribute('hidden', '');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide tabula recta' : 'Show tabula recta';
  });
  root.append(toggle, body);

  return {
    root,
    highlight: (k, p) => {
      // Only bother updating cells when the tableau is visible.
      if (!body.hasAttribute('hidden')) highlight(k, p);
    },
  };
}
