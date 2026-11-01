import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COMPARISON_TERMS,
  amortizationSchedule,
  compareTerms,
  loanTotals,
  monthlyPayment,
} from './loan'
import { roundToCents } from './money'

// Acceptance cases from the build plan, section "Tests and acceptance criteria".
const acceptanceCases = [
  {
    name: 'standard loan',
    principal: 30_000,
    annualRate: 0.06,
    termMonths: 60,
    payment: 579.98,
    interest: 4_799.04,
  },
  {
    name: 'zero-rate loan',
    principal: 30_000,
    annualRate: 0,
    termMonths: 60,
    payment: 500.0,
    interest: 0,
  },
  {
    name: 'long-term used loan',
    principal: 25_000,
    annualRate: 0.075,
    termMonths: 72,
    payment: 432.25,
    interest: 6_122.2,
  },
]

describe('monthlyPayment', () => {
  it.each(acceptanceCases)('$name: payment rounds to $payment', (c) => {
    expect(roundToCents(monthlyPayment(c.principal, c.annualRate, c.termMonths))).toBe(c.payment)
  })

  it('keeps full precision (no rounding inside the engine)', () => {
    expect(monthlyPayment(30_000, 0.06, 60)).toBeCloseTo(579.9840458828, 9)
  })

  it('returns 0 for a zero principal', () => {
    expect(monthlyPayment(0, 0.06, 60)).toBe(0)
  })

  it('handles a one-month term', () => {
    expect(monthlyPayment(1_000, 0.12, 1)).toBeCloseTo(1_010, 9)
  })

  it.each([
    ['negative principal', -1, 0.06, 60],
    ['negative rate', 30_000, -0.01, 60],
    ['zero term', 30_000, 0.06, 0],
    ['fractional term', 30_000, 0.06, 60.5],
    ['NaN principal', Number.NaN, 0.06, 60],
    ['infinite rate', 30_000, Number.POSITIVE_INFINITY, 60],
  ])('rejects %s', (_label, principal, rate, term) => {
    expect(() => monthlyPayment(principal, rate, term)).toThrow(RangeError)
  })
})

describe('loanTotals', () => {
  it.each(acceptanceCases)('$name: total interest rounds to $interest', (c) => {
    const totals = loanTotals({
      amountFinanced: c.principal,
      annualRate: c.annualRate,
      termMonths: c.termMonths,
    })
    expect(roundToCents(totals.monthlyPayment)).toBe(c.payment)
    expect(roundToCents(totals.totalInterest)).toBe(c.interest)
    expect(totals.totalOfPayments).toBeCloseTo(totals.monthlyPayment * c.termMonths, 9)
    expect(totals.totalInterest).toBeCloseTo(totals.totalOfPayments - c.principal, 9)
  })

  it('total cost = cash down + upfront taxes and fees + total of payments', () => {
    const totals = loanTotals({
      amountFinanced: 30_000,
      annualRate: 0.06,
      termMonths: 60,
      cashDown: 5_000,
      upfrontTaxesAndFees: 2_400,
    })
    expect(totals.totalCost).toBeCloseTo(5_000 + 2_400 + totals.totalOfPayments, 9)
    expect(roundToCents(totals.totalCost)).toBe(42_199.04)
  })

  it('defaults cash down and upfront amounts to 0', () => {
    const totals = loanTotals({ amountFinanced: 30_000, annualRate: 0, termMonths: 60 })
    expect(totals.totalCost).toBe(30_000)
  })

  it('rejects negative cash down or upfront amounts', () => {
    const base = { amountFinanced: 30_000, annualRate: 0.06, termMonths: 60 }
    expect(() => loanTotals({ ...base, cashDown: -1 })).toThrow(RangeError)
    expect(() => loanTotals({ ...base, upfrontTaxesAndFees: -1 })).toThrow(RangeError)
  })
})

describe('amortizationSchedule', () => {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

  it.each(acceptanceCases)('$name: one row per month', (c) => {
    const rows = amortizationSchedule(c.principal, c.annualRate, c.termMonths)
    expect(rows).toHaveLength(c.termMonths)
    expect(rows.map((r) => r.month)).toEqual(Array.from({ length: c.termMonths }, (_, i) => i + 1))
  })

  it.each(acceptanceCases)('$name: final balance is $0.00 within one cent', (c) => {
    const rows = amortizationSchedule(c.principal, c.annualRate, c.termMonths)
    expect(Math.abs(rows[rows.length - 1].balance)).toBeLessThan(0.01)
  })

  it.each(acceptanceCases)('$name: sum of principal equals amount financed', (c) => {
    const rows = amortizationSchedule(c.principal, c.annualRate, c.termMonths)
    expect(sum(rows.map((r) => r.principal))).toBeCloseTo(c.principal, 6)
  })

  it.each(acceptanceCases)('$name: sum of interest equals total interest', (c) => {
    const rows = amortizationSchedule(c.principal, c.annualRate, c.termMonths)
    const { totalInterest } = loanTotals({
      amountFinanced: c.principal,
      annualRate: c.annualRate,
      termMonths: c.termMonths,
    })
    expect(sum(rows.map((r) => r.interest))).toBeCloseTo(totalInterest, 6)
  })

  it('each row splits the payment into interest and principal', () => {
    const rows = amortizationSchedule(30_000, 0.06, 60)
    for (const row of rows) {
      expect(row.interest + row.principal).toBeCloseTo(row.payment, 9)
    }
  })

  it('first month interest is balance × APR / 12', () => {
    const [first] = amortizationSchedule(30_000, 0.06, 60)
    expect(first.interest).toBeCloseTo(150, 9)
    expect(first.principal).toBeCloseTo(579.9840458828 - 150, 6)
    expect(first.balance).toBeCloseTo(30_000 - first.principal, 9)
  })

  it('balance never increases and never goes meaningfully negative', () => {
    const rows = amortizationSchedule(25_000, 0.075, 72)
    let prev = 25_000
    for (const row of rows) {
      expect(row.balance).toBeLessThanOrEqual(prev)
      expect(row.balance).toBeGreaterThan(-0.01)
      prev = row.balance
    }
  })

  it('a zero-rate loan has zero interest in every row', () => {
    const rows = amortizationSchedule(30_000, 0, 60)
    expect(rows.every((r) => r.interest === 0 && r.principal === 500)).toBe(true)
  })

  it('returns all-zero rows for a zero principal', () => {
    const rows = amortizationSchedule(0, 0.06, 12)
    expect(rows).toHaveLength(12)
    expect(rows.every((r) => r.payment === 0 && r.balance === 0)).toBe(true)
  })
})

describe('compareTerms', () => {
  it('defaults to 36, 48, 60, 72 and 84 months', () => {
    expect(DEFAULT_COMPARISON_TERMS).toEqual([36, 48, 60, 72, 84])
    const rows = compareTerms({ amountFinanced: 30_000, annualRate: 0.06 })
    expect(rows.map((r) => r.termMonths)).toEqual([36, 48, 60, 72, 84])
  })

  it('matches loanTotals for each term', () => {
    const input = {
      amountFinanced: 30_000,
      annualRate: 0.06,
      cashDown: 5_000,
      upfrontTaxesAndFees: 2_400,
    }
    for (const row of compareTerms(input)) {
      expect(row).toEqual({
        termMonths: row.termMonths,
        ...loanTotals({ ...input, termMonths: row.termMonths }),
      })
    }
  })

  it('the 60-month row matches the standard acceptance case', () => {
    const row = compareTerms({ amountFinanced: 30_000, annualRate: 0.06 }).find(
      (r) => r.termMonths === 60,
    )
    expect(roundToCents(row!.monthlyPayment)).toBe(579.98)
    expect(roundToCents(row!.totalInterest)).toBe(4_799.04)
  })

  it('longer terms have lower payments and more interest at a positive rate', () => {
    const rows = compareTerms({ amountFinanced: 30_000, annualRate: 0.06 })
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].monthlyPayment).toBeLessThan(rows[i - 1].monthlyPayment)
      expect(rows[i].totalInterest).toBeGreaterThan(rows[i - 1].totalInterest)
    }
  })

  it('accepts custom terms', () => {
    const rows = compareTerms({ amountFinanced: 10_000, annualRate: 0.05, terms: [24, 12] })
    expect(rows.map((r) => r.termMonths)).toEqual([24, 12])
  })
})
