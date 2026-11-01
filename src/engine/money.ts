/**
 * Round a dollar amount to cents, half away from zero. For display only: the engine keeps
 * full precision through every calculation (see CLAUDE.md, "Math rules").
 *
 * Multiplying by 100 can land just below .5 (1.005 * 100 = 100.49999999999999), so the
 * product is first normalized to 15 significant digits.
 */
export function roundToCents(amount: number): number {
  const cents = Math.round(Number((Math.abs(amount) * 100).toPrecision(15)))
  const rounded = (Math.sign(amount) * cents) / 100
  return rounded === 0 ? 0 : rounded
}
