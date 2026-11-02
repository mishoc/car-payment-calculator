import { describe, expect, it } from 'vitest'
import { testStateRecord } from './fixtures'
import { StateRecordSchema } from './schema'
import {
  isPrimarySourceHost,
  needsUnverifiedLabel,
  unknownFields,
  validateStateRecord,
} from './validate'

const TODAY = '2026-11-02'
const errorsFor = (json: unknown, code = 'ZZ') => validateStateRecord(json, code, TODAY).errors

describe('validateStateRecord', () => {
  it('accepts a complete draft record', () => {
    expect(errorsFor(testStateRecord())).toEqual([])
  })

  it('accepts a verified record with every field known', () => {
    expect(errorsFor(testStateRecord({ status: 'verified', verifiedOn: '2026-10-15' }))).toEqual([])
  })

  it('reports schema errors with their path', () => {
    const bad = {
      ...testStateRecord(),
      rebateTreatment: { value: 'sometimes', sources: ['src-a'] },
    }
    expect(errorsFor(bad)[0]).toMatch(/^rebateTreatment/)
  })

  it('rejects a sourced field with no source ids', () => {
    const r = testStateRecord()
    const bad = { ...r, rebateTreatment: { value: 'deduct', sources: [] } }
    expect(errorsFor(bad).join('\n')).toMatch(/rebateTreatment/)
  })

  it('rejects unknown keys', () => {
    expect(errorsFor({ ...testStateRecord(), hidden: true }).length).toBeGreaterThan(0)
  })

  it('requires the code to match the file name', () => {
    expect(errorsFor(testStateRecord(), 'YY')).toContain(
      'code "ZZ" does not match file name "YY.json"',
    )
  })

  it('rejects references to missing source ids', () => {
    const r = testStateRecord()
    r.rebateTreatment = { value: 'deduct', sources: ['nope'] }
    expect(errorsFor(r)).toContain('rebateTreatment: unknown source id "nope"')
  })

  it('rejects fee references to missing source ids', () => {
    const r = testStateRecord()
    r.fees[0].sources = ['nope']
    expect(errorsFor(r)).toContain('fees.title: unknown source id "nope"')
  })

  it('rejects sources nothing refers to', () => {
    const r = testStateRecord()
    r.sources.push({ ...r.sources[0], id: 'orphan' })
    expect(errorsFor(r)).toContain('sources.orphan: not referenced by any field')
  })

  it('rejects duplicate source and fee ids', () => {
    const r = testStateRecord()
    r.sources.push({ ...r.sources[0] })
    r.fees.push({ ...r.fees[0] })
    const errors = errorsFor(r)
    expect(errors).toContain('sources: duplicate id "src-a"')
    expect(errors).toContain('fees: duplicate id "title"')
  })

  it('rejects sources that are not state government hosts', () => {
    const r = testStateRecord()
    r.sources[0].url = 'https://carconciergepro.com/car-dealer-fees-and-taxes-by-state/'
    expect(errorsFor(r).join('\n')).toMatch(/not a state government/)
  })

  it('rejects non-https source URLs', () => {
    const r = testStateRecord()
    r.sources[0].url = 'http://revenue.test-state.gov/vehicles'
    expect(errorsFor(r).length).toBeGreaterThan(0)
  })

  it('rejects a verified record with unknown fields', () => {
    const r = testStateRecord({ status: 'verified', verifiedOn: '2026-10-15' })
    r.addOnTaxable.gap = null
    expect(errorsFor(r)).toContain('status is verified but fields are unknown: addOnTaxable.gap')
  })

  it('rejects a verified record without verifiedOn', () => {
    expect(errorsFor(testStateRecord({ status: 'verified' }))).toContain(
      'status is verified but verifiedOn is null',
    )
  })

  it('rejects a draft record with verifiedOn set', () => {
    expect(errorsFor(testStateRecord({ verifiedOn: '2026-10-15' }))).toContain(
      'status is draft but verifiedOn is set',
    )
  })

  it('fails when verifiedOn is older than 12 months', () => {
    const r = testStateRecord({ status: 'verified', verifiedOn: '2025-11-01' })
    expect(errorsFor(r)).toContain('verifiedOn 2025-11-01 is older than 12 months')
    const fresh = testStateRecord({ status: 'verified', verifiedOn: '2025-11-02' })
    expect(errorsFor(fresh)).toEqual([])
  })

  it('fails when any source check is older than 12 months, draft or verified', () => {
    const r = testStateRecord()
    r.sources[0].checkedOn = '2025-10-31'
    expect(errorsFor(r)).toContain('sources.src-a: checkedOn 2025-10-31 is older than 12 months')
  })

  it('rejects a source checked in the future', () => {
    const r = testStateRecord()
    r.sources[0].checkedOn = '2026-11-03'
    expect(errorsFor(r)).toContain('sources.src-a: checkedOn 2026-11-03 is in the future')
  })

  it('distinguishes an unknown field from a sourced "none"', () => {
    const r = testStateRecord()
    r.docFee.cap = { value: null, sources: ['src-a'] }
    r.vehicleTax.max = null
    expect(unknownFields(r)).toEqual(['vehicleTax.max'])
  })

  it('accepts every fee kind', () => {
    const base = {
      name: 'x',
      newOnly: false,
      evOnly: false,
      recurrence: 'annual',
      sources: ['src-a'],
    }
    const brackets = [
      { upTo: 3000, amount: 50 },
      { upTo: null, amount: 80 },
    ]
    const r = testStateRecord({
      fees: [
        { ...base, id: 'f', kind: 'flat', amount: 10 },
        { ...base, id: 'p', kind: 'percent', rate: 0.01 },
        { ...base, id: 'w', kind: 'weight', unit: 'lb', brackets },
        { ...base, id: 'v', kind: 'value', brackets },
        { ...base, id: 'a', kind: 'age', unit: 'years', brackets },
      ] as never,
    })
    expect(StateRecordSchema.safeParse(r).success).toBe(true)
    expect(errorsFor(r)).toEqual([])
  })
})

describe('isPrimarySourceHost', () => {
  it.each([
    ['https://tax.illinois.gov/x', true],
    ['https://www.dmv.ca.gov/x', true],
    ['https://www.legis.state.xx.us/x', true],
    ['https://caredge.com/x', false],
    ['https://otdcheck.com/x', false],
    ['https://notreally.gov.example.com/x', false],
  ])('%s → %s', (url, expected) => {
    expect(isPrimarySourceHost(url)).toBe(expected)
  })
})

describe('needsUnverifiedLabel', () => {
  it('labels draft states and not verified ones', () => {
    expect(needsUnverifiedLabel({ status: 'draft' })).toBe(true)
    expect(needsUnverifiedLabel({ status: 'verified' })).toBe(false)
  })
})
