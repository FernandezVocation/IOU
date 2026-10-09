import type { Expense, Receipt } from './types'
import { currencyDigits } from './money'

/** Make a string safe as a file name on Windows, macOS, Android and iOS. */
export function safeName(s: string, max = 60): string {
  const cleaned = s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '')
  return (cleaned.length > max ? cleaned.slice(0, max).trim() : cleaned) || 'Expense'
}

function extFor(r: Receipt): string {
  if (r.mime === 'application/pdf') return 'pdf'
  if (r.mime === 'image/png') return 'png'
  if (r.mime === 'image/webp') return 'webp'
  if (r.mime === 'image/gif') return 'gif'
  const m = /\.([a-z0-9]{2,4})$/i.exec(r.path)
  return m ? m[1].toLowerCase() : 'jpg'
}

/**
 * "2026-09-12 - Time Out Market dinner - EUR 64.50.jpg"
 * Starts with the date so a folder of receipts sorts in trip order, and says what it was for.
 */
export function receiptFileName(e: Expense, r: Receipt, index: number, total: number): string {
  const amt = e.amount.toFixed(currencyDigits(e.currency))
  const suffix = total > 1 ? ` (${index + 1} of ${total})` : ''
  return `${e.spent_on} - ${safeName(e.vendor || 'Expense')} - ${e.currency} ${amt}${suffix}.${extFor(r)}`
}

/** Give every file a unique name (two identical coffees on one day get " (2)"). */
export function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name.toLowerCase())) { used.add(name.toLowerCase()); return name }
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let n = 2; ; n++) {
    const cand = `${stem} (${n})${ext}`
    if (!used.has(cand.toLowerCase())) { used.add(cand.toLowerCase()); return cand }
  }
}
