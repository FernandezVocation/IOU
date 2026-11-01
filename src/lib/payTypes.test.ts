import { describe, expect, it } from 'vitest'
import { PAY_TYPES, payDef, payLabel } from './payTypes'

describe('payment types', () => {
  it('offers Cash, Credit card, Debit card and Bank transfer, and no digital wallet', () => {
    expect(PAY_TYPES.map(t => t.name)).toEqual(['Cash', 'Credit card', 'Debit card', 'Bank transfer'])
    expect(payDef('Debit card')?.subs).toEqual(['Debit', 'Visa Debit', 'Mastercard Debit', 'Interac'])
    expect(payDef('Credit card')?.subs).toEqual(['Visa', 'Mastercard', 'Amex'])
    expect(payDef('Bank transfer')?.subs).toEqual(['E-transfer', 'Wire'])
    expect(payDef('Cash')?.subs).toEqual([])
  })
  it('labels a type with its subtype, or nothing', () => {
    expect(payLabel({ pay_type: 'Credit card', pay_subtype: 'Visa' })).toBe('Credit card › Visa')
    expect(payLabel({ pay_type: 'Cash' })).toBe('Cash')
    expect(payLabel({})).toBe('')
  })
})
