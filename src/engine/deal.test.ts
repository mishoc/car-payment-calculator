import { describe, expect, it } from 'vitest'
import { testStateRecord } from '../data/fixtures'
import type { Fee, StateRecord } from '../data/schema'
import { calculateDeal, defaultTaxRate, type DealInput } from './deal'

// Every test uses the made-up test state from src/data/fixtures.ts, never real state data.

const S = { sources: ['src-a'] }

function deal(overrides: Partial<DealInput> = {}): DealInput {
  return {
    condition: 'new',
    price: 30_000,
    dealerDiscount: 0,
    rebate: 0,
    tradeInValue: 0,
    tradeInPayoff: 0,
    cashDown: 0,
    docFee: 300,
    addOns: [],
    serviceContract: 0,
    gap: 0,
    lenderFee: 0,
    taxRate: 0.08,
    annualRate: 0.06,
    termMonths: 60,
    payTaxesAndFeesUpfront: false,
    vehicle: {},
    ...overrides,
  }
}

function state(edit: (r: StateRecord) => void = () => {}): StateRecord {
  const r = testStateRecord()
  edit(r)
  return r
}

const fee = (f: Partial<Fee> & Pick<Fee, 'kind'>): Fee =>
  ({
    id: f.kind,
    name: `${f.kind} fee`,
    newOnly: false,
    evOnly: false,
    recurrence: 'one_time',
    ...S,
    ...f,
  }) as Fee

const onlyFees = (...fees: Fee[]) => state((r) => (r.fees = fees))

describe('step 1: trade equity', () => {
  it('positive equity reduces the amount financed', () => {
    const base = calculateDeal(state(), deal())
    const r = calculateDeal(
      state((s) => (s.tradeInCredit.rule = { value: 'none', ...S })),
      deal({ tradeInValue: 8_000, tradeInPayoff: 5_000 }),
    )
    expect(r.tradeEquity).toBe(3_000)
    expect(r.amountFinanced).toBeCloseTo(base.amountFinanced - 3_000, 9)
  })

  it('negative equity raises the amount financed by exactly the shortfall', () => {
    const noTradeCredit = state((s) => (s.tradeInCredit.rule = { value: 'none', ...S }))
    const base = calculateDeal(noTradeCredit, deal())
    const r = calculateDeal(noTradeCredit, deal({ tradeInValue: 5_000, tradeInPayoff: 7_500 }))
    expect(r.tradeEquity).toBe(-2_500)
    expect(r.amountFinanced).toBeCloseTo(base.amountFinanced + 2_500, 9)
    expect(r.warnings.map((w) => w.code)).toContain('negative_equity')
  })
})

describe('step 2: trade-in credit', () => {
  it('full: credits the whole trade-in value', () => {
    const r = calculateDeal(
      state((s) => (s.tradeInCredit.rule = { value: 'full', ...S })),
      deal({ tradeInValue: 15_000 }),
    )
    expect(r.tradeCredit).toBe(15_000)
  })

  it('none: credits nothing', () => {
    const r = calculateDeal(
      state((s) => (s.tradeInCredit.rule = { value: 'none', ...S })),
      deal({ tradeInValue: 15_000 }),
    )
    expect(r.tradeCredit).toBe(0)
  })

  it('capped: trade value above the cap is limited to the cap', () => {
    const r = calculateDeal(state(), deal({ tradeInValue: 15_000 }))
    expect(r.tradeCredit).toBe(10_000)
  })

  it('capped: trade value below the cap is credited in full', () => {
    const r = calculateDeal(state(), deal({ tradeInValue: 6_000 }))
    expect(r.tradeCredit).toBe(6_000)
  })

  it('credit is on the trade-in value, not equity', () => {
    const r = calculateDeal(
      state((s) => (s.tradeInCredit.rule = { value: 'full', ...S })),
      deal({ tradeInValue: 6_000, tradeInPayoff: 6_000 }),
    )
    expect(r.tradeCredit).toBe(6_000)
  })
})

describe('step 3: taxable base', () => {
  it('deduct vs tax_full_price on the same deal gives different tax', () => {
    const input = deal({ rebate: 2_000 })
    const deduct = calculateDeal(
      state((s) => (s.rebateTreatment = { value: 'deduct', ...S })),
      input,
    )
    const full = calculateDeal(
      state((s) => (s.rebateTreatment = { value: 'tax_full_price', ...S })),
      input,
    )
    expect(deduct.taxableBase).toBe(30_000 - 2_000 + 300)
    expect(full.taxableBase).toBe(30_000 + 300)
    expect(full.vehicleTax - deduct.vehicleTax).toBeCloseTo(2_000 * 0.08, 9)
  })

  it('the rebate reduces the amount financed under either treatment', () => {
    for (const value of ['deduct', 'tax_full_price'] as const) {
      const s = state((r) => (r.rebateTreatment = { value, ...S }))
      const without = calculateDeal(s, deal())
      const withRebate = calculateDeal(s, deal({ rebate: 2_000 }))
      const taxDiff = withRebate.vehicleTax - without.vehicleTax
      expect(withRebate.amountFinanced).toBeCloseTo(without.amountFinanced - 2_000 + taxDiff, 9)
    }
  })

  it('subtracts the dealer discount', () => {
    const r = calculateDeal(state(), deal({ dealerDiscount: 1_000 }))
    expect(r.taxableBase).toBe(30_000 - 1_000 + 300)
  })

  it('taxable doc fee is in the base; non-taxable is not', () => {
    const taxable = calculateDeal(state(), deal())
    const exempt = calculateDeal(
      state((s) => (s.docFee.taxable = { value: false, ...S })),
      deal(),
    )
    expect(taxable.taxableBase - exempt.taxableBase).toBe(300)
  })

  it('taxable and non-taxable add-ons by type', () => {
    const input = deal({
      addOns: [{ name: 'Floor mats', amount: 200 }],
      serviceContract: 1_500,
      gap: 700,
    })
    const r = calculateDeal(state(), input)
    // Fixture: accessories taxable, service contract and GAP not.
    expect(r.taxableBase).toBe(30_000 + 300 + 200)

    const allTaxable = calculateDeal(
      state((s) => {
        s.addOnTaxable.serviceContract = { value: true, ...S }
        s.addOnTaxable.gap = { value: true, ...S }
      }),
      input,
    )
    expect(allTaxable.taxableBase).toBe(30_000 + 300 + 200 + 1_500 + 700)

    const noneTaxable = calculateDeal(
      state((s) => (s.addOnTaxable.accessories = { value: false, ...S })),
      input,
    )
    expect(noneTaxable.taxableBase).toBe(30_000 + 300)
  })

  it('never goes below zero', () => {
    const r = calculateDeal(
      state((s) => (s.tradeInCredit.rule = { value: 'full', ...S })),
      deal({ price: 5_000, docFee: 0, tradeInValue: 9_000 }),
    )
    expect(r.taxableBase).toBe(0)
    expect(r.vehicleTax).toBe(0)
  })
})

describe('step 4: vehicle tax', () => {
  it('multiplies the taxable base by the entered rate', () => {
    const r = calculateDeal(state(), deal({ taxRate: 0.0725 }))
    expect(r.vehicleTax).toBeCloseTo((30_000 + 300) * 0.0725, 9)
    expect(r.taxRate).toBe(0.0725)
  })

  it.each(['sales_use', 'title_tax', 'highway_use', 'excise', 'percent_fee'] as const)(
    'type %s applies the rate to the base',
    (type) => {
      const r = calculateDeal(
        state((s) => (s.vehicleTax.type = { value: type, ...S })),
        deal({ taxRate: 0.05 }),
      )
      expect(r.vehicleTax).toBeCloseTo(30_300 * 0.05, 9)
    },
  )

  it('type none charges no vehicle tax whatever rate is entered', () => {
    const r = calculateDeal(
      state((s) => (s.vehicleTax.type = { value: 'none', ...S })),
      deal({ taxRate: 0.08 }),
    )
    expect(r.vehicleTax).toBe(0)
    expect(r.taxRate).toBe(0)
  })

  it('applies the minimum', () => {
    const r = calculateDeal(
      state((s) => (s.vehicleTax.min = { value: 500, ...S })),
      deal({ price: 2_000, docFee: 0, taxRate: 0.05 }),
    )
    expect(r.vehicleTax).toBe(500)
  })

  it('applies the maximum', () => {
    const r = calculateDeal(
      state((s) => (s.vehicleTax.max = { value: 1_000, ...S })),
      deal({ taxRate: 0.08 }),
    )
    expect(r.vehicleTax).toBe(1_000)
  })

  it('leaves tax between min and max alone', () => {
    const r = calculateDeal(
      state((s) => {
        s.vehicleTax.min = { value: 100, ...S }
        s.vehicleTax.max = { value: 100_000, ...S }
      }),
      deal(),
    )
    expect(r.vehicleTax).toBeCloseTo(30_300 * 0.08, 9)
  })
})

describe('step 5: government fees', () => {
  it('flat', () => {
    const r = calculateDeal(onlyFees(fee({ kind: 'flat', amount: 150 })), deal())
    expect(r.governmentFees).toBe(150)
  })

  it('percent of the vehicle price after dealer discount', () => {
    const r = calculateDeal(
      onlyFees(fee({ kind: 'percent', rate: 0.01 })),
      deal({ dealerDiscount: 2_000 }),
    )
    expect(r.governmentFees).toBeCloseTo(280, 9)
  })

  const brackets = [
    { upTo: 3_000, amount: 50 },
    { upTo: 5_000, amount: 80 },
    { upTo: null, amount: 120 },
  ]

  it.each([
    [2_500, 50],
    [3_000, 50],
    [3_001, 80],
    [9_000, 120],
  ])('weight: %i lb → $%i', (weightLb, expected) => {
    const r = calculateDeal(
      onlyFees(fee({ kind: 'weight', unit: 'lb', brackets })),
      deal({ vehicle: { weightLb } }),
    )
    expect(r.governmentFees).toBe(expected)
  })

  it('value: uses MSRP when given, otherwise the price', () => {
    const s = onlyFees(
      fee({
        kind: 'value',
        brackets: [
          { upTo: 25_000, amount: 40 },
          { upTo: null, amount: 90 },
        ],
      }),
    )
    expect(calculateDeal(s, deal({ vehicle: { msrp: 24_000 } })).governmentFees).toBe(40)
    expect(calculateDeal(s, deal()).governmentFees).toBe(90)
  })

  it('age: a new car is age 0', () => {
    const s = onlyFees(
      fee({
        kind: 'age',
        unit: 'years',
        brackets: [
          { upTo: 0, amount: 200 },
          { upTo: 5, amount: 120 },
          { upTo: null, amount: 60 },
        ],
      }),
    )
    expect(calculateDeal(s, deal()).governmentFees).toBe(200)
    expect(
      calculateDeal(s, deal({ condition: 'used', vehicle: { ageYears: 3 } })).governmentFees,
    ).toBe(120)
    expect(
      calculateDeal(s, deal({ condition: 'used', vehicle: { ageYears: 12 } })).governmentFees,
    ).toBe(60)
  })

  it('skips a lookup fee and warns when its vehicle input is missing', () => {
    const r = calculateDeal(
      onlyFees(fee({ kind: 'weight', unit: 'lb', brackets })),
      deal({ vehicle: {} }),
    )
    expect(r.governmentFees).toBe(0)
    expect(r.warnings.map((w) => w.code)).toContain('missing_vehicle_input')
  })

  it('EV-only fee applies only to EVs', () => {
    const s = onlyFees(fee({ kind: 'flat', amount: 100, evOnly: true }))
    expect(calculateDeal(s, deal()).governmentFees).toBe(0)
    expect(calculateDeal(s, deal({ vehicle: { isEv: true } })).governmentFees).toBe(100)
  })

  it('new-only fee skips used cars', () => {
    const s = onlyFees(fee({ kind: 'flat', amount: 75, newOnly: true }))
    expect(calculateDeal(s, deal()).governmentFees).toBe(75)
    expect(calculateDeal(s, deal({ condition: 'used' })).governmentFees).toBe(0)
  })

  it('lists each fee with its sources', () => {
    const r = calculateDeal(state(), deal())
    expect(r.fees).toEqual([{ id: 'title', name: 'Title fee', amount: 100, sources: ['src-a'] }])
  })
})

describe('steps 6-7: out-the-door price and amount financed', () => {
  const input = deal({
    dealerDiscount: 1_000,
    rebate: 500,
    tradeInValue: 4_000,
    tradeInPayoff: 1_000,
    cashDown: 2_000,
    addOns: [{ name: 'Tint', amount: 400 }],
    serviceContract: 1_200,
    gap: 600,
    lenderFee: 250,
  })

  it('out-the-door price adds every charge', () => {
    const r = calculateDeal(state(), input)
    const expected = 30_000 - 1_000 + 300 + 400 + 1_200 + 600 + r.vehicleTax + r.governmentFees
    expect(r.outTheDoor).toBeCloseTo(expected, 9)
  })

  it('amount financed = OTD − rebate − trade equity − cash down + lender fee', () => {
    const r = calculateDeal(state(), input)
    expect(r.amountFinanced).toBeCloseTo(r.outTheDoor - 500 - 3_000 - 2_000 + 250, 9)
    expect(r.cashDueAtSigning).toBe(2_000)
  })

  it('taxes paid upfront vs financed: same OTD, different amount financed', () => {
    const financed = calculateDeal(state(), input)
    const upfront = calculateDeal(state(), { ...input, payTaxesAndFeesUpfront: true })
    const taxesAndFees = financed.vehicleTax + financed.governmentFees
    expect(upfront.outTheDoor).toBeCloseTo(financed.outTheDoor, 9)
    expect(upfront.amountFinanced).toBeCloseTo(financed.amountFinanced - taxesAndFees, 9)
    expect(upfront.cashDueAtSigning).toBeCloseTo(2_000 + taxesAndFees, 9)
    expect(upfront.loan.totalCost).toBeCloseTo(
      2_000 + taxesAndFees + upfront.loan.totalOfPayments,
      9,
    )
  })

  it('feeds the loan math', () => {
    const r = calculateDeal(state(), input)
    expect(r.loan.monthlyPayment).toBeGreaterThan(0)
    expect(r.loan.totalCost).toBeCloseTo(2_000 + r.loan.totalOfPayments, 9)
  })

  it('clamps a negative amount financed to zero and warns', () => {
    const r = calculateDeal(state(), deal({ cashDown: 50_000 }))
    expect(r.amountFinanced).toBe(0)
    expect(r.warnings.map((w) => w.code)).toContain('cash_exceeds_price')
  })
})

describe('itemization', () => {
  it('tags each line as set by the state or by the dealer', () => {
    const r = calculateDeal(state(), deal({ addOns: [{ name: 'Tint', amount: 400 }], gap: 600 }))
    const bySetter = Object.fromEntries(r.lines.map((l) => [l.label, l.setBy]))
    expect(bySetter['Vehicle price']).toBe('dealer')
    expect(bySetter['Doc fee']).toBe('dealer')
    expect(bySetter['Tint']).toBe('dealer')
    expect(bySetter['GAP']).toBe('dealer')
    expect(bySetter['Vehicle tax']).toBe('state')
    expect(bySetter['Title fee']).toBe('state')
  })

  it('lines sum to the out-the-door price', () => {
    const r = calculateDeal(state(), deal({ dealerDiscount: 500, serviceContract: 900 }))
    const sum = r.lines.reduce((a, l) => a + l.amount, 0)
    expect(sum).toBeCloseTo(r.outTheDoor, 9)
  })

  it('state lines carry their source ids', () => {
    const r = calculateDeal(state(), deal())
    expect(r.lines.find((l) => l.label === 'Title fee')?.sources).toEqual(['src-a'])
    expect(r.lines.find((l) => l.label === 'Vehicle tax')?.sources).toEqual(['src-a'])
  })
})

describe('warnings', () => {
  const codes = (r: ReturnType<typeof calculateDeal>) => r.warnings.map((w) => w.code)

  it('doc fee above the state cap', () => {
    expect(codes(calculateDeal(state(), deal({ docFee: 450 })))).toContain('doc_fee_over_cap')
    expect(codes(calculateDeal(state(), deal({ docFee: 300 })))).not.toContain('doc_fee_over_cap')
  })

  it('term longer than 72 months', () => {
    expect(codes(calculateDeal(state(), deal({ termMonths: 84 })))).toContain('long_term')
    expect(codes(calculateDeal(state(), deal({ termMonths: 72 })))).not.toContain('long_term')
  })

  it('unverified state on draft records only', () => {
    expect(codes(calculateDeal(state(), deal()))).toContain('unverified_state')
    const verified = state((s) => {
      s.status = 'verified'
      s.verifiedOn = '2026-10-15'
    })
    expect(codes(calculateDeal(verified, deal()))).not.toContain('unverified_state')
  })
})

describe('unknown (unsourced) fields', () => {
  it('assumes the costlier rule and says so', () => {
    const r = calculateDeal(
      state((s) => {
        s.tradeInCredit.rule = null
        s.rebateTreatment = null
        s.docFee.taxable = null
        s.addOnTaxable.serviceContract = null
        s.vehicleTax.min = null
        s.vehicleTax.max = null
      }),
      deal({ tradeInValue: 5_000, rebate: 1_000, serviceContract: 1_000 }),
    )
    expect(r.tradeCredit).toBe(0)
    expect(r.taxableBase).toBe(30_000 + 300 + 1_000)
    expect(r.assumptions).toEqual(
      expect.arrayContaining([
        'tradeInCredit.rule',
        'rebateTreatment',
        'docFee.taxable',
        'addOnTaxable.serviceContract',
      ]),
    )
  })

  it('a capped rule with an unknown cap gives no credit', () => {
    const r = calculateDeal(
      state((s) => (s.tradeInCredit.cap = null)),
      deal({ tradeInValue: 5_000 }),
    )
    expect(r.tradeCredit).toBe(0)
    expect(r.assumptions).toContain('tradeInCredit.cap')
  })

  it('an unknown tax type uses the entered rate', () => {
    const r = calculateDeal(
      state((s) => (s.vehicleTax.type = null)),
      deal(),
    )
    expect(r.vehicleTax).toBeCloseTo(30_300 * 0.08, 9)
    expect(r.assumptions).toContain('vehicleTax.type')
  })
})

describe('input validation', () => {
  it.each(['price', 'dealerDiscount', 'rebate', 'tradeInValue', 'cashDown', 'taxRate'] as const)(
    'rejects negative %s',
    (key) => {
      expect(() => calculateDeal(state(), deal({ [key]: -1 }))).toThrow(RangeError)
    },
  )
})

describe('defaultTaxRate', () => {
  it('is 8% where local taxes are allowed', () => {
    expect(defaultTaxRate(state(), 'new')).toBe(0.08)
  })

  it('is 0 in a state with no vehicle tax', () => {
    expect(
      defaultTaxRate(
        state((s) => (s.vehicleTax.type = { value: 'none', ...S })),
        'new',
      ),
    ).toBe(0)
  })

  it('is the state rate where local taxes are not allowed', () => {
    const s = state((r) => {
      r.vehicleTax.localAllowed = { value: false, ...S }
      r.vehicleTax.stateRateUsed = { value: 0.04, ...S }
    })
    expect(defaultTaxRate(s, 'new')).toBe(0.05)
    expect(defaultTaxRate(s, 'used')).toBe(0.04)
  })

  it('falls back to 8% when the state rate is unknown', () => {
    const s = state((r) => {
      r.vehicleTax.localAllowed = { value: false, ...S }
      r.vehicleTax.stateRateNew = null
    })
    expect(defaultTaxRate(s, 'new')).toBe(0.08)
  })
})
