// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import PayTypePicker from './PayTypePicker'

let value = { t: '', s: '' }
function Host({ history = [] as Array<{ pay_type?: string; pay_subtype?: string }>, start = { t: '', s: '' } }) {
  const [v, set] = useState(start)
  value = v
  return <PayTypePicker payType={v.t} paySubtype={v.s} history={history} onChange={(t, s) => set({ t, s })} />
}
const btn = (n: string) => screen.getByRole('button', { name: n })
afterEach(cleanup)

describe('paid with picker', () => {
  it('shows subtypes only after a type is chosen, and tapping again clears it', () => {
    render(<Host />)
    expect(screen.queryByText(/Subtype/)).toBeNull()
    fireEvent.click(btn('Credit card'))
    expect(value).toEqual({ t: 'Credit card', s: '' })
    fireEvent.click(btn('Visa')); expect(value.s).toBe('Visa')
    fireEvent.click(btn('Visa')); expect(value.s).toBe('')
    fireEvent.click(btn('Credit card')); expect(value).toEqual({ t: '', s: '' })
    expect(screen.queryByText(/Subtype/)).toBeNull()
  })
  it('Debit card has a plain Debit option as well as the card networks', () => {
    render(<Host />)
    fireEvent.click(btn('Debit card'))
    for (const s of ['Debit', 'Visa Debit', 'Mastercard Debit', 'Interac']) expect(btn(s)).toBeTruthy()
  })
  it('Cash has no subtypes to pick from, but a custom one can be typed', () => {
    render(<Host />)
    fireEvent.click(btn('Cash'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Custom…' })[1])
    fireEvent.change(screen.getByLabelText('Custom subtype'), { target: { value: 'Euros' } })
    expect(value).toEqual({ t: 'Cash', s: 'Euros' })
  })
  it('takes a custom type, then a subtype under it', () => {
    render(<Host />)
    fireEvent.click(btn('Custom…'))
    fireEvent.change(screen.getByLabelText(/Custom payment type/), { target: { value: 'Gift card' } })
    expect(value).toEqual({ t: 'Gift card', s: '' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Custom…' })[1])
    fireEvent.change(screen.getByLabelText('Custom subtype'), { target: { value: 'Starbucks' } })
    expect(value).toEqual({ t: 'Gift card', s: 'Starbucks' })
  })
  it('offers back a type and subtype anyone in the group typed before', () => {
    render(<Host history={[{ pay_type: 'Gift card', pay_subtype: 'Starbucks' }, { pay_type: 'Credit card', pay_subtype: 'Discover' }]} />)
    fireEvent.click(btn('Gift card'))
    expect(value).toEqual({ t: 'Gift card', s: '' })
    expect(btn('Starbucks')).toBeTruthy()
    fireEvent.click(btn('Gift card'))
    fireEvent.click(btn('Credit card'))
    expect(btn('Discover')).toBeTruthy()
  })
  it('clearing the custom type text also clears the subtype so it never stands alone', () => {
    render(<Host start={{ t: 'Points', s: 'Aeroplan' }} />)
    fireEvent.change(screen.getByLabelText(/Custom payment type/), { target: { value: '' } })
    expect(value).toEqual({ t: '', s: '' })
  })
})
