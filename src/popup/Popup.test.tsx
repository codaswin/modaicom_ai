import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Popup } from './Popup'

const query = vi.fn()

describe('Popup', () => {
  beforeEach(() => {
    query.mockReset()
    vi.stubGlobal('chrome', { tabs: { query } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows loading while checking the current page', () => {
    query.mockReturnValue(new Promise(() => undefined))

    render(<Popup />)

    expect(screen.getByRole('heading', { name: 'modaicom' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Checking current page…')
  })

  it('shows success on a Supported LinkedIn Page', async () => {
    query.mockResolvedValue([{ url: 'https://www.linkedin.com/feed/' }])

    render(<Popup />)

    await screen.findByText('LinkedIn detected ✓')
    expect(screen.getByRole('status')).toHaveTextContent('LinkedIn detected ✓')
  })

  it('asks the user to open LinkedIn on another page', async () => {
    query.mockResolvedValue([{ url: 'https://example.com' }])

    render(<Popup />)

    await screen.findByText('Open LinkedIn to use modaicom.')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('recovers from a detection error when the user retries', async () => {
    const user = userEvent.setup()
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ url: 'https://linkedin.com/in/modaicom' }])

    render(<Popup />)

    await screen.findByText('Unable to detect the current page. Try again.')
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await screen.findByText('LinkedIn detected ✓')
  })
})
