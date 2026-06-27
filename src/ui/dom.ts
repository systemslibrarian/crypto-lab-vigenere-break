// Tiny DOM helpers — keeps the UI modules declarative without a framework.

type Attrs = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('data-') || k === 'role' || k.startsWith('aria-'))
      node.setAttribute(k, String(v));
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** A labelled section card. */
export function section(title: string, subtitle?: string): HTMLElement {
  const sec = el('section', { class: 'card' });
  const head = el('div', { class: 'card-head' }, [el('h2', { text: title })]);
  if (subtitle) head.append(el('p', { class: 'subtitle', text: subtitle }));
  sec.append(head);
  return sec;
}

/** Copy-to-clipboard button for a string getter. */
export function copyButton(getText: () => string, label = 'Copy'): HTMLButtonElement {
  const btn = el('button', { class: 'copy-btn', type: 'button', 'aria-label': label }, [
    el('span', { 'aria-hidden': 'true', text: '⧉ ' }),
    el('span', { text: label }),
  ]);
  btn.addEventListener('click', async () => {
    const text = getText();
    try {
      await navigator.clipboard.writeText(text);
      const status = btn.querySelector('span:last-child')!;
      const prev = status.textContent;
      status.textContent = 'Copied';
      window.setTimeout(() => (status.textContent = prev), 1200);
    } catch {
      // Clipboard may be unavailable (insecure context); fail quietly.
    }
  });
  return btn;
}
