// Polyfill crypto for bcryptjs on React Native (Hermes engine)
// bcryptjs requires globalThis.crypto which is missing in Hermes

function getRandomValues(array: Uint8Array): Uint8Array {
  for (let i = 0; i < array.length; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return array;
}

if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = {
    getRandomValues,
    subtle: {
      digest: async (_algorithm: string, _data: ArrayBuffer): Promise<ArrayBuffer> => {
        // Minimal SHA-256 fallback — bcryptjs uses its own implementation anyway
        throw new Error('WebCrypto subtle.digest not available — bcryptjs should use pure JS fallback');
      },
    },
  };
}
