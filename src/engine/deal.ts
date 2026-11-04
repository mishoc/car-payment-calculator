/**
 * Tax and fee engine: steps 1-7 of the build plan's calculation model.
 *
 * Every state difference comes from the state record. This file must never branch on a state
 * name or code (CLAUDE.md, hard rule 1).
 *
 * A field the record leaves unknown (null, no primary source yet) gets the assumption that
 * costs the buyer more, and its path is listed in `assumptions` so the UI can say so.
 */
import type { Fee, StateRecord } from '../data/schema'
import { needsUnverifiedLabel } from '../data/validate'
import { loanTotals, type LoanTotals } from './loan'

export const DEFAULT_COMBINED_TAX_RATE = 0.08
export const LONG_TERM_MONTHS = 72

export interface AddOn {
  name: string
  amount: number
}

export interface VehicleDetails {
  weightLb?: number
  msrp?: number
  /** Model-year age in years; a new car is 0. */
  ageYears?: number
  isEv?: boolean
}

export interface DealInput {
  condition: 'new' | 'used'
  price: number
  dealerDiscount: number
  /** Manufacturer rebate. */
  rebate: number
  tradeInValue: number
  tradeInPayoff: number
  cashDown: number
  docFee: number
  /** Dealer add-ons other than the service contract and GAP; taxed as accessories. */
  addOns: AddOn[]
  serviceContract: number
  gap: number
  lenderFee: number
  /** Combined state + local rate the buyer entered, as a decimal. */
  taxRate: number
  annualRate: number
  termMonths: number
  payTaxesAndFeesUpfront: boolean
  vehicle: VehicleDetails
}

export type WarningCode =
  | 'doc_fee_over_cap'
  | 'negative_equity'
  | 'long_term'
  | 'unverified_state'
  | 'missing_vehicle_input'
  | 'cash_exceeds_price'

export interface Warning {
  code: WarningCode
  message: string
}

export interface FeeLine {
  id: string
  name: string
  amount: number
  sources: string[]
}

export interface ItemLine {
  label: string
  amount: number
  setBy: 'state' | 'dealer'
  sources?: string[]
}

export interface DealResult {
  tradeEquity: number
  tradeCredit: number
  taxableBase: number
  /** Rate actually applied (0 when the state has no vehicle tax). */
  taxRate: number
  vehicleTax: number
  fees: FeeLine[]
  governmentFees: number
  outTheDoor: number
  amountFinanced: number
  cashDueAtSigning: number
  loan: LoanTotals
  lines: ItemLine[]
  warnings: Warning[]
  /** Paths of unknown state fields the engine had to assume. */
  assumptions: string[]
}

type Sourced<T> = { value: T; sources: string[] } | null

const NON_NEGATIVE_INPUTS = [
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
  'taxRate',
] as const

function validate(input: DealInput): void {
  for (const key of NON_NEGATIVE_INPUTS) {
    const v = input[key]
    if (!Number.isFinite(v) || v < 0)
      throw new RangeError(`${key} must be a finite number ≥ 0, got ${v}`)
  }
  for (const a of input.addOns) {
    if (!Number.isFinite(a.amount) || a.amount < 0) {
      throw new RangeError(`add-on "${a.name}" must be a finite number ≥ 0, got ${a.amount}`)
    }
  }
}

/** Default for the tax rate field: 8%, 0 with no vehicle tax, or the state rate if no local tax. */
export function defaultTaxRate(record: StateRecord, condition: DealInput['condition']): number {
  const vt = record.vehicleTax
  if (vt.type?.value === 'none') return 0
  if (vt.localAllowed?.value === false) {
    const rate = condition === 'new' ? vt.stateRateNew : vt.stateRateUsed
    if (rate) return rate.value
  }
  return DEFAULT_COMBINED_TAX_RATE
}

function lookupBracket(brackets: { upTo: number | null; amount: number }[], x: number): number {
  const hit = brackets.find((b) => b.upTo === null || x <= b.upTo)
  return hit ? hit.amount : brackets[brackets.length - 1].amount
}

function feeAmount(fee: Fee, input: DealInput): number | 'missing' {
  const v = input.vehicle
  switch (fee.kind) {
    case 'flat':
      return fee.amount
    case 'percent':
      return fee.rate * (input.price - input.dealerDiscount)
    case 'weight':
      return v.weightLb === undefined ? 'missing' : lookupBracket(fee.brackets, v.weightLb)
    case 'value':
      return lookupBracket(fee.brackets, v.msrp ?? input.price)
    case 'age': {
      const age = input.condition === 'new' ? 0 : v.ageYears
      return age === undefined ? 'missing' : lookupBracket(fee.brackets, age)
    }
  }
}

export function calculateDeal(record: StateRecord, input: DealInput): DealResult {
  validate(input)
  const assumptions: string[] = []
  const warnings: Warning[] = []

  /** Reads a sourced field; when unknown, records the assumption and returns the fallback. */
  function known<T>(field: Sourced<T>, path: string, fallback: T): T {
    if (field === null) {
      assumptions.push(path)
      return fallback
    }
    return field.value
  }

  // 1. Trade equity
  const tradeEquity = input.tradeInValue - input.tradeInPayoff
  if (tradeEquity < 0) {
    warnings.push({
      code: 'negative_equity',
      message: `You owe more on your trade-in than it is worth; the difference is added to the loan.`,
    })
  }

  // 2. Trade-in credit
  const rule = known(record.tradeInCredit.rule, 'tradeInCredit.rule', 'none')
  let tradeCredit = 0
  if (rule === 'full') tradeCredit = input.tradeInValue
  if (rule === 'capped') {
    const cap = known(record.tradeInCredit.cap, 'tradeInCredit.cap', { amount: 0, year: 0 })
    tradeCredit = Math.min(input.tradeInValue, cap?.amount ?? input.tradeInValue)
  }

  // 3. Taxable base
  const rebateTreatment = known(record.rebateTreatment, 'rebateTreatment', 'tax_full_price')
  const docFeeTaxable = known(record.docFee.taxable, 'docFee.taxable', true)
  const t = record.addOnTaxable
  const accessoriesTaxable = known(t.accessories, 'addOnTaxable.accessories', true)
  const addOnTotal = input.addOns.reduce((a, x) => a + x.amount, 0)
  let taxableBase =
    input.price -
    input.dealerDiscount -
    (rebateTreatment === 'deduct' ? input.rebate : 0) -
    tradeCredit +
    (docFeeTaxable ? input.docFee : 0) +
    (accessoriesTaxable ? addOnTotal : 0)
  if (input.serviceContract > 0 && known(t.serviceContract, 'addOnTaxable.serviceContract', true)) {
    taxableBase += input.serviceContract
  }
  if (input.gap > 0 && known(t.gap, 'addOnTaxable.gap', true)) taxableBase += input.gap
  taxableBase = Math.max(0, taxableBase)

  // 4. Vehicle tax
  const vt = record.vehicleTax
  const taxType = known(vt.type, 'vehicleTax.type', 'sales_use')
  const taxRate = taxType === 'none' ? 0 : input.taxRate
  let vehicleTax = taxableBase * taxRate
  if (taxRate > 0) {
    const min = known(vt.min, 'vehicleTax.min', null)
    const max = known(vt.max, 'vehicleTax.max', null)
    if (min !== null) vehicleTax = Math.max(vehicleTax, min)
    if (max !== null) vehicleTax = Math.min(vehicleTax, max)
  }

  // 5. Government fees
  const fees: FeeLine[] = []
  for (const fee of record.fees) {
    if (fee.newOnly && input.condition !== 'new') continue
    if (fee.evOnly && !input.vehicle.isEv) continue
    const amount = feeAmount(fee, input)
    if (amount === 'missing') {
      warnings.push({
        code: 'missing_vehicle_input',
        message: `${fee.name} depends on the vehicle's ${fee.kind}; enter it to include this fee.`,
      })
      continue
    }
    fees.push({ id: fee.id, name: fee.name, amount, sources: fee.sources })
  }
  const governmentFees = fees.reduce((a, f) => a + f.amount, 0)

  // 6. Out-the-door price
  const outTheDoor =
    input.price -
    input.dealerDiscount +
    input.docFee +
    addOnTotal +
    input.serviceContract +
    input.gap +
    vehicleTax +
    governmentFees

  // 7. Amount financed
  const upfront = input.payTaxesAndFeesUpfront ? vehicleTax + governmentFees : 0
  let amountFinanced =
    outTheDoor - input.rebate - tradeEquity - input.cashDown + input.lenderFee - upfront
  if (amountFinanced < 0) {
    warnings.push({
      code: 'cash_exceeds_price',
      message: 'Your cash, rebate and trade-in cover more than the price; nothing is financed.',
    })
    amountFinanced = 0
  }
  const cashDueAtSigning = input.cashDown + upfront

  const loan = loanTotals({
    amountFinanced,
    annualRate: input.annualRate,
    termMonths: input.termMonths,
    cashDown: input.cashDown,
    upfrontTaxesAndFees: upfront,
  })

  // Itemization (sums to the out-the-door price)
  const lines: ItemLine[] = [{ label: 'Vehicle price', amount: input.price, setBy: 'dealer' }]
  if (input.dealerDiscount > 0) {
    lines.push({ label: 'Dealer discount', amount: -input.dealerDiscount, setBy: 'dealer' })
  }
  lines.push({ label: 'Doc fee', amount: input.docFee, setBy: 'dealer' })
  for (const a of input.addOns) lines.push({ label: a.name, amount: a.amount, setBy: 'dealer' })
  if (input.serviceContract > 0) {
    lines.push({ label: 'Service contract', amount: input.serviceContract, setBy: 'dealer' })
  }
  if (input.gap > 0) lines.push({ label: 'GAP', amount: input.gap, setBy: 'dealer' })
  lines.push({
    label: 'Vehicle tax',
    amount: vehicleTax,
    setBy: 'state',
    sources: vt.type?.sources,
  })
  for (const f of fees)
    lines.push({ label: f.name, amount: f.amount, setBy: 'state', sources: f.sources })

  // Warnings
  const docCap = record.docFee.cap?.value
  if (docCap != null && input.docFee > docCap) {
    warnings.push({
      code: 'doc_fee_over_cap',
      message: `The doc fee is above the state cap of $${docCap.toFixed(2)}.`,
    })
  }
  if (input.termMonths > LONG_TERM_MONTHS) {
    warnings.push({
      code: 'long_term',
      message: `Loans longer than ${LONG_TERM_MONTHS} months cost more interest and can leave you owing more than the car is worth.`,
    })
  }
  if (needsUnverifiedLabel(record)) {
    warnings.push({
      code: 'unverified_state',
      message: 'Unverified estimate: this state’s taxes and fees have not been reviewed yet.',
    })
  }

  return {
    tradeEquity,
    tradeCredit,
    taxableBase,
    taxRate,
    vehicleTax,
    fees,
    governmentFees,
    outTheDoor,
    amountFinanced,
    cashDueAtSigning,
    loan,
    lines,
    warnings,
    assumptions,
  }
}
