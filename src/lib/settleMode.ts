export type SettleMode = 'itemized' | 'fewest'
const KEY = 'iou.settleMode'
/** The last choice of Itemized / Fewest payments, shared by the Balances tab and the exports. */
export function getSettleMode(): SettleMode { try { return localStorage.getItem(KEY) === 'fewest' ? 'fewest' : 'itemized' } catch { return 'itemized' } }
export function setSettleMode(m: SettleMode) { try { localStorage.setItem(KEY, m) } catch { /* optional */ } }
