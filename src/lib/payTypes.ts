export interface PayTypeDef { name: string; subs: string[] }

/** Suggested ways to pay. Anything else a person types is a custom type or subtype, and is offered to the whole group afterwards. */
export const PAY_TYPES: PayTypeDef[] = [
  { name: 'Cash', subs: [] },
  { name: 'Credit card', subs: ['Visa', 'Mastercard', 'Amex'] },
  { name: 'Debit card', subs: ['Debit', 'Visa Debit', 'Mastercard Debit', 'Interac'] },
  { name: 'Bank transfer', subs: ['E-transfer', 'Wire'] },
]

export const payDef = (name: string): PayTypeDef | undefined => PAY_TYPES.find(t => t.name === name)

export const NO_PAY_TYPE = 'Not specified'
export const NO_PAY_SUBTYPE = 'No subtype'

/** "Credit card › Visa", "Cash", or "" when none was given. */
export const payLabel = (e: { pay_type?: string; pay_subtype?: string }): string =>
  e.pay_type ? (e.pay_subtype ? `${e.pay_type} › ${e.pay_subtype}` : e.pay_type) : ''
