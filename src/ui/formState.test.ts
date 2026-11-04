import { describe, expect, it } from 'vitest'
import { testStateRecord } from '../data/fixtures'
import { defaultForm, fromQuery, toDealInput, toQuery, vehicleInputsNeeded } from './formState'

const record = testStateRecord()
const defaults = defaultForm(record)

describe('defaultForm', () => {
  it('uses the state doc fee cap and default tax rate', () => {
    expect(defaults.docFee).toBe('300')
    expect(defaults.taxRate).toBe('8')
  })

  it('leaves the doc fee blank when the state has no sourced cap or typical fee', () => {
    const r = testStateRecord()
    r.docFee.cap = null
    r.docFee.typical = null
    expect(defaultForm(r).docFee).toBe('')
  })
})

describe('toDealInput', () => {
  it('converts percents and money text', () => {
    const res = toDealInput({ ...defaults, price: '31,500', taxRate: '7.25', apr: '6' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.input.price).toBe(31_500)
    expect(res.input.taxRate).toBeCloseTo(0.0725, 12)
    expect(res.input.annualRate).toBeCloseTo(0.06, 12)
  })

  it('names the first bad field', () => {
    expect(toDealInput({ ...defaults, rebate: 'lots' })).toEqual({ ok: false, field: 'rebate' })
    expect(toDealInput({ ...defaults, apr: '150' })).toEqual({ ok: false, field: 'apr' })
  })

  it('drops empty add-ons and names unnamed ones', () => {
    const res = toDealInput({
      ...defaults,
      addOns: [
        { name: '', amount: '200' },
        { name: 'Tint', amount: '' },
      ],
    })
    expect(res.ok && res.input.addOns).toEqual([{ name: 'Dealer add-on', amount: 200 }])
  })
})

describe('URL query string', () => {
  it('round-trips a changed form', () => {
    const form = {
      ...defaults,
      condition: 'used' as const,
      price: '22000',
      tradeInValue: '5000',
      termMonths: 72,
      payUpfront: true,
      addOns: [{ name: 'Mats', amount: '150' }],
    }
    expect(fromQuery(toQuery(form, defaults), defaults)).toEqual(form)
  })

  it('omits fields left at their defaults', () => {
    expect(toQuery(defaults, defaults)).toBe('s=ZZ')
  })

  it('ignores malformed values', () => {
    const f = fromQuery('c=leased&n=999&p=12345678901234567890123', defaults)
    expect(f.condition).toBe('new')
    expect(f.termMonths).toBe(60)
    expect(f.price.length).toBeLessThanOrEqual(20)
  })

  it('never contains a ZIP code key', () => {
    expect(toQuery(defaults, defaults)).not.toMatch(/zip/i)
  })
})

describe('vehicleInputsNeeded', () => {
  it('asks only for what the state fees use', () => {
    expect(vehicleInputsNeeded(record)).toEqual({
      weight: false,
      msrp: false,
      age: false,
      ev: false,
    })
    const r = testStateRecord()
    r.fees.push({
      id: 'w',
      name: 'Weight fee',
      kind: 'weight',
      unit: 'lb',
      brackets: [{ upTo: null, amount: 10 }],
      newOnly: false,
      evOnly: true,
      recurrence: 'annual',
      sources: ['src-a'],
    })
    expect(vehicleInputsNeeded(r)).toEqual({ weight: true, msrp: false, age: false, ev: true })
  })
})
