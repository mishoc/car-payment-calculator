import { useEffect, useMemo, useState } from 'react'
import { stateRecords } from './data/states'
import type { StateRecord } from './data/schema'
import { calculateDeal } from './engine/deal'
import { percent } from './ui/format'
import {
  TERM_OPTIONS,
  defaultForm,
  defaultTaxRateText,
  fromQuery,
  toDealInput,
  toQuery,
  vehicleInputsNeeded,
  type FormState,
} from './ui/formState'
import { Field } from './ui/Field'
import { Results } from './ui/Results'

function recordFor(code: string | null): StateRecord {
  return stateRecords.find((r) => r.code === code) ?? stateRecords[0]
}

function initialForm(): FormState {
  const q = new URLSearchParams(window.location.search)
  const record = recordFor(q.get('s'))
  return fromQuery(window.location.search, defaultForm(record))
}

function App() {
  const [form, setForm] = useState<FormState>(initialForm)
  const record = recordFor(form.state)
  const defaults = useMemo(() => defaultForm(record), [record])
  const needs = vehicleInputsNeeded(record)

  useEffect(() => {
    const query = toQuery(form, defaults)
    window.history.replaceState(null, '', `${window.location.pathname}?${query}`)
  }, [form, defaults])

  const set =
    <K extends keyof FormState>(key: K) =>
    (value: FormState[K]) =>
      setForm((f) => ({ ...f, [key]: value }))

  function changeState(code: string) {
    const next = recordFor(code)
    const d = defaultForm(next)
    setForm((f) => ({
      ...f,
      state: next.code,
      docFee: d.docFee,
      taxRate: defaultTaxRateText(next, f.condition),
    }))
  }

  function changeCondition(condition: FormState['condition']) {
    setForm((f) => ({
      ...f,
      condition,
      taxRate:
        f.taxRate === defaultTaxRateText(record, f.condition)
          ? defaultTaxRateText(record, condition)
          : f.taxRate,
    }))
  }

  const parsed = toDealInput(form)
  const result = parsed.ok ? calculateDeal(record, parsed.input) : null
  const bad = parsed.ok ? null : parsed.field
  const stateRate =
    form.condition === 'new' ? record.vehicleTax.stateRateNew : record.vehicleTax.stateRateUsed
  const taxDefault = defaultTaxRateText(record, form.condition)

  return (
    <>
      <header className="site-header">
        <h1>Car Payments</h1>
        <p>Your monthly payment, with every state tax and fee itemized.</p>
      </header>
      <main>
        <form className="inputs" onSubmit={(e) => e.preventDefault()} aria-label="Loan details">
          <fieldset>
            <legend>The car</legend>
            <div className="field">
              <label htmlFor="state">State</label>
              <select id="state" value={record.code} onChange={(e) => changeState(e.target.value)}>
                {stateRecords.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                    {r.status === 'draft' ? ' (unverified estimate)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" role="radiogroup" aria-label="New or used">
              <span className="field-label">New or used</span>
              <div className="segmented">
                {(['new', 'used'] as const).map((c) => (
                  <label key={c}>
                    <input
                      type="radio"
                      name="condition"
                      value={c}
                      checked={form.condition === c}
                      onChange={() => changeCondition(c)}
                    />
                    {c === 'new' ? 'New' : 'Used'}
                  </label>
                ))}
              </div>
            </div>
            <Field
              label="Price"
              prefix="$"
              value={form.price}
              onChange={set('price')}
              invalid={bad === 'price'}
            />
            <Field
              label="Dealer discount"
              prefix="$"
              value={form.dealerDiscount}
              onChange={set('dealerDiscount')}
              invalid={bad === 'dealerDiscount'}
            />
            <Field
              label="Manufacturer rebate"
              prefix="$"
              value={form.rebate}
              onChange={set('rebate')}
              invalid={bad === 'rebate'}
            />
            {needs.weight && (
              <Field
                label="Vehicle weight"
                suffix="lb"
                value={form.weightLb}
                onChange={set('weightLb')}
              />
            )}
            {needs.msrp && (
              <Field label="MSRP" prefix="$" value={form.msrp} onChange={set('msrp')} />
            )}
            {needs.age && form.condition === 'used' && (
              <Field
                label="Vehicle age"
                suffix="years"
                value={form.ageYears}
                onChange={set('ageYears')}
              />
            )}
            {needs.ev && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.isEv}
                  onChange={(e) => set('isEv')(e.target.checked)}
                />
                Electric vehicle
              </label>
            )}
          </fieldset>

          <fieldset>
            <legend>Trade-in and cash</legend>
            <Field
              label="Trade-in value"
              prefix="$"
              value={form.tradeInValue}
              onChange={set('tradeInValue')}
              invalid={bad === 'tradeInValue'}
            />
            <Field
              label="Still owed on trade-in"
              prefix="$"
              value={form.tradeInPayoff}
              onChange={set('tradeInPayoff')}
              invalid={bad === 'tradeInPayoff'}
            />
            <Field
              label="Cash down"
              prefix="$"
              value={form.cashDown}
              onChange={set('cashDown')}
              invalid={bad === 'cashDown'}
            />
          </fieldset>

          <fieldset>
            <legend>Dealer charges</legend>
            <Field
              label="Doc fee"
              prefix="$"
              value={form.docFee}
              onChange={set('docFee')}
              defaultValue={defaults.docFee}
              invalid={bad === 'docFee'}
              hint={
                record.docFee.cap?.value != null
                  ? `${record.name} caps this at $${record.docFee.cap.value}.`
                  : record.docFee.cap === null
                    ? `${record.name}’s doc fee cap is not sourced yet. Enter the dealer’s figure.`
                    : `${record.name} does not cap doc fees.`
              }
            />
            {form.addOns.map((a, i) => (
              <div className="addon" key={i}>
                <input
                  aria-label={`Add-on ${i + 1} name`}
                  placeholder="Add-on (tint, mats…)"
                  value={a.name}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      addOns: f.addOns.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    }))
                  }
                />
                <div className={`input-wrap${bad === 'addOns' ? ' invalid' : ''}`}>
                  <span className="affix">$</span>
                  <input
                    aria-label={`Add-on ${i + 1} price`}
                    inputMode="decimal"
                    value={a.amount}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        addOns: f.addOns.map((x, j) =>
                          j === i ? { ...x, amount: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                </div>
                <button
                  type="button"
                  className="link"
                  aria-label={`Remove add-on ${i + 1}`}
                  onClick={() =>
                    setForm((f) => ({ ...f, addOns: f.addOns.filter((_, j) => j !== i) }))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            {form.addOns.length < 10 && (
              <button
                type="button"
                className="link add"
                onClick={() =>
                  setForm((f) => ({ ...f, addOns: [...f.addOns, { name: '', amount: '' }] }))
                }
              >
                + Add a dealer add-on
              </button>
            )}
            <Field
              label="Service contract"
              prefix="$"
              value={form.serviceContract}
              onChange={set('serviceContract')}
              invalid={bad === 'serviceContract'}
            />
            <Field
              label="GAP"
              prefix="$"
              value={form.gap}
              onChange={set('gap')}
              invalid={bad === 'gap'}
            />
          </fieldset>

          <fieldset>
            <legend>Tax and loan</legend>
            <Field
              label="Sales tax rate"
              suffix="%"
              value={form.taxRate}
              onChange={set('taxRate')}
              defaultValue={taxDefault}
              invalid={bad === 'taxRate'}
              hint={
                record.vehicleTax.type?.value === 'none' ? (
                  `${record.name} has no vehicle sales tax.`
                ) : (
                  <>
                    Enter your state + city + county rate.
                    {stateRate && (
                      <>
                        {' '}
                        {record.name}’s base rate is {percent(stateRate.value)}.
                      </>
                    )}
                  </>
                )
              }
            />
            <Field
              label="Interest rate (APR)"
              suffix="%"
              value={form.apr}
              onChange={set('apr')}
              invalid={bad === 'apr'}
              hint="Treated as the loan’s interest rate. A lender’s legal APR can be higher once its fees are counted."
            />
            <div className="field">
              <label htmlFor="term">Loan term</label>
              <select
                id="term"
                value={form.termMonths}
                onChange={(e) => set('termMonths')(Number(e.target.value))}
              >
                {TERM_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t} months
                  </option>
                ))}
              </select>
            </div>
            <Field
              label="Lender fee"
              prefix="$"
              value={form.lenderFee}
              onChange={set('lenderFee')}
              invalid={bad === 'lenderFee'}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={form.payUpfront}
                onChange={(e) => set('payUpfront')(e.target.checked)}
              />
              Pay taxes and fees upfront instead of financing them
            </label>
          </fieldset>
        </form>

        {result && parsed.ok ? (
          <Results record={record} input={parsed.input} result={result} />
        ) : (
          <p className="error" role="alert">
            Check the highlighted field. Use numbers only.
          </p>
        )}
      </main>
      <footer>
        <p>
          Estimate only, not an offer or commitment to lend. Taxes and fees come from state sources
          checked on the dates shown in each source link; local rates vary. Annual ownership taxes
          (personal property or ad valorem) are billed separately and are not in the total. Confirm
          with the dealer and your state DMV.
        </p>
      </footer>
    </>
  )
}

export default App
