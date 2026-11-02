import { describe, expect, it } from 'vitest'
import { stateFiles } from './states'
import { validateStateRecord } from './validate'

// Uses the real date, so a record goes stale (and CI fails) 12 months after its sources
// were checked. That is intended: see the build plan's maintenance rule.
const today = new Date().toISOString().slice(0, 10)

describe('state data files', () => {
  it('found at least one state file', () => {
    expect(stateFiles.length).toBeGreaterThan(0)
  })

  it.each(stateFiles)('$fileCode.json passes validation', ({ fileCode, json }) => {
    expect(validateStateRecord(json, fileCode, today).errors).toEqual([])
  })
})
