import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Popup } from './Popup'

const query = vi.fn()
const tabsSendMessage = vi.fn()
const sendMessage = vi.fn()
const connect = vi.fn()
const openOptionsPage = vi.fn()

type FakePort = {
  postMessage: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  onMessage: { addListener: (fn: (m: unknown) => void) => void }
  onDisconnect: { addListener: (fn: () => void) => void }
  emit: (message: unknown) => void
}

function makeFakePort(): FakePort {
  const listeners: Array<(m: unknown) => void> = []
  return {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: (fn) => listeners.push(fn) },
    onDisconnect: { addListener: () => undefined },
    emit: (message) => listeners.forEach((fn) => fn(message)),
  }
}

const READY_STATUS = { configured: true, providerId: 'openai', model: 'gpt-4o-mini', consented: true }
const POST_RESULT = {
  kind: 'success' as const,
  context: { kind: 'post-comment' as const, post: { authorDisplayName: 'Ada', originalAuthoredText: 'A useful post.' } },
}

describe('Popup', () => {
  beforeEach(() => {
    query.mockReset()
    tabsSendMessage.mockReset()
    sendMessage.mockReset()
    connect.mockReset()
    openOptionsPage.mockReset()
    vi.stubGlobal('chrome', {
      tabs: { query, sendMessage: tabsSendMessage },
      runtime: { sendMessage, connect, openOptionsPage, id: 'modaicom-test' },
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
      context: { kind: 'post-comment', post: { authorDisplayName: 'Ada Lovelace', originalAuthoredText: 'A useful post.' } },
    })

    render(<Popup />)

    await screen.findByText('LinkedIn detected ✓')
    expect(await screen.findByText('A useful post.')).toBeInTheDocument()
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(tabsSendMessage).toHaveBeenCalledWith(1, { version: 2, type: 'REQUEST_PAGE_EXTRACTION' })
  })

  it('tells the user to expand collapsed text and retries fresh extraction', async () => {
    const user = userEvent.setup()
    query.mockResolvedValue([{ id: 1, url: 'https://www.linkedin.com/posts/example-activity-123' }])
    tabsSendMessage
      .mockResolvedValueOnce({ kind: 'collapsed-post' })
      .mockResolvedValueOnce({
        kind: 'success',
        context: { kind: 'post-comment', post: { authorDisplayName: 'Ada Lovelace', originalAuthoredText: 'Expanded post.' } },
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
      context: { kind: 'post-comment', post: { authorDisplayName: 'Ada Lovelace', originalAuthoredText: 'Relayed post.' } },
    })

    render(<Popup />)

    expect(await screen.findByText('Relayed post.')).toBeInTheDocument()
    expect(sendMessage).toHaveBeenCalledWith({ version: 2, type: 'GET_LATEST_RELAY' })
  })

  it('shows a relayed comment-reply interaction with the thread disclosure and post context', async () => {
    query.mockResolvedValue([{ id: 1, url: 'https://www.linkedin.com/feed/update/urn:li:activity:1/' }])
    sendMessage.mockResolvedValue({
      kind: 'success',
      context: {
        kind: 'comment-reply',
        post: { authorDisplayName: 'Ada Lovelace', originalAuthoredText: 'Post text.' },
        targetComment: { authorDisplayName: 'Grace Hopper', authoredText: 'A thoughtful comment.' },
      },
    })

    render(<Popup />)

    expect(await screen.findByText(/Replying in Grace Hopper.s thread/)).toBeInTheDocument()
    expect(screen.getByText('A thoughtful comment.')).toBeInTheDocument()
    expect(screen.getByText('On this post')).toBeInTheDocument()
    expect(screen.getByText('Post text.')).toBeInTheDocument()
  })

  it('shows actionable copy and Retry for a comment-half failure', async () => {
    query.mockResolvedValue([{ id: 1, url: 'https://www.linkedin.com/feed/update/urn:li:activity:1/' }])
    sendMessage.mockResolvedValue({ kind: 'comment-collapsed' })

    render(<Popup />)

    expect(await screen.findByText(/This comment is collapsed/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('offers "Open settings" instead of Generate when the provider is not configured', async () => {
    query.mockResolvedValue([{ id: 1, url: 'https://www.linkedin.com/posts/example' }])
    sendMessage.mockImplementation(async (msg: { type: string }) =>
      msg.type === 'GET_PROVIDER_STATUS' ? { configured: false, consented: false } : null,
    )
    tabsSendMessage.mockResolvedValue(POST_RESULT)

    render(<Popup />)

    await screen.findByText('A useful post.')
    expect(screen.queryByRole('button', { name: 'Generate reply' })).not.toBeInTheDocument()
    const settings = screen.getByRole('button', { name: 'Open settings' })
    const user = userEvent.setup()
    await user.click(settings)
    expect(openOptionsPage).toHaveBeenCalled()
  })

  it('generates a draft over the Port and never sends author names', async () => {
    const user = userEvent.setup()
    query.mockResolvedValue([{ id: 1, url: 'https://www.linkedin.com/posts/example' }])
    sendMessage.mockImplementation(async (msg: { type: string }) =>
      msg.type === 'GET_PROVIDER_STATUS' ? READY_STATUS : null,
    )
    tabsSendMessage.mockResolvedValue({
      kind: 'success',
      context: {
        kind: 'comment-reply',
        post: { authorDisplayName: 'Ada Lovelace', originalAuthoredText: 'The post body.' },
        targetComment: { authorDisplayName: 'Grace Hopper', authoredText: 'The comment body.' },
      },
    })
    const port = makeFakePort()
    connect.mockReturnValue(port)

    render(<Popup />)
    await screen.findByText('The comment body.')
    await user.click(screen.getByRole('button', { name: 'Generate reply' }))

    expect(connect).toHaveBeenCalledWith({ name: 'modaicom.generation' })
    const sent = port.postMessage.mock.calls[0]![0] as { type: string; request: unknown }
    expect(sent.type).toBe('REQUEST_GENERATION')
    expect(sent.request).toEqual({ interactionKind: 'comment-reply', postText: 'The post body.', commentText: 'The comment body.' })
    expect(JSON.stringify(sent)).not.toContain('Ada Lovelace')
    expect(JSON.stringify(sent)).not.toContain('Grace Hopper')

    expect(screen.getByText('Drafting…')).toBeInTheDocument()
    port.emit({ v: 1, type: 'GENERATION_RESULT', ok: true, text: 'Here is a drafted reply.' })
    expect(await screen.findByDisplayValue('Here is a drafted reply.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument()
  })

  it('renders a fixed error + Retry for a retryable generation failure', async () => {
    const user = userEvent.setup()
    query.mockResolvedValue([{ id: 1, url: 'https://www.linkedin.com/posts/example' }])
    sendMessage.mockImplementation(async (msg: { type: string }) =>
      msg.type === 'GET_PROVIDER_STATUS' ? READY_STATUS : null,
    )
    tabsSendMessage.mockResolvedValue(POST_RESULT)
    const port = makeFakePort()
    connect.mockReturnValue(port)

    render(<Popup />)
    await screen.findByText('A useful post.')
    await user.click(screen.getByRole('button', { name: 'Generate reply' }))
    port.emit({ v: 1, type: 'GENERATION_RESULT', ok: false, error: { kind: 'rate-limited' } })

    expect(await screen.findByText(/rate-limiting requests/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
