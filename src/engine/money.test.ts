import { describe, expect, it } from 'vitest'
import { roundToCents } from './money'

describe('roundToCents', () => {
  it('rounds to two decimals', () => {
    expect(roundToCents(579.9840458828482)).toBe(579.98)
    expect(roundToCents(432.25280735760225)).toBe(432.25)
  })

  it('rounds half away from zero, including values that float imprecision puts just below .5', () => {
    expect(roundToCents(1.005)).toBe(1.01)
    expect(roundToCents(2.675)).toBe(2.68)
    expect(roundToCents(-1.005)).toBe(-1.01)
  })

  it('returns 0 for negative zero results', () => {
    expect(Object.is(roundToCents(-0.001), 0)).toBe(true)
  })
})
