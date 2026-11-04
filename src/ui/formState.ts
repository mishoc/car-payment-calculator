/**
 * Form state for the calculator: every field is the text the user typed, so typing is never
 * fought by reformatting. Converted to engine input by `toDealInput`, and to and from the URL
 * query string so a result can be shared.
 */
import type { StateRecord } from '../data/schema'
import { defaultTaxRate, type DealInput } from '../engine/deal'
import { parseNumber } from './format'

export const TERM_OPTIONS = [24, 36, 48, 60, 72, 84] as const

export interface AddOnField {
  name: string
  amount: string
}

export interface FormState {
  state: string
  condition: 'new' | 'used'
  price: string
  dealerDiscount: string
  rebate: string
  tradeInValue: string
  tradeInPayoff: string
  cashDown: string
  docFee: string
  addOns: AddOnField[]
  serviceContract: string
  gap: string
  lenderFee: string
  /** Percent, as typed: "8" means 8%. */
  taxRate: string
  /** Percent, as typed. */
  apr: string
  termMonths: number
  payUpfront: boolean
  weightLb: string
  msrp: string
  ageYears: string
  isEv: boolean
}

const pct = (rate: number) => String(Number((rate * 100).toFixed(4)))

/** The doc fee default: the state cap, else the state's sourced typical fee, else blank. */
export function defaultDocFee(record: StateRecord): string {
  const cap = record.docFee.cap?.value
  if (cap != null) return String(cap)
  const typical = record.docFee.typical?.value
  return typical != null ? String(typical) : ''
}

export function defaultTaxRateText(record: StateRecord, condition: FormState['condition']): string {
  return pct(defaultTaxRate(record, condition))
}

export function defaultForm(record: StateRecord): FormState {
  return {
    state: record.code,
    condition: 'new',
    price: '35000',
    dealerDiscount: '',
    rebate: '',
    tradeInValue: '',
    tradeInPayoff: '',
    cashDown: '5000',
    docFee: defaultDocFee(record),
    addOns: [],
    serviceContract: '',
    gap: '',
    lenderFee: '',
    taxRate: defaultTaxRateText(record, 'new'),
    apr: '7',
    termMonths: 60,
    payUpfront: false,
    weightLb: '',
    msrp: '',
    ageYears: '',
    isEv: false,
  }
}

/** Which extra vehicle inputs this state's fees need. */
export function vehicleInputsNeeded(record: StateRecord) {
  const kinds = new Set(record.fees.map((f) => f.kind))
  return {
    weight: kinds.has('weight'),
    msrp: kinds.has('value'),
    age: kinds.has('age'),
    ev: record.fees.some((f) => f.evOnly),
  }
}

export type ParseResult = { ok: true; input: DealInput } | { ok: false; field: string }

const MONEY_FIELDS = [
  'price',
  'dealerDiscount',
  'rebate',
  'tradeInValue',
  'tradeInPayoff',
  'cashDown',
  'docFee',
  'serviceContract',
  'gap',
  'lenderFee',
] as const

export function toDealInput(form: FormState): ParseResult {
  const n: Record<string, number> = {}
  for (const key of MONEY_FIELDS) {
    const v = parseNumber(form[key])
    if (!Number.isFinite(v)) return { ok: false, field: key }
    n[key] = v
  }
  const taxRate = parseNumber(form.taxRate)
  const apr = parseNumber(form.apr)
  if (!Number.isFinite(taxRate) || taxRate > 100) return { ok: false, field: 'taxRate' }
  if (!Number.isFinite(apr) || apr > 100) return { ok: false, field: 'apr' }
  const addOns = []
  for (const a of form.addOns) {
    const amount = parseNumber(a.amount)
    if (!Number.isFinite(amount)) return { ok: false, field: 'addOns' }
    if (amount > 0) addOns.push({ name: a.name.trim() || 'Dealer add-on', amount })
  }
  const optional = (text: string) => {
    if (text.trim() === '') return undefined
    const v = parseNumber(text)
    return Number.isFinite(v) ? v : undefined
  }
  return {
    ok: true,
    input: {
      condition: form.condition,
      price: n.price,
      dealerDiscount: n.dealerDiscount,
      rebate: n.rebate,
      tradeInValue: n.tradeInValue,
      tradeInPayoff: n.tradeInPayoff,
      cashDown: n.cashDown,
      docFee: n.docFee,
      addOns,
      serviceContract: n.serviceContract,
      gap: n.gap,
      lenderFee: n.lenderFee,
      taxRate: taxRate / 100,
      annualRate: apr / 100,
      termMonths: form.termMonths,
      payTaxesAndFeesUpfront: form.payUpfront,
      vehicle: {
        weightLb: optional(form.weightLb),
        msrp: optional(form.msrp),
        ageYears: optional(form.ageYears),
        isEv: form.isEv,
      },
    },
  }
}

// URL query string. Short keys keep shared links readable. No personal data is ever stored.
const KEYS: Record<string, keyof FormState> = {
  s: 'state',
  c: 'condition',
  p: 'price',
  d: 'dealerDiscount',
  r: 'rebate',
  tv: 'tradeInValue',
  tp: 'tradeInPayoff',
  dn: 'cashDown',
  df: 'docFee',
  sc: 'serviceContract',
  g: 'gap',
  lf: 'lenderFee',
  t: 'taxRate',
  a: 'apr',
  n: 'termMonths',
  u: 'payUpfront',
  w: 'weightLb',
  m: 'msrp',
  ag: 'ageYears',
  ev: 'isEv',
}

export function toQuery(form: FormState, defaults: FormState): string {
  const q = new URLSearchParams()
  for (const [k, field] of Object.entries(KEYS)) {
    const v = form[field]
    if (field !== 'state' && v === defaults[field]) continue
    q.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v))
  }
  form.addOns.forEach((a, i) => {
    q.set(`ao${i}`, a.name)
    q.set(`aa${i}`, a.amount)
  })
  return q.toString()
}

/** Reads a query string onto `defaults`; unknown or malformed values are ignored. */
export function fromQuery(query: string, defaults: FormState): FormState {
  const q = new URLSearchParams(query)
  const form: FormState = { ...defaults, addOns: [] }
  const writable = form as unknown as Record<string, unknown>
  for (const [k, field] of Object.entries(KEYS)) {
    const raw = q.get(k)
    if (raw === null || field === 'state') continue
    if (field === 'condition') {
      if (raw === 'new' || raw === 'used') form.condition = raw
    } else if (field === 'termMonths') {
      const t = Number(raw)
      if ((TERM_OPTIONS as readonly number[]).includes(t)) form.termMonths = t
    } else if (field === 'payUpfront' || field === 'isEv') {
      writable[field] = raw === '1'
    } else {
      writable[field] = raw.slice(0, 20)
    }
  }
  for (let i = 0; i < 10 && q.has(`aa${i}`); i++) {
    form.addOns.push({ name: (q.get(`ao${i}`) ?? '').slice(0, 60), amount: q.get(`aa${i}`) ?? '' })
  }
  return form
}
