// Bundled sample texts. Each ciphertext is produced from a public-domain
// plaintext by the REAL cipher at load time, so the samples are guaranteed
// correct and round-trippable. The break never imports `solutionKey` or
// `plaintext` — they exist only for the optional "reveal" and for tests.

import { encrypt } from '../vigenere/cipher';

export interface Sample {
  id: string;
  title: string;
  source: string;
  /** The encryption key — for reveal/tests only; the break must derive it. */
  solutionKey: string;
  /** Original plaintext (public domain). */
  plaintext: string;
  /** Ciphertext shown to the user (computed from plaintext + key). */
  ciphertext: string;
  /** Teaching note about why this sample behaves as it does. */
  note: string;
}

function make(
  id: string,
  title: string,
  source: string,
  solutionKey: string,
  plaintext: string,
  note: string
): Sample {
  return {
    id,
    title,
    source,
    solutionKey,
    plaintext,
    ciphertext: encrypt(plaintext, solutionKey).text,
    note,
  };
}

// — Public-domain plaintexts (US Declaration of Independence; Lincoln's
//   Gettysburg Address; A. C. Doyle, "A Scandal in Bohemia", 1891). —

const DECLARATION = `When in the Course of human events it becomes necessary for one people to dissolve the political bands which have connected them with another and to assume among the powers of the earth the separate and equal station to which the Laws of Nature and of Natures God entitle them a decent respect to the opinions of mankind requires that they should declare the causes which impel them to the separation. We hold these truths to be self evident that all men are created equal that they are endowed by their Creator with certain unalienable Rights that among these are Life Liberty and the pursuit of Happiness.`;

const GETTYSBURG = `Four score and seven years ago our fathers brought forth on this continent a new nation conceived in liberty and dedicated to the proposition that all men are created equal. Now we are engaged in a great civil war testing whether that nation or any nation so conceived and so dedicated can long endure. We are met on a great battlefield of that war. We have come to dedicate a portion of that field as a final resting place for those who here gave their lives that that nation might live.`;

const HOLMES = `To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex. It was not that he felt any emotion akin to love for Irene Adler. All emotions and that one particularly were abhorrent to his cold precise but admirably balanced mind. He was I take it the most perfect reasoning and observing machine that the world has seen.`;

const SHORT = `Meet me at the old bridge at dawn.`;

export const SAMPLES: Sample[] = [
  make(
    'declaration',
    'Declaration of Independence (key: LEMON)',
    'US Declaration of Independence, 1776 (public domain)',
    'LEMON',
    DECLARATION,
    'A long ciphertext with a short 5-letter key — the ideal case. Kasiski and IoC converge cleanly on length 5 and every column has plenty of letters for chi-squared.'
  ),
  make(
    'gettysburg',
    'Gettysburg Address (key: CIPHER)',
    "A. Lincoln, Gettysburg Address, 1863 (public domain)",
    'CIPHER',
    GETTYSBURG,
    'A 6-letter key over a medium-length text. The break still resolves, but notice the IoC peak and Kasiski factors require a little more reading.'
  ),
  make(
    'holmes',
    'A Scandal in Bohemia (key: VICTORIA)',
    'A. C. Doyle, "A Scandal in Bohemia", 1891 (public domain)',
    'VICTORIA',
    HOLMES,
    'An 8-letter key. Longer keys spread the statistics thinner — a good test of whether you trust the convergence before committing.'
  ),
  make(
    'short',
    'Too-short message (key: KEY)',
    'Synthetic short message',
    'KEY',
    SHORT,
    'Deliberately too short. Kasiski finds almost nothing and IoC is noisy — the demo should report INCONCLUSIVE rather than guess. Short-text failure is the lesson.'
  ),
];

export function sampleById(id: string): Sample | undefined {
  return SAMPLES.find((s) => s.id === id);
}
