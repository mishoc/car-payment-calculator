/**
 * Zod schema for one state record (data/states/<code>.json).
 *
 * Every rule or number is wrapped in `sourced(...)`: `{ value, sources }`, where `sources`
 * lists ids from the record's top-level `sources` array. A field that has not been found in a
 * primary source is `null` (unknown). That keeps "unknown" separate from a sourced `null`
 * value, such as `docFee.cap: { value: null, ... }`, which means the state sets no cap.
 */
import { z } from 'zod'

const isoDate = z.iso.date()
const dollars = z.number().finite().nonnegative()
const rate = z.number().finite().min(0).max(1)
const sourceIds = z.array(z.string().min(1)).min(1)

export function sourced<T extends z.ZodType>(value: T) {
  return z.object({ value, sources: sourceIds, note: z.string().optional() }).strict().nullable()
}

export const SourceSchema = z
  .object({
    id: z.string().min(1),
    url: z.url({ protocol: /^https$/ }),
    title: z.string().min(1),
    checkedOn: isoDate,
    /** Which office publishes it: revenue department, DMV, legislature, regulator, etc. */
    publisher: z.string().min(1),
  })
  .strict()

export const VEHICLE_TAX_TYPES = [
  'sales_use',
  'title_tax',
  'highway_use',
  'excise',
  'percent_fee',
  'none',
] as const
export const TRADE_IN_RULES = ['full', 'none', 'capped'] as const
export const REBATE_TREATMENTS = ['deduct', 'tax_full_price'] as const
export const FEE_KINDS = ['flat', 'weight', 'value', 'age', 'percent'] as const

const bracket = z
  .object({
    /** Upper bound of this bracket, inclusive; null for the last, open-ended bracket. */
    upTo: z.number().finite().nonnegative().nullable(),
    amount: dollars,
  })
  .strict()

const feeBase = {
  id: z.string().min(1),
  name: z.string().min(1),
  newOnly: z.boolean(),
  evOnly: z.boolean(),
  recurrence: z.enum(['one_time', 'annual']),
  sources: sourceIds,
  note: z.string().optional(),
}

export const FeeSchema = z.discriminatedUnion('kind', [
  z.object({ ...feeBase, kind: z.literal('flat'), amount: dollars }).strict(),
  z.object({ ...feeBase, kind: z.literal('percent'), rate }).strict(),
  z
    .object({
      ...feeBase,
      kind: z.literal('weight'),
      unit: z.literal('lb'),
      brackets: z.array(bracket).min(1),
    })
    .strict(),
  z.object({ ...feeBase, kind: z.literal('value'), brackets: z.array(bracket).min(1) }).strict(),
  z
    .object({
      ...feeBase,
      kind: z.literal('age'),
      unit: z.literal('years'),
      brackets: z.array(bracket).min(1),
    })
    .strict(),
])

export const WorkedExampleSchema = z
  .object({
    description: z.string().min(1),
    inputs: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
    expected: z.record(z.string(), z.number()),
    sources: sourceIds,
  })
  .strict()

export const StateRecordSchema = z
  .object({
    code: z.string().regex(/^[A-Z]{2}$/),
    name: z.string().min(1),
    status: z.enum(['draft', 'verified']),
    /** Date a person reviewed every field against its source; null until then. */
    verifiedOn: isoDate.nullable(),
    vehicleTax: z
      .object({
        type: sourced(z.enum(VEHICLE_TAX_TYPES)),
        stateRateNew: sourced(rate),
        stateRateUsed: sourced(rate),
        localAllowed: sourced(z.boolean()),
        /** Dollar minimum and maximum on the vehicle tax; a sourced null means none. */
        min: sourced(dollars.nullable()),
        max: sourced(dollars.nullable()),
      })
      .strict(),
    tradeInCredit: z
      .object({
        rule: sourced(z.enum(TRADE_IN_RULES)),
        cap: sourced(z.object({ amount: dollars, year: z.number().int() }).strict().nullable()),
      })
      .strict(),
    rebateTreatment: sourced(z.enum(REBATE_TREATMENTS)),
    docFee: z
      .object({
        /** A sourced null means the state sets no cap. */
        cap: sourced(dollars.nullable()),
        capYear: sourced(z.number().int()),
        /** Default doc fee when uncapped. Must come from a primary source like every field. */
        typical: sourced(dollars),
        taxable: sourced(z.boolean()),
      })
      .strict(),
    addOnTaxable: z
      .object({
        serviceContract: sourced(z.boolean()),
        gap: sourced(z.boolean()),
        accessories: sourced(z.boolean()),
      })
      .strict(),
    fees: z.array(FeeSchema),
    annualOwnershipTax: sourced(z.string()),
    notes: z.array(z.object({ text: z.string().min(1), sources: sourceIds }).strict()),
    workedExamples: z.array(WorkedExampleSchema),
    sources: z.array(SourceSchema),
  })
  .strict()

export type StateRecord = z.infer<typeof StateRecordSchema>
export type Source = z.infer<typeof SourceSchema>
export type Fee = z.infer<typeof FeeSchema>
