import { describe, expect, it } from 'vitest'
import { COMMON_CURRENCIES } from './format'
import { currencyDigits, fmtMoney, isValidCurrency, toMinor } from './money'
import { currencyName } from '../components/currencyOption'

describe('the currency list', () => {
  it('covers 150 or more currencies, each listed once and each one the browser accepts', () => {
    expect(COMMON_CURRENCIES.length).toBeGreaterThanOrEqual(150)
    expect(new Set(COMMON_CURRENCIES).size).toBe(COMMON_CURRENCIES.length)
    for (const c of COMMON_CURRENCIES) expect(isValidCurrency(c), c).toBe(true)
  })
  it('puts the most used currencies first and includes the ones people travel with', () => {
    expect(COMMON_CURRENCIES.slice(0, 3)).toEqual(['CAD', 'USD', 'EUR'])
    for (const c of ['QAR', 'SAR', 'KWD', 'BHD', 'OMR', 'EGP', 'MAD', 'HKD', 'SGD', 'PLN', 'CZK', 'HUF', 'ISK', 'COP', 'PEN', 'ARS', 'CLP', 'VND', 'IDR', 'PHP', 'LKR', 'NGN', 'KES']) expect(COMMON_CURRENCIES, c).toContain(c)
  })
  it('handles currencies with no minor unit, and with three', () => {
    expect(currencyDigits('JPY')).toBe(0); expect(toMinor(1500, 'JPY')).toBe(1500)
    expect(currencyDigits('KWD')).toBe(3); expect(toMinor(12.345, 'KWD')).toBe(12345)
    expect(fmtMoney(12345, 'KWD')).toContain('12.345')
  })
  it('names a currency in full where the browser can', () => {
    expect(currencyName('QAR')).toMatch(/riyal/i)
    expect(currencyName('CAD')).toMatch(/canadian dollar/i)
  })
})
