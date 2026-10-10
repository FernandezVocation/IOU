// @vitest-environment jsdom
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CurrencySelect } from './CurrencySelect'

describe('CurrencySelect', () => {
  it('picks from the list', () => {
    const on = vi.fn()
    render(<CurrencySelect ariaLabel="Cur" value="CAD" choices={['CAD', 'EUR']} onChange={on} />)
    fireEvent.change(screen.getByLabelText('Cur'), { target: { value: 'EUR' } })
    expect(on).toHaveBeenCalledWith('EUR')
  })
  it('accepts any three-letter code through Other…', () => {
    const on = vi.fn()
    render(<CurrencySelect ariaLabel="Cur" value="CAD" choices={['CAD']} onChange={on} />)
    fireEvent.change(screen.getByLabelText('Cur'), { target: { value: '__other' } })
    const box = screen.getByLabelText('Cur – currency code')
    fireEvent.change(box, { target: { value: 'pl' } }); expect(on).not.toHaveBeenCalled()
    fireEvent.change(box, { target: { value: 'pln' } }); expect(on).toHaveBeenCalledWith('PLN')
  })
})
afterEach(cleanup)
