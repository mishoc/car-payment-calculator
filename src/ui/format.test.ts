import { describe, expect, it } from 'vitest'
import { money, parseNumber, percent } from './format'

describe('format', () => {
  it('money rounds to cents for display', () => {
    expect(money(579.9840458828482)).toBe('$579.98')
    expect(money(30_000)).toBe('$30,000.00')
  })

  it('percent', () => {
    expect(percent(0.0625)).toBe('6.25%')
    expect(percent(0.08)).toBe('8%')
  })

  it.each([
    ['30,000', 30_000],
    ['$1,250.50', 1_250.5],
    ['8%', 8],
    ['', 0],
    ['  ', 0],
  ])('parseNumber(%j) = %d', (text, expected) => {
    expect(parseNumber(text)).toBe(expected)
  })

  it.each(['abc', '-5', '1.2.3', '1e5'])('parseNumber(%j) is NaN', (text) => {
    expect(parseNumber(text)).toBeNaN()
  })
})
