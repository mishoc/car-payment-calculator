/**
 * Loan math: payment, totals, amortization schedule, term comparison.
 *
 * Pure functions with full precision. Rates are annual decimals (6% = 0.06). The rate is
 * treated as the loan's interest rate; a lender's legal APR can be higher once lender fees
 * are counted.
 */

export const DEFAULT_COMPARISON_TERMS: readonly number[] = [36, 48, 60, 72, 84]

export interface LoanInput {
  /** Amount financed, in dollars. */
  amountFinanced: number
  /** Annual interest rate as a decimal (0.06 = 6%). */
  annualRate: number
  /** Loan term in whole months. */
  termMonths: number
  /** Cash paid at signing toward the car. Defaults to 0. */
  cashDown?: number
  /** Taxes and fees the buyer pays upfront instead of financing. Defaults to 0. */
  upfrontTaxesAndFees?: number
}

export interface LoanTotals {
  monthlyPayment: number
  /** Monthly payment × term. */
  totalOfPayments: number
  /** Total of payments − amount financed. */
  totalInterest: number
  /** Cash down + upfront taxes and fees + total of payments. */
  totalCost: number
}

export interface AmortizationRow {
  /** 1-based month number. */
  month: number
  payment: number
  interest: number
  principal: number
  /** Balance remaining after this month's payment. */
  balance: number
}

export interface TermComparisonRow extends LoanTotals {
  termMonths: number
}

function assertNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite number ≥ 0, got ${value}`)
  }
}

function assertTerm(termMonths: number): void {
  if (!Number.isInteger(termMonths) || termMonths < 1) {
    throw new RangeError(`termMonths must be a whole number ≥ 1, got ${termMonths}`)
  }
}

function validateLoan(amountFinanced: number, annualRate: number, termMonths: number): void {
  assertNonNegative('amountFinanced', amountFinanced)
  assertNonNegative('annualRate', annualRate)
  assertTerm(termMonths)
}

/**
 * M = P · r / (1 − (1 + r)^−n), with r = annual rate ÷ 12 and n = term in months.
 * If the rate is 0, M = P ÷ n.
 */
export function monthlyPayment(
  amountFinanced: number,
  annualRate: number,
  termMonths: number,
): number {
  validateLoan(amountFinanced, annualRate, termMonths)
  const r = annualRate / 12
  if (r === 0) return amountFinanced / termMonths
  return (amountFinanced * r) / (1 - Math.pow(1 + r, -termMonths))
}

export function loanTotals(input: LoanInput): LoanTotals {
  const { amountFinanced, annualRate, termMonths, cashDown = 0, upfrontTaxesAndFees = 0 } = input
  assertNonNegative('cashDown', cashDown)
  assertNonNegative('upfrontTaxesAndFees', upfrontTaxesAndFees)
  const payment = monthlyPayment(amountFinanced, annualRate, termMonths)
  const totalOfPayments = payment * termMonths
  return {
    monthlyPayment: payment,
    totalOfPayments,
    totalInterest: totalOfPayments - amountFinanced,
    totalCost: cashDown + upfrontTaxesAndFees + totalOfPayments,
  }
}

/**
 * Month-by-month schedule. Interest each month is the opening balance × rate ÷ 12. The last
 * row pays off whatever balance remains, so the schedule ends at exactly 0 and the principal
 * column sums to the amount financed; that adjustment is a floating-point residue far below a
 * cent.
 */
export function amortizationSchedule(
  amountFinanced: number,
  annualRate: number,
  termMonths: number,
): AmortizationRow[] {
  const payment = monthlyPayment(amountFinanced, annualRate, termMonths)
  const r = annualRate / 12
  const rows: AmortizationRow[] = []
  let balance = amountFinanced

  for (let month = 1; month <= termMonths; month++) {
    const interest = balance * r
    const isLast = month === termMonths
    const principal = isLast ? balance : payment - interest
    balance = isLast ? 0 : balance - principal
    rows.push({
      month,
      payment: isLast ? interest + principal : payment,
      interest,
      principal,
      balance,
    })
  }

  return rows
}

export function compareTerms(
  input: Omit<LoanInput, 'termMonths'> & { terms?: readonly number[] },
): TermComparisonRow[] {
  const { terms = DEFAULT_COMPARISON_TERMS, ...loan } = input
  return terms.map((termMonths) => ({ termMonths, ...loanTotals({ ...loan, termMonths }) }))
}
