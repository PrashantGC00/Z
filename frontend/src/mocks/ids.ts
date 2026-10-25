const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** ULID: 48-bit millisecond timestamp + 80 random bits, Crockford base32. Sorts by creation time. */
export function ulid(time = Date.now(), random: () => number = cryptoRandom): string {
  let ts = ''
  for (let i = 0, t = time; i < 10; i++, t = Math.floor(t / 32)) ts = ALPHABET[t % 32] + ts
  let rand = ''
  for (let i = 0; i < 16; i++) rand += ALPHABET[Math.floor(random() * 32)]
  return ts + rand
}

function cryptoRandom() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
}

/** Deterministic PRNG (mulberry32), so seeded data keeps the same ids across reloads. */
export function seededRandom(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}
