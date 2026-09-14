import { describe, expect, it } from 'vitest'
import { createRng, hashSeed, mulberry32, randomSeedString, roundTo } from '../src/core/rng'

describe('mulberry32', () => {
  it('geeft dezelfde reeks bij dezelfde seed', () => {
    const a = mulberry32(12345)
    const b = mulberry32(12345)
    const first = [a(), a(), a(), a(), a()]
    const second = [b(), b(), b(), b(), b()]
    expect(first).toEqual(second)
  })

  it('blijft binnen [0, 1)', () => {
    const next = mulberry32(hashSeed('wam'))
    for (let i = 0; i < 10_000; i++) {
      const value = next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('geeft bij verschillende seeds een andere reeks', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })
})

describe('createRng', () => {
  it('int blijft binnen de grenzen en raakt beide uiteinden', () => {
    const rng = createRng('grenzen')
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const value = rng.int(3, 7)
      expect(value).toBeGreaterThanOrEqual(3)
      expect(value).toBeLessThanOrEqual(7)
      expect(Number.isInteger(value)).toBe(true)
      seen.add(value)
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7])
  })

  it('shuffle houdt alle elementen en laat het origineel met rust', () => {
    const rng = createRng('shuffle')
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    const shuffled = rng.shuffle(items)
    expect(shuffled.slice().sort((a, b) => a - b)).toEqual(items)
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('pick weigert een lege lijst', () => {
    expect(() => createRng('leeg').pick([])).toThrow()
  })

  it('fork geeft een eigen stroom die zelf ook reproduceerbaar is', () => {
    const base = () => createRng('basis')
    const a = base().fork('layout').next()
    const b = base().fork('layout').next()
    const c = base().fork('opmaak').next()
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('een afgeleide stroom verstoort de hoofdstroom niet', () => {
    const withFork = createRng('stroom')
    withFork.fork('x').next()
    const zonderFork = createRng('stroom')
    expect(withFork.next()).toBe(zonderFork.next())
  })

  it('round levert het gevraagde aantal decimalen', () => {
    const rng = createRng('afronden')
    for (let i = 0; i < 200; i++) {
      const value = rng.round(0.8, 2.2, 1)
      expect(value).toBe(roundTo(value, 1))
    }
  })

  it('randomSeedString gebruikt de meegegeven bron', () => {
    expect(randomSeedString(() => 0)).toBe('wam-000000')
    expect(randomSeedString(() => 0.5)).toMatch(/^wam-[0-9a-f]{6}$/)
  })
})

describe('hashSeed', () => {
  it('is stabiel en verschilt per tekst', () => {
    expect(hashSeed('stad-wijk')).toBe(hashSeed('stad-wijk'))
    expect(hashSeed('stad-wijk')).not.toBe(hashSeed('polder'))
  })
})
