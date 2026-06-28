# crypto-lab-vigenere-break

## What It Is

The **Vigenère cipher** is a polyalphabetic substitution cipher: each plaintext letter is shifted by the corresponding letter of a repeating keyword, i.e. `c_i = (p_i + k_(i mod L)) mod 26`. It solves the weakness of a simple Caesar/monoalphabetic cipher — a single fixed shift that flat letter-frequency analysis cracks instantly — by cycling through `L` different shifts. It is a **symmetric** scheme: the same short keyword both encrypts and decrypts, and it is **not** secure by modern standards. This demo implements the cipher *and* its classical break — **Kasiski examination**, the **index of coincidence**, and per-column **chi-squared frequency analysis** — to recover the key from ciphertext alone. The whole point is that a short, repeating key is breakable; a key as long as the message and never reused (a one-time pad) is not.

## When to Use It

- **Teaching how classical cryptanalysis actually works** — Kasiski spacing, index of coincidence, and frequency analysis are visible end-to-end here, which is why Vigenère is the canonical worked example.
- **Understanding why key reuse is fatal** — the repeating key is exactly what the break exploits, a lesson that carries directly into modern stream-cipher and one-time-pad discipline.
- **Puzzles, CTFs, and historical recreation** — Vigenère shows up in beginner crypto challenges and 16th–19th-century historical contexts where this is the right period-accurate tool.
- **Do NOT use it to protect real data.** It has no computational security: given enough ciphertext, the key falls out by hand, as this demo demonstrates. For confidentiality use an authenticated modern cipher (e.g. AES-GCM or ChaCha20-Poly1305); for theoretical unbreakability with a one-time key, see the OTP Vault demo.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-vigenere-break](https://systemslibrarian.github.io/crypto-lab-vigenere-break/)**

Encrypt and decrypt text with a keyword (the panel shows the per-letter key alignment and an optional tabula recta), then **break a real ciphertext step by step**. The break workbench walks Kasiski examination → index of coincidence → per-column chi-squared solving → recovered key → full decryption, with controls for the **plaintext/keyword input**, **ciphertext input**, **key-length selector**, and **per-column shift override**, plus a guided challenge mode. Every statistic is computed live from the ciphertext — nothing is hardcoded, and it honestly reports when the text is too short to break.

## What Can Go Wrong

- Too little ciphertext defeats the break: Kasiski needs repeated factors and the index of coincidence and per-column chi-squared analysis need enough letters per column to be statistically meaningful.
- A wrong key-length guess misaligns every column, so the chi-squared solver locks onto plausible-but-wrong shifts and produces garbage plaintext.
- Frequency analysis assumes a known plaintext language; text that is not standard English (or a different alphabet entirely) shifts the expected distribution and misleads the solver.
- A key as long as the message and never reused is no longer a Vigenère weakness but a one-time pad — this break cannot recover it, which is exactly the lesson.
- Reusing the same keyword across many messages multiplies the exposed material and makes recovery easier, the historical reason Vigenère eventually fell.

## Real-World Usage

- A historical confidentiality tool from the 16th through 19th centuries, famously dubbed "le chiffre indéchiffrable" before Babbage and Kasiski showed how to break it.
- A staple teaching example in cryptography courses precisely because its strengths and its break are both tractable by hand.
- A common beginner-level puzzle in CTFs, escape rooms, and alternate-reality games where period-accurate or lightweight obfuscation is wanted.
- Today strictly obsolete for security: it is studied to motivate key non-reuse, computational hardness, and the move to modern authenticated ciphers.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-vigenere-break
cd crypto-lab-vigenere-break
npm install
npm run dev
```

## Related Demos
- [crypto-lab-dead-sea-cipher](https://systemslibrarian.github.io/crypto-lab-dead-sea-cipher/) — substitution, Vigenère, and Atbash classical ciphers in one place.
- [crypto-lab-enigma-forge](https://systemslibrarian.github.io/crypto-lab-enigma-forge/) — another historical cipher and its mechanized break (the Bombe).
- [crypto-lab-otp-vault](https://systemslibrarian.github.io/crypto-lab-otp-vault/) — the one-time pad: what Vigenère becomes when the key stops repeating, plus the two-time-pad failure.
- [crypto-lab-world-ciphers](https://systemslibrarian.github.io/crypto-lab-world-ciphers/) — modern symmetric block ciphers, the secure successors to classical substitution.

---

*One of 60+ browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
