/**
 * Checks on state records beyond the Zod shape: source references, primary-source hosts,
 * verified vs draft consistency, and the 12-month staleness rule.
 */
import { StateRecordSchema, type StateRecord } from './schema'

/** Sourced fields, by path. Used to list unknown (null) fields and to check source ids. */
export const SOURCED_FIELD_PATHS = [
  'vehicleTax.type',
  'vehicleTax.stateRateNew',
  'vehicleTax.stateRateUsed',
  'vehicleTax.localAllowed',
  'vehicleTax.min',
  'vehicleTax.max',
  'tradeInCredit.rule',
  'tradeInCredit.cap',
  'rebateTreatment',
  'docFee.cap',
  'docFee.capYear',
  'docFee.typical',
  'docFee.taxable',
  'addOnTaxable.serviceContract',
  'addOnTaxable.gap',
  'addOnTaxable.accessories',
  'annualOwnershipTax',
] as const

export const MAX_AGE_MONTHS = 12

/**
 * Primary sources are state government sites. Every state revenue department, DMV and
 * legislature publishes under .gov or .us, so any other host is treated as a secondary
 * source and rejected.
 */
export function isPrimarySourceHost(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase()
  return host.endsWith('.gov') || host.endsWith('.us')
}

type SourcedValue = { value: unknown; sources: string[] } | null

function getPath(record: StateRecord, path: string): SourcedValue {
  return path
    .split('.')
    .reduce<unknown>((obj, key) => (obj as Record<string, unknown>)[key], record) as SourcedValue
}

export function unknownFields(record: StateRecord): string[] {
  return SOURCED_FIELD_PATHS.filter((p) => getPath(record, p) === null)
}

/** Every unreviewed state shows the "unverified estimate" label. */
export function needsUnverifiedLabel(record: Pick<StateRecord, 'status'>): boolean {
  return record.status !== 'verified'
}

function monthsBefore(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - months)
  return d.toISOString().slice(0, 10)
}

export interface ValidationResult {
  record?: StateRecord
  errors: string[]
}

/**
 * @param json parsed file contents
 * @param fileCode the file name without extension, expected to equal `code`
 * @param today ISO date used for the staleness rule
 */
export function validateStateRecord(
  json: unknown,
  fileCode: string,
  today: string,
): ValidationResult {
  const parsed = StateRecordSchema.safeParse(json)
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    }
  }
  const record = parsed.data
  const errors: string[] = []

  if (record.code !== fileCode) {
    errors.push(`code "${record.code}" does not match file name "${fileCode}.json"`)
  }

  const sourceIds = new Set<string>()
  for (const s of record.sources) {
    if (sourceIds.has(s.id)) errors.push(`sources: duplicate id "${s.id}"`)
    sourceIds.add(s.id)
    if (!isPrimarySourceHost(s.url)) {
      errors.push(`sources.${s.id}: ${s.url} is not a state government (.gov or .us) host`)
    }
    if (s.checkedOn > today)
      errors.push(`sources.${s.id}: checkedOn ${s.checkedOn} is in the future`)
  }

  const referenced = new Set<string>()
  const checkRefs = (where: string, ids: string[]) => {
    for (const id of ids) {
      referenced.add(id)
      if (!sourceIds.has(id)) errors.push(`${where}: unknown source id "${id}"`)
    }
  }
  for (const path of SOURCED_FIELD_PATHS) {
    const field = getPath(record, path)
    if (field) checkRefs(path, field.sources)
  }
  const feeIds = new Set<string>()
  for (const fee of record.fees) {
    if (feeIds.has(fee.id)) errors.push(`fees: duplicate id "${fee.id}"`)
    feeIds.add(fee.id)
    checkRefs(`fees.${fee.id}`, fee.sources)
  }
  record.notes.forEach((n, i) => checkRefs(`notes.${i}`, n.sources))
  record.workedExamples.forEach((w, i) => checkRefs(`workedExamples.${i}`, w.sources))

  for (const id of sourceIds) {
    if (!referenced.has(id)) errors.push(`sources.${id}: not referenced by any field`)
  }

  if (record.status === 'verified') {
    if (record.verifiedOn === null) errors.push('status is verified but verifiedOn is null')
    const unknown = unknownFields(record)
    if (unknown.length > 0)
      errors.push(`status is verified but fields are unknown: ${unknown.join(', ')}`)
  } else if (record.verifiedOn !== null) {
    errors.push('status is draft but verifiedOn is set')
  }

  const cutoff = monthsBefore(today, MAX_AGE_MONTHS)
  if (record.verifiedOn !== null && record.verifiedOn < cutoff) {
    errors.push(`verifiedOn ${record.verifiedOn} is older than ${MAX_AGE_MONTHS} months`)
  }
  for (const s of record.sources) {
    if (s.checkedOn < cutoff) {
      errors.push(
        `sources.${s.id}: checkedOn ${s.checkedOn} is older than ${MAX_AGE_MONTHS} months`,
      )
    }
  }

  return { record, errors }
}
