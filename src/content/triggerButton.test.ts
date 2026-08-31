import { describe, expect, it, vi } from 'vitest'

import { createInlineTrigger } from './triggerButton'

function build(kind: 'post-comment' | 'comment-reply' = 'post-comment', onActivate = vi.fn()) {
  const handle = createInlineTrigger(kind, 'post-comment:key-1', onActivate)
  const root = handle.host.shadowRoot as ShadowRoot
  const button = root.querySelector('button') as HTMLButtonElement
  return { handle, root, button, onActivate }
}

describe('createInlineTrigger', () => {
  it('renders the button inside an isolated shadow root, not the light DOM', () => {
    const { handle, root, button } = build()
    expect(root).toBeTruthy()
    expect(handle.host.querySelector('button')).toBeNull()
    expect(button).toBeTruthy()
    expect(button.type).toBe('button')
  })

  it('shows the mark glyph, not a "modaicom" text label, as the button face', () => {
    const { root } = build()
    const mark = root.querySelector('.mark') as HTMLElement
    expect(mark.textContent).toBe('m')
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    // the only place the full word appears is the aria-hidden tooltip
    const visibleFace = [...root.querySelectorAll('.trigger > *:not(.tooltip)')]
      .map((el) => el.textContent)
      .join('')
    expect(visibleFace).toBe('m')
  })

  it('labels the accessible name by interaction kind and carries a hidden visual tooltip', () => {
    expect(build('post-comment').button.getAttribute('aria-label')).toBe('Generate a comment with modaicom')
    expect(build('comment-reply').button.getAttribute('aria-label')).toBe('Generate a reply with modaicom')
    const tooltip = build().root.querySelector('.tooltip') as HTMLElement
    expect(tooltip.textContent).toBe('Generate with modaicom')
    expect(tooltip.getAttribute('aria-hidden')).toBe('true')
  })

  it('has no title attribute (the custom tooltip would clash with the native one)', () => {
    expect(build().button.hasAttribute('title')).toBe(false)
  })

  it('toggles the busy state: disabled, aria-busy, spinner class, and the busy getter', () => {
    const { handle, button } = build()
    expect(handle.busy).toBe(false)
    expect(button.getAttribute('aria-busy')).toBe('false')

    handle.setBusy(true)
    expect(handle.busy).toBe(true)
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.classList.contains('is-busy')).toBe(true)

    handle.setBusy(false)
    expect(handle.busy).toBe(false)
    expect(button.disabled).toBe(false)
    expect(button.classList.contains('is-busy')).toBe(false)
  })

  it('applies the bundled stylesheet inside the shadow root', () => {
    const { root } = build()
    const adopted = root.adoptedStyleSheets ?? []
    const fromStyleEl = [...root.querySelectorAll('style')].map((s) => s.textContent ?? '').join('')
    const css = adopted.map((sheet) => [...sheet.cssRules].map((r) => r.cssText).join('')).join('') + fromStyleEl
    expect(css).toContain('.trigger')
    expect(css).toContain('#5b3fd6')
  })

  it('invokes the activate callback on click', () => {
    const { button, onActivate } = build('post-comment')
    button.dispatchEvent(new Event('click'))
    expect(onActivate).toHaveBeenCalledOnce()
  })

  it('carries the reconcile bookkeeping attributes on the light-DOM host', () => {
    const { handle } = build()
    expect(handle.host.matches('[data-modaicom-inline-wrapper]')).toBe(true)
    expect(handle.host.dataset.modaicomOwner).toBe('post-comment:key-1')
  })
})
