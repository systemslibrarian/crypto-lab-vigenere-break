import './style.css';
import { el } from './ui/dom';
import { createCipherPanel } from './ui/cipherPanel';
import { createBreakWorkbench } from './ui/breakWorkbench';
import { createExplainer } from './ui/explainer';

const app = document.getElementById('app');
if (!app) throw new Error('#app mount point missing');

// Hero header (fleet standard) — the page's single <h1>, a spec subtitle, a
// one-sentence "what you'll do" description, and a "why it matters" box.
const hero = el('header', { class: 'cl-hero' }, [
  el('div', { class: 'cl-hero-main' }, [
    el('h1', { class: 'cl-hero-title', text: 'Vigenère Break' }),
    el('p', {
      class: 'cl-hero-sub',
      text: 'Polyalphabetic cipher · Kasiski · Index of Coincidence',
    }),
    el('p', {
      class: 'cl-hero-desc',
      text:
        'Encrypt with a repeating key, then break a ciphertext live — Kasiski spacing recovers the key length, the index of coincidence confirms it, and per-column chi-squared frequency analysis pulls out each key letter.',
    }),
  ]),
  el('aside', { class: 'cl-hero-why', 'aria-label': 'Why it matters' }, [
    el('span', { class: 'cl-hero-why-label', text: 'WHY IT MATTERS' }),
    el('p', {
      class: 'cl-hero-why-text',
      text:
        'A short, reused key looks like strong encryption but leaks its own structure. Vigenère stood as "le chiffre indéchiffrable" for three centuries, then fell to statistics alone — the same trap that dooms any cipher whose keystream repeats.',
    }),
  ]),
]);

// Intro / framing. The standardization pass adds the shared header & footer; this
// is the demo's own lede, not a site header.
const intro = el('section', { class: 'intro' }, [
  el('p', {
    text:
      'The Vigenère cipher (Bellaso 1553; later misattributed to Vigenère) resisted cryptanalysis for three centuries — "le chiffre indéchiffrable." Then Charles Babbage (c. 1854) and Friedrich Kasiski (1863) showed its short, repeating key is its undoing, and William Friedman (1920s) gave the statistics a rigorous footing with the index of coincidence.',
  }),
  el('p', {
    html:
      'Encrypt and decrypt below, then <strong>break a real ciphertext step by step</strong>: Kasiski spacing analysis, index of coincidence, and per-column frequency analysis — every number computed live from the text, nothing hardcoded.',
  }),
  el('p', { class: 'what-isnt' }, [
    document.createTextNode(
      "What this isn't: this Vigenère demo uses repeating keywords, not a one-time pad. An OTP requires an independent, uniformly random secret key of at least the message length that is used only once; merely writing a long predictable key does not suffice. An inconclusive statistical attack is not a security guarantee. Not autokey/running-key variants (a noted future extension). Not a general substitution solver. Nothing here is stored or sent anywhere — it all runs in your browser."
    ),
  ]),
]);

const reading = el('section', { class: 'card sources-card' }, [
  el('h2', { text: 'Sources & further reading' }),
  el('p', {}, [
    document.createTextNode('For worked Vigenère analysis, see '),
    el('a', { href: 'https://www.cryptool.org/en/ctbook/' , target: '_blank', rel: 'noopener noreferrer', text: 'Bernhard Esslinger, Learning and Experiencing Cryptography with CrypTool and SageMath (2024), chapter 3' }),
    document.createTextNode('. For the precise one-time-pad distinction, see '),
    el('a', { href: 'https://www.rfc-editor.org/rfc/rfc4949#section-6', target: '_blank', rel: 'noopener noreferrer', text: 'IETF RFC 4949, Internet Security Glossary (2007), “one-time pad”' }),
    document.createTextNode(' and '),
    el('a', { href: 'https://onlinelibrary.wiley.com/doi/10.1002/j.1538-7305.1949.tb00928.x', target: '_blank', rel: 'noopener noreferrer', text: 'Claude Shannon, Communication Theory of Secrecy Systems (1949)' }),
    document.createTextNode('. The displayed English quality is this demo’s ranking heuristic, not a verification or a probability.'),
  ]),
]);

app.append(hero, intro, createCipherPanel(), createBreakWorkbench(), createExplainer(), reading);
