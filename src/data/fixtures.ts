import type { StateRecord } from './schema'

/** A made-up state for tests. Not real data. */
export function testStateRecord(overrides: Partial<StateRecord> = {}): StateRecord {
  const s = { sources: ['src-a'] }
  return {
    code: 'ZZ',
    name: 'Test State',
    status: 'draft',
    verifiedOn: null,
    vehicleTax: {
      type: { value: 'sales_use', ...s },
      stateRateNew: { value: 0.05, ...s },
      stateRateUsed: { value: 0.05, ...s },
      localAllowed: { value: true, ...s },
      min: { value: null, ...s },
      max: { value: null, ...s },
    },
    tradeInCredit: {
      rule: { value: 'capped', ...s },
      cap: { value: { amount: 10_000, year: 2026 }, ...s },
    },
    rebateTreatment: { value: 'deduct', ...s },
    docFee: {
      cap: { value: 300, ...s },
      capYear: { value: 2026, ...s },
      typical: { value: 300, ...s },
      taxable: { value: true, ...s },
    },
    addOnTaxable: {
      serviceContract: { value: false, ...s },
      gap: { value: false, ...s },
      accessories: { value: true, ...s },
    },
    fees: [
      {
        id: 'title',
        name: 'Title fee',
        kind: 'flat',
        amount: 100,
        newOnly: false,
        evOnly: false,
        recurrence: 'one_time',
        ...s,
      },
    ],
    annualOwnershipTax: { value: 'None', ...s },
    notes: [],
    workedExamples: [],
    sources: [
      {
        id: 'src-a',
        url: 'https://revenue.test-state.gov/vehicles',
        title: 'Vehicle tax',
        checkedOn: '2026-10-01',
        publisher: 'Test State Department of Revenue',
      },
    ],
    ...overrides,
  }
}
