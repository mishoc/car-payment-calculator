import { roundToCents } from '../engine/money'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function money(amount: number): string {
  return usd.format(roundToCents(amount))
}

/** 0.0625 → "6.25%" */
export function percent(rate: number): string {
  return `${Number((rate * 100).toFixed(4))}%`
}

/** Parses user-typed money or percent text: "30,000" → 30000; blank → 0; junk → NaN. */
export function parseNumber(text: string): number {
  const cleaned = text.replace(/[$,%\s]/g, '')
  if (cleaned === '') return 0
  return /^\d*\.?\d*$/.test(cleaned) ? Number(cleaned) : Number.NaN
}
