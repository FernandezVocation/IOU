const names = (() => { try { return new Intl.DisplayNames(['en'], { type: 'currency' }) } catch { return null } })()

/** The full currency name (for example "Qatari Riyal"), or an empty string where the browser can't supply it. */
export function currencyName(code: string): string {
  try { return names?.of(code) ?? '' } catch { return '' }
}

/** One <option> for a currency code: the code is the value, and the list shows "QAR – Qatari Riyal". */
export function currencyOption(code: string) {
  const n = currencyName(code)
  return <option key={code} value={code} label={n && n !== code ? `${code} – ${n}` : code}>{code}</option>
}
