// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import GroupLookPicker from './GroupLookPicker'
import GroupIcon from './GroupIcon'
import { COLORS } from '../lib/groupLook'

afterEach(cleanup)

describe('icon and colour picker', () => {
  it('shows the type default until something is picked', () => {
    render(<GroupLookPicker kind="Household" onChange={() => {}} />)
    expect(screen.getByLabelText('Home').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/Default for this type/)).toBeTruthy()
  })
  it('offers every icon and 30 colours', () => {
    render(<GroupLookPicker kind="Trip" onChange={() => {}} />)
    expect(screen.getAllByRole('radio').length).toBeGreaterThanOrEqual(80)
    expect(screen.getAllByLabelText(/^Colour \d+$/).length).toBe(30)
  })
  it('picking an icon keeps the current colour, and picking a colour keeps the icon', () => {
    const onChange = vi.fn()
    render(<GroupLookPicker kind="Trip" icon="camera" color={COLORS[3]} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Games'))
    expect(onChange).toHaveBeenLastCalledWith({ icon: 'gamepad', color: COLORS[3] })
    fireEvent.click(screen.getByLabelText('Colour 12'))
    expect(onChange).toHaveBeenLastCalledWith({ icon: 'camera', color: COLORS[11] })
  })
  it('cannot be changed when disabled', () => {
    const onChange = vi.fn()
    render(<GroupLookPicker kind="Trip" onChange={onChange} disabled />)
    fireEvent.click(screen.getByLabelText('Games'))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('group icon tile', () => {
  it('is decorative and uses the group colour', () => {
    const { container } = render(<GroupIcon group={{ kind: 'Trip', color: '#1B3082', icon: 'plane' }} size={40} />)
    const el = container.querySelector('.gicon') as HTMLElement
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(el.style.background).toBe('rgb(27, 48, 130)')
  })
})
