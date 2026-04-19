// Minimal jsdom augmentations for browser APIs used by our code.
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as unknown as { crypto: Crypto }).crypto = {} as Crypto;
}
