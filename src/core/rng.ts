/**
 * Seeded RNG. De generatie gebruikt nergens de ingebouwde willekeur van de
 * browser: dezelfde seed moet altijd hetzelfde bestand opleveren. Een test
 * bewaakt dat.
 */

export type Rng = {
  /** Volgende waarde in [0, 1). */
  next(): number
  /** Geheel getal in [min, max], grenzen meegerekend. */
  int(min: number, max: number): number
  /** Kommagetal in [min, max). */
  float(min: number, max: number): number
  /** Kommagetal in [min, max), afgerond op `decimals` decimalen. */
  round(min: number, max: number, decimals: number): number
  /** Eén element uit een niet-lege lijst. */
  pick<T>(items: readonly T[]): T
  /** Kopie van de lijst in willekeurige volgorde (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[]
  /** true met kans p. */
  chance(p: number): boolean
  /** Afgeleide generator, zodat deelstappen elkaars stroom niet verstoren. */
  fork(label: string): Rng
}

/** 32-bits string hash (FNV-1a), voor het omzetten van een tekst-seed naar een getal. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: klein, snel en stabiel over alle platforms. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createRng(seed: string | number): Rng {
  const base = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed)
  const next = mulberry32(base)

  const rng: Rng = {
    next,
    int(min, max) {
      if (max < min) throw new Error(`int(${min}, ${max}): max ligt onder min`)
      return min + Math.floor(next() * (max - min + 1))
    },
    float(min, max) {
      return min + next() * (max - min)
    },
    round(min, max, decimals) {
      return roundTo(min + next() * (max - min), decimals)
    },
    pick(items) {
      if (items.length === 0) throw new Error('pick() op een lege lijst')
      return items[Math.floor(next() * items.length)]!
    },
    shuffle(items) {
      const out = items.slice()
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        const a = out[i]!
        const b = out[j]!
        out[i] = b
        out[j] = a
      }
      return out
    },
    chance(p) {
      return next() < p
    },
    fork(label) {
      return createRng((base ^ hashSeed(label)) >>> 0)
    },
  }
  return rng
}

/** Afronden op een vast aantal decimalen, zonder drijvende-kommaruis in de staart. */
export function roundTo(value: number, decimals: number): number {
  const f = Math.pow(10, decimals)
  return Math.round((value + Number.EPSILON) * f) / f
}

/** Leesbare willekeurige seed voor de UI, bijvoorbeeld "wam-7f3a91". */
export function randomSeedString(entropy: () => number): string {
  const n = Math.floor(entropy() * 0xffffff)
  return `wam-${n.toString(16).padStart(6, '0')}`
}
