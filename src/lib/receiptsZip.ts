import type { GroupData } from './types'
import { currencyDigits } from './money'
import { receiptFileName, safeName, uniqueName } from './receiptNames'
import { slug } from './format'
import { catLabel } from './categories'

const csvCell = (v: unknown): string => {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export interface ReceiptsZip { blob: Blob; filename: string; count: number; failed: string[] }

/**
 * Bundle every receipt into one ZIP: files named "date - vendor - amount", plus an index.csv
 * that lists each file with its transaction details. `fetchBlob` is injected so this is testable.
 */
export async function buildReceiptsZip(
  data: GroupData,
  fetchBlob: (path: string) => Promise<Blob>,
  onProgress?: (done: number, total: number) => void,
): Promise<ReceiptsZip> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const root = safeName(data.group.name, 50) + ' - receipts'
  const folder = zip.folder(root)!
  const used = new Set<string>(['index.csv'])
  const name = (id: string) => data.travelers.find(t => t.id === id)?.name ?? ''
  const exps = [...data.expenses].sort((a, b) => a.spent_on.localeCompare(b.spent_on) || (a.spent_at ?? '').localeCompare(b.spent_at ?? ''))
  const jobs = exps.flatMap(e => e.receipts.map((r, i) => ({ e, r, file: uniqueName(receiptFileName(e, r, i, e.receipts.length), used) })))

  const rows: string[][] = [['File', 'Date', 'Time', 'Vendor', 'Category', 'Location', 'Amount', 'Currency', `Settled (${data.group.currency})`, 'Paid by', 'Notes']]
  const failed: string[] = []
  let done = 0, ok = 0
  const queue = [...jobs]
  const worker = async () => {
    for (let j = queue.shift(); j; j = queue.shift()) {
      try {
        folder.file(j.file, await fetchBlob(j.r.path))
        ok++
        rows.push([j.file, j.e.spent_on, (j.e.spent_at ?? '').slice(0, 5), j.e.vendor, j.e.category ? catLabel(j.e) : '', j.e.location, j.e.amount.toFixed(currencyDigits(j.e.currency)), j.e.currency, j.e.settled_amount == null ? '' : String(j.e.settled_amount), name(j.e.payer_id), j.e.notes])
      } catch { failed.push(j.file) }
      onProgress?.(++done, jobs.length)
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  rows.sort((a, b) => (a[0] === 'File' ? -1 : b[0] === 'File' ? 1 : a[0].localeCompare(b[0])))
  folder.file('index.csv', '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n'))
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } })
  return { blob, filename: `${slug(data.group.name)}-receipts.zip`, count: ok, failed }
}
