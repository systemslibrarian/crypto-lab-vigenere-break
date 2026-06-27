// Bundled sample texts. Each ciphertext is produced from a public-domain
// plaintext by the REAL cipher at load time, so the samples are guaranteed
// correct and round-trippable. The break never imports `solutionKey` or
// `plaintext` — they exist only for the optional "reveal" and for tests.

import { encrypt, normalize } from '../vigenere/cipher';

/** Teaching scenario each sample is meant to illustrate. */
export type SampleCategory =
  | 'ideal'
  | 'medium'
  | 'ambiguous'
  | 'short'
  | 'boundary'
  | 'non-english';

export interface Sample {
  id: string;
  title: string;
  category: SampleCategory;
  source: string;
  /** The encryption key — for reveal/tests only; the break must derive it. */
  solutionKey: string;
  /** Original plaintext (public domain). */
  plaintext: string;
  /** Ciphertext shown to the user (computed from plaintext + key). */
  ciphertext: string;
  /** Number of letters (after normalization) in the ciphertext. */
  letterCount: number;
  /** Teaching note about why this sample behaves as it does. */
  note: string;
  /** A short "what to notice" callout for the picker. */
  whatToNotice: string;
}

interface MakeArgs {
  id: string;
  title: string;
  category: SampleCategory;
  source: string;
  solutionKey: string;
  plaintext: string;
  note: string;
  whatToNotice: string;
}

function make(a: MakeArgs): Sample {
  const ciphertext = encrypt(a.plaintext, a.solutionKey).text;
  return { ...a, ciphertext, letterCount: normalize(ciphertext).length };
}

// — Public-domain plaintexts (US Declaration of Independence; Lincoln's
//   Gettysburg Address; A. C. Doyle, "A Scandal in Bohemia", 1891). —

const DECLARATION = `When in the Course of human events it becomes necessary for one people to dissolve the political bands which have connected them with another and to assume among the powers of the earth the separate and equal station to which the Laws of Nature and of Natures God entitle them a decent respect to the opinions of mankind requires that they should declare the causes which impel them to the separation. We hold these truths to be self evident that all men are created equal that they are endowed by their Creator with certain unalienable Rights that among these are Life Liberty and the pursuit of Happiness.`;

const GETTYSBURG = `Four score and seven years ago our fathers brought forth on this continent a new nation conceived in liberty and dedicated to the proposition that all men are created equal. Now we are engaged in a great civil war testing whether that nation or any nation so conceived and so dedicated can long endure. We are met on a great battlefield of that war. We have come to dedicate a portion of that field as a final resting place for those who here gave their lives that that nation might live.`;

const HOLMES = `To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex. It was not that he felt any emotion akin to love for Irene Adler. All emotions and that one particularly were abhorrent to his cold precise but admirably balanced mind. He was I take it the most perfect reasoning and observing machine that the world has seen.`;

const SHORT = `Meet me at the old bridge at dawn.`;

// A. C. Doyle, "The Adventure of the Speckled Band" (1892, public domain) — a
// shorter passage giving thinner columns at key length 4, so a column or two
// land as "close calls" the user may need to arbitrate.
const SPECKLED = `On glancing over my notes of the seventy odd cases in which I have studied the methods of my friend Sherlock Holmes I find many tragic some comic a large number merely strange but none commonplace.`;

// C. Julius Caesar, "Commentarii de Bello Gallico" I.1 (Latin, public domain).
// Non-English: the chi-squared solver assumes ENGLISH frequencies, so some
// columns are mis-solved — the recovered text is not readable English.
const LATIN = `Gallia est omnis divisa in partes tres quarum unam incolunt Belgae aliam Aquitani tertiam qui ipsorum lingua Celtae nostra Galli appellantur hi omnes lingua institutis legibus inter se differunt Gallos ab Aquitanis Garumna flumen a Belgis Matrona et Sequana dividit.`;

// Key length approaches the message length — the one-time-pad boundary.
const BOUNDARY = `Attack the eastern gate one hour before the first light of dawn and hold it.`;

export const SAMPLES: Sample[] = [
  make({
    id: 'declaration',
    title: 'Declaration of Independence',
    category: 'ideal',
    source: 'US Declaration of Independence, 1776 (public domain)',
    solutionKey: 'LEMON',
    plaintext: DECLARATION,
    note: 'A long ciphertext with a short 5-letter key — the ideal case. Kasiski and IoC converge cleanly on length 5 and every column has plenty of letters for chi-squared.',
    whatToNotice: 'Kasiski factors and the IoC peak both shout "5". Textbook convergence.',
  }),
  make({
    id: 'gettysburg',
    title: 'Gettysburg Address',
    category: 'medium',
    source: 'A. Lincoln, Gettysburg Address, 1863 (public domain)',
    solutionKey: 'CIPHER',
    plaintext: GETTYSBURG,
    note: 'A 6-letter key over a medium-length text. The break still resolves, but the IoC peak and Kasiski factors require a little more reading.',
    whatToNotice: 'Small factors (2, 3) out-count 6 in Kasiski — let IoC pick the fundamental.',
  }),
  make({
    id: 'holmes',
    title: 'A Scandal in Bohemia',
    category: 'medium',
    source: 'A. C. Doyle, "A Scandal in Bohemia", 1891 (public domain)',
    solutionKey: 'VICTORIA',
    plaintext: HOLMES,
    note: 'An 8-letter key. Longer keys spread the statistics thinner — a good test of whether you trust the convergence before committing.',
    whatToNotice: 'Kasiski is faint here; the IoC peak at 8 is carrying the diagnosis.',
  }),
  make({
    id: 'speckled',
    title: 'The Speckled Band (shorter)',
    category: 'ambiguous',
    source: 'A. C. Doyle, "The Speckled Band", 1892 (public domain)',
    solutionKey: 'BAKER',
    plaintext: SPECKLED,
    note: 'A shorter text with a 5-letter key. The key length still resolves, but thin columns mean one or two Caesar shifts are close calls — watch the per-column confidence and nudge the weak ones.',
    whatToNotice: 'The key length is clear, but check the confidence dashboard for "close call" columns.',
  }),
  make({
    id: 'latin',
    title: 'Caesar, De Bello Gallico (Latin)',
    category: 'non-english',
    source: 'C. J. Caesar, De Bello Gallico I.1 (Latin, public domain)',
    solutionKey: 'ROMA',
    plaintext: LATIN,
    note: 'The ciphertext is Latin, but the column solver scores shifts against ENGLISH letter frequencies. The key length resolves, yet some columns are mis-solved — the recovered text is not readable English. The frequency model is part of the attack.',
    whatToNotice: 'The break finds a key length, but the "plaintext" still fails the English check. Why? Wrong language model.',
  }),
  make({
    id: 'boundary',
    title: 'OTP boundary (long key)',
    category: 'boundary',
    source: 'Synthetic message with a key nearly as long as the text',
    solutionKey: 'THISKEYISALMOSTASLONGASTHEWHOLEMESSAGE',
    plaintext: BOUNDARY,
    note: 'The key is nearly as long as the message, so each column has only a letter or two. The statistics cannot resolve it — this is the boundary where Vigenère shades into a one-time pad and becomes effectively unbreakable. See the OTP Vault demo for the limit.',
    whatToNotice: 'No usable IoC peak: the columns are too thin. This is why a key as long as the message is unbreakable.',
  }),
  make({
    id: 'short',
    title: 'Too-short message',
    category: 'short',
    source: 'Synthetic short message',
    solutionKey: 'KEY',
    plaintext: SHORT,
    note: 'Deliberately too short. Kasiski finds almost nothing and IoC is noisy — the demo reports INCONCLUSIVE rather than guess. Short-text failure is itself the lesson.',
    whatToNotice: 'Honest failure: too few letters for the statistics. The demo refuses to fabricate a key.',
  }),
];

export function sampleById(id: string): Sample | undefined {
  return SAMPLES.find((s) => s.id === id);
}
