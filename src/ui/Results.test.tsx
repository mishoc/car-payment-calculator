import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { testStateRecord } from '../data/fixtures'
import { stateRecords } from '../data/states'
import { calculateDeal } from '../engine/deal'
import { defaultForm, toDealInput } from './formState'
import { Results } from './Results'
import type { StateRecord } from '../data/schema'

function render(record: StateRecord) {
  const parsed = toDealInput(defaultForm(record))
  if (!parsed.ok) throw new Error(parsed.field)
  const result = calculateDeal(record, parsed.input)
  return renderToStaticMarkup(<Results record={record} input={parsed.input} result={result} />)
}

describe('Results', () => {
  it.each(stateRecords.filter((r) => r.status === 'draft'))(
    'draft state $code renders the "unverified estimate" label',
    (record) => {
      expect(render(record)).toContain('Unverified estimate')
    },
  )

  it.each(stateRecords.filter((r) => r.status === 'verified'))(
    'verified state $code does not render the label',
    (record) => {
      expect(render(record)).not.toContain('Unverified estimate')
    },
  )

  it('a verified record renders without the label', () => {
    const r = testStateRecord({ status: 'verified', verifiedOn: '2026-10-15' })
    expect(render(r)).not.toContain('Unverified estimate')
  })

  it('links state lines to their sources and tags dealer lines', () => {
    const html = render(testStateRecord())
    expect(html).toContain('href="https://revenue.test-state.gov/vehicles"')
    expect(html).toContain('set by the state')
    expect(html).toContain('set by the dealer, negotiable')
  })

  it('shows the monthly payment and the term comparison', () => {
    const html = render(testStateRecord())
    expect(html).toContain('Monthly payment')
    for (const t of [36, 48, 60, 72, 84]) expect(html).toContain(`${t} mo`)
  })
})
