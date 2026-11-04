import type { Source, StateRecord } from '../data/schema'
import { compareTerms, amortizationSchedule } from '../engine/loan'
import type { DealInput, DealResult } from '../engine/deal'
import { money } from './format'

const FIELD_LABELS: Record<string, string> = {
  'tradeInCredit.rule': 'whether trade-ins reduce the taxed price (assumed: no)',
  'tradeInCredit.cap': 'the trade-in credit cap (assumed: no credit)',
  rebateTreatment: 'whether rebates are taxed (assumed: taxed)',
  'docFee.taxable': 'whether the doc fee is taxed (assumed: taxed)',
  'addOnTaxable.accessories': 'whether accessories are taxed (assumed: taxed)',
  'addOnTaxable.serviceContract': 'whether service contracts are taxed (assumed: taxed)',
  'addOnTaxable.gap': 'whether GAP is taxed (assumed: taxed)',
  'vehicleTax.type': 'the type of vehicle tax (assumed: sales tax at your rate)',
  'vehicleTax.min': 'any minimum tax (assumed: none)',
  'vehicleTax.max': 'any maximum tax (assumed: none)',
}

function SourceLinks({ ids, sources }: { ids?: string[]; sources: Map<string, Source> }) {
  if (!ids?.length) return null
  return (
    <span className="sources">
      {ids.map((id, i) => {
        const s = sources.get(id)
        if (!s) return null
        return (
          <a
            key={id}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            title={`${s.title}, checked ${s.checkedOn}`}
          >
            source{ids.length > 1 ? ` ${i + 1}` : ''}
          </a>
        )
      })}
    </span>
  )
}

interface ResultsProps {
  record: StateRecord
  input: DealInput
  result: DealResult
}

export function Results({ record, input, result }: ResultsProps) {
  const sources = new Map(record.sources.map((s) => [s.id, s]))
  const terms = compareTerms({
    amountFinanced: result.amountFinanced,
    annualRate: input.annualRate,
    cashDown: input.cashDown,
    upfrontTaxesAndFees: result.cashDueAtSigning - input.cashDown,
  })
  const schedule = amortizationSchedule(result.amountFinanced, input.annualRate, input.termMonths)
  const unverified = result.warnings.find((w) => w.code === 'unverified_state')
  const otherWarnings = result.warnings.filter((w) => w.code !== 'unverified_state')
  const noFeesSourced = record.fees.length === 0

  return (
    <section className="results" aria-live="polite" aria-labelledby="results-heading">
      <h2 id="results-heading" className="visually-hidden">
        Results
      </h2>
      {unverified && (
        <p className="banner" role="note">
          <strong>Unverified estimate.</strong> {record.name}’s taxes and fees have not been
          reviewed yet. Check every line with the dealer.
        </p>
      )}

      <div className="payment">
        <span className="payment-label">Monthly payment</span>
        <span className="payment-amount">{money(result.loan.monthlyPayment)}</span>
        <span className="payment-sub">
          for {input.termMonths} months at {(input.annualRate * 100).toFixed(2)}%
        </span>
      </div>

      <dl className="totals">
        <div>
          <dt>Amount financed</dt>
          <dd>{money(result.amountFinanced)}</dd>
        </div>
        <div>
          <dt>Total interest</dt>
          <dd>{money(result.loan.totalInterest)}</dd>
        </div>
        <div>
          <dt>Total of payments</dt>
          <dd>{money(result.loan.totalOfPayments)}</dd>
        </div>
        <div>
          <dt>Cash due at signing</dt>
          <dd>{money(result.cashDueAtSigning)}</dd>
        </div>
        <div className="wide">
          <dt>Total cost of the car</dt>
          <dd>{money(result.loan.totalCost)}</dd>
        </div>
      </dl>

      {otherWarnings.length > 0 && (
        <ul className="warnings">
          {otherWarnings.map((w) => (
            <li key={w.code}>{w.message}</li>
          ))}
        </ul>
      )}

      <h3>Out-the-door price</h3>
      <table className="lines">
        <tbody>
          {result.lines.map((l, i) => (
            <tr key={`${l.label}-${i}`}>
              <th scope="row">
                {l.label}
                <span className={`tag tag-${l.setBy}`}>
                  {l.setBy === 'state' ? 'set by the state' : 'set by the dealer, negotiable'}
                </span>
                <SourceLinks ids={l.sources} sources={sources} />
              </th>
              <td>{money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Out-the-door price</th>
            <td>{money(result.outTheDoor)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="hint">
        Taxed amount {money(result.taxableBase)} ×{' '}
        {(result.taxRate * 100).toFixed(3).replace(/\.?0+$/, '')}%.
        {result.tradeCredit > 0 && <> Trade-in credit {money(result.tradeCredit)}.</>}
      </p>
      {noFeesSourced && (
        <p className="hint">
          Title, registration and other state fees for {record.name} are not sourced yet, so they
          are not included. Expect them on the dealer’s sheet.
        </p>
      )}

      {result.assumptions.length > 0 && (
        <div className="assumptions">
          <h3>What we assumed</h3>
          <p>We have not yet found the state’s own source for:</p>
          <ul>
            {result.assumptions.map((a) => (
              <li key={a}>{FIELD_LABELS[a] ?? a}</li>
            ))}
          </ul>
        </div>
      )}

      {record.notes.length > 0 && (
        <div className="notes">
          <h3>{record.name} notes</h3>
          <ul>
            {record.notes.map((n, i) => (
              <li key={i}>
                {n.text} <SourceLinks ids={n.sources} sources={sources} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {record.annualOwnershipTax && (
        <p className="hint">
          {record.annualOwnershipTax.value} Billed separately, not in the total.
        </p>
      )}

      <h3>Compare terms</h3>
      <div className="table-scroll">
        <table className="terms">
          <thead>
            <tr>
              <th scope="col">Term</th>
              <th scope="col">Payment</th>
              <th scope="col">Interest</th>
              <th scope="col">Total cost</th>
            </tr>
          </thead>
          <tbody>
            {terms.map((t) => (
              <tr
                key={t.termMonths}
                className={t.termMonths === input.termMonths ? 'current' : undefined}
              >
                <th scope="row">{t.termMonths} mo</th>
                <td>{money(t.monthlyPayment)}</td>
                <td>{money(t.totalInterest)}</td>
                <td>{money(t.totalCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="schedule">
        <summary>Amortization schedule</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Payment</th>
                <th scope="col">Interest</th>
                <th scope="col">Principal</th>
                <th scope="col">Balance</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((row) => (
                <tr key={row.month}>
                  <th scope="row">{row.month}</th>
                  <td>{money(row.payment)}</td>
                  <td>{money(row.interest)}</td>
                  <td>{money(row.principal)}</td>
                  <td>{money(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
