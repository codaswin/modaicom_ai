import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Popup } from './Popup'

const query = vi.fn()
const tabsSendMessage = vi.fn()
const sendMessage = vi.fn()

describe('Popup', () => {
  beforeEach(() => {
    query.mockReset()
    tabsSendMessage.mockReset()
    sendMessage.mockReset()
    vi.stubGlobal('chrome', {
      tabs: { query, sendMessage: tabsSendMessage },
      runtime: { sendMessage, id: 'modaicom-test' },
    })
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

  it('shows a read-only primary post context preview', async () => {
    query.mockResolvedValue([{ id: 1, url: 'https://www.linkedin.com/posts/example-activity-123' }])
    tabsSendMessage.mockResolvedValue({
      kind: 'success',
      context: {
        authorDisplayName: 'Ada Lovelace',
        originalAuthoredText: 'A useful post.',
      },
    })

    render(<Popup />)

    await screen.findByText('LinkedIn detected ✓')
    expect(await screen.findByText('A useful post.')).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(tabsSendMessage).toHaveBeenCalledWith(1, { version: 1, type: 'REQUEST_PAGE_EXTRACTION' })
  })

  it('tells the user to expand collapsed text and retries fresh extraction', async () => {
    const user = userEvent.setup()
    query.mockResolvedValue([{ id: 1, url: 'https://www.linkedin.com/posts/example-activity-123' }])
    tabsSendMessage
      .mockResolvedValueOnce({ kind: 'collapsed-post' })
      .mockResolvedValueOnce({
        kind: 'success',
        context: {
          authorDisplayName: 'Ada Lovelace',
          originalAuthoredText: 'Expanded post.',
        },
      })

    render(<Popup />)
    await screen.findByText(/This post is collapsed/)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Expanded post.')
    expect(tabsSendMessage).toHaveBeenCalledTimes(2)
  })

  it('shows a neutral feed state without popup-driven selection', async () => {
    query.mockResolvedValue([{ id: 1, url: 'https://www.linkedin.com/feed/' }])
    sendMessage.mockResolvedValue(null)

    render(<Popup />)

    await screen.findByText('Select a LinkedIn post to continue.')
    expect(screen.queryByRole('button', { name: 'Start selection' })).not.toBeInTheDocument()
  })

  it('shows a relayed inline extraction result', async () => {
    query.mockResolvedValue([{ id: 1, url: 'https://www.linkedin.com/feed/' }])
    sendMessage.mockResolvedValue({
      kind: 'success',
      context: { authorDisplayName: 'Ada Lovelace', originalAuthoredText: 'Relayed post.' },
    })

    render(<Popup />)

    expect(await screen.findByText('Relayed post.')).toBeInTheDocument()
    expect(sendMessage).toHaveBeenCalledWith({ version: 1, type: 'GET_LATEST_RELAY' })
  })

})
