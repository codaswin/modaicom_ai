import { afterEach, describe, expect, it, vi } from 'vitest'

import { composerIsEligible, handleInsertDraftRequest, handlePagePopupExtractionRequest, isSupportedRoute, markRuntimeInvalidated, observationScopes, postCandidates, reconcile, teardownInlineTriggerContentScript, initializeInlineTriggerContentScript } from './inlineTrigger'

describe('inline trigger content boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    teardownInlineTriggerContentScript()
    Reflect.deleteProperty(document, 'execCommand')
    document.body.innerHTML = ''
  })

  it('fails closed on an unrecognized feed markup regime', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const main = document.createElement('main')
    // A comment composer with no recognized feed container around it.
    const root = document.createElement('div')
    root.setAttribute('data-testid', 'comment-box')
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    editor.setAttribute('aria-label', 'Add a comment')
    root.append(editor)
    main.append(root)
    document.body.append(main)

    expect(postCandidates(document, 'https://www.linkedin.com/feed/')).toEqual([])
    reconcile('https://www.linkedin.com/feed/')
    expect(document.querySelectorAll('[data-modaicom-inline-wrapper]').length).toBe(0)
    expect(warn).toHaveBeenCalled()
    main.remove()
  })

  it('runs the page extractor only for a valid extraction request envelope', () => {
    document.body.innerHTML = '<main><div data-testid="mainFeed" role="list"></div></main>'
    expect(handlePagePopupExtractionRequest({ version: 2, type: 'REQUEST_PAGE_EXTRACTION' })).toEqual({
      kind: 'unsupported-surface',
    })
    expect(handlePagePopupExtractionRequest({ version: 2, type: 'GET_LATEST_RELAY' })).toBeUndefined()
    expect(handlePagePopupExtractionRequest(null)).toBeUndefined()
  })

  it('the safety re-scan picks up a composer the observer missed', () => {
    vi.useFakeTimers()
    vi.stubGlobal('location', { href: 'https://www.linkedin.com/feed/' })
    try {
      document.body.innerHTML = `
        <main><div data-testid="mainFeed" role="list">
          <div componentkey="k_MAIN_FEED"><div role="listitem" id="p">
            <img alt="View Ada author's profile" />
            <div data-testid="expandable-text-box">Post.</div>
          </div></div>
        </div></main>`
      teardownInlineTriggerContentScript()
      initializeInlineTriggerContentScript()
      expect(document.querySelectorAll('[data-modaicom-inline-wrapper]').length).toBe(0)

      // a comment composer mounts without triggering the observer callback
      const holder = document.createElement('div')
      holder.innerHTML = '<div contenteditable="true" role="textbox" aria-label="Text editor for creating comment" class="tiptap"></div>'
      document.getElementById('p')!.append(holder)

      vi.advanceTimersByTime(1600)
      expect(document.querySelectorAll('[data-modaicom-inline-wrapper]').length).toBe(1)
    } finally {
      teardownInlineTriggerContentScript()
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('supports only the feed and recognized individual-post routes', () => {
    expect(isSupportedRoute('https://www.linkedin.com/feed/')).toBe(true)
    expect(isSupportedRoute('https://linkedin.com/posts/example')).toBe(true)
    expect(isSupportedRoute('https://linkedin.com/feed/update/urn:li:activity:1')).toBe(true)
    expect(isSupportedRoute('https://linkedin.com/in/example')).toBe(false)
    expect(isSupportedRoute('https://learning.linkedin.com/feed/')).toBe(false)
  })

  it('requires a genuine comment composer marker and rejects unrelated editables', () => {
    const search = document.createElement('textarea')
    search.setAttribute('aria-label', 'Search')
    const postComposer = document.createElement('div')
    postComposer.setAttribute('contenteditable', 'true')
    postComposer.setAttribute('placeholder', 'Start a post')
    const genuineRoot = document.createElement('div')
    genuineRoot.setAttribute('data-testid', 'comment-composer')
    const genuine = document.createElement('div')
    genuine.setAttribute('contenteditable', 'true')
    genuineRoot.append(genuine)
    document.body.append(genuineRoot)
    const owned = document.createElement('div')
    owned.setAttribute('contenteditable', 'true')
    owned.setAttribute('data-modaicom-inline-wrapper', '')
    expect(composerIsEligible(genuine)).toBe(true)
    expect(composerIsEligible(search)).toBe(false)
    expect(composerIsEligible(postComposer)).toBe(false)
    expect(composerIsEligible(owned)).toBe(false)
    genuineRoot.remove()
  })

  it('recognizes the current labelled LinkedIn comment editor structure', () => {
    const root = document.createElement('div')
    root.className = 'comments-comment-box'
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    editor.setAttribute('aria-label', 'Add a comment')
    root.append(editor)
    document.body.append(root)
    expect(composerIsEligible(editor)).toBe(true)
    root.remove()
  })

  it('rejects reply editors even with a generic comment label', () => {
    const reply = document.createElement('div')
    reply.className = 'comments-comment-box reply'
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    editor.setAttribute('aria-label', 'Add a comment')
    reply.append(editor)
    document.body.append(reply)
    expect(composerIsEligible(editor)).toBe(false)
    reply.remove()
  })

  it('recognizes the current LinkedIn scaffold feed and labelled editor structure', () => {
    const main = document.createElement('main')
    const feed = document.createElement('div')
    feed.className = 'scaffold-finite-scroll__content'
    const post = document.createElement('div')
    post.className = 'feed-shared-update-v2'
    post.setAttribute('data-urn', 'urn:li:activity:current')
    const body = document.createElement('div')
    body.className = 'feed-shared-update-v2__description'
    const composer = document.createElement('div')
    composer.className = 'comments-comment-box'
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    editor.setAttribute('aria-label', 'Add a comment')
    composer.append(editor)
    post.append(body, composer)
    feed.append(post)
    main.append(feed)
    document.body.append(main)
    expect(postCandidates(document, 'https://www.linkedin.com/feed/')).toEqual([post])
    expect(composerIsEligible(editor)).toBe(true)
    reconcile('https://www.linkedin.com/feed/')
    expect(document.querySelectorAll('[data-modaicom-inline-wrapper]').length).toBe(1)
    const laterPost = document.createElement('div')
    laterPost.className = 'feed-shared-update-v2'
    laterPost.setAttribute('data-urn', 'urn:li:activity:later')
    const laterBody = document.createElement('div')
    laterBody.className = 'feed-shared-update-v2__description'
    const laterComposer = document.createElement('div')
    laterComposer.className = 'comments-comment-box'
    const laterEditor = document.createElement('div')
    laterEditor.setAttribute('contenteditable', 'true')
    laterEditor.setAttribute('aria-label', 'Add a comment')
    laterComposer.append(laterEditor)
    laterPost.append(laterBody, laterComposer)
    feed.append(laterPost)
    expect(postCandidates(document, 'https://www.linkedin.com/feed/')).toEqual([post, laterPost])
    reconcile('https://www.linkedin.com/feed/')
    expect(document.querySelectorAll('[data-modaicom-inline-wrapper]').length).toBe(2)
    main.remove()
  })

  it('rejects nested activity roots and duplicate stable IDs', () => {
    const main = document.createElement('main')
    const feed = document.createElement('div')
    feed.className = 'scaffold-finite-scroll__content'
    const outer = document.createElement('div')
    outer.className = 'feed-shared-update-v2'
    outer.setAttribute('data-urn', 'urn:li:activity:outer')
    const outerBody = document.createElement('div')
    outerBody.className = 'feed-shared-update-v2__description'
    const nested = document.createElement('div')
    nested.className = 'feed-shared-update-v2'
    nested.setAttribute('data-urn', 'urn:li:activity:nested')
    const nestedBody = document.createElement('div')
    nestedBody.className = 'feed-shared-update-v2__description'
    nested.append(nestedBody)
    outer.append(outerBody, nested)
    const duplicate = outer.cloneNode(true) as HTMLElement
    feed.append(outer, duplicate)
    main.append(feed)
    document.body.append(main)
    expect(postCandidates(document, 'https://www.linkedin.com/feed/')).toEqual([])
    main.remove()
  })


  it('stops reconciliation after extension runtime invalidation', () => {
    const root = document.createElement('div')
    root.setAttribute('data-testid', 'comment-composer')
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    editor.setAttribute('aria-label', 'Add a comment')
    root.append(editor)
    document.body.append(root)
    markRuntimeInvalidated()
    reconcile('https://www.linkedin.com/feed/')
    expect(document.querySelectorAll('[data-modaicom-inline-wrapper]').length).toBe(0)
    root.remove()
    teardownInlineTriggerContentScript()
    initializeInlineTriggerContentScript()
  })

  it('targets the server-driven-UI home feed markup that has no activity URN', () => {
    const main = document.createElement('main')
    const feed = document.createElement('div')
    feed.setAttribute('data-testid', 'mainFeed')
    feed.setAttribute('role', 'list')

    const chrome = document.createElement('div')
    chrome.setAttribute('role', 'listitem') // feed sort toggle: a list item with no post body
    feed.append(chrome)

    const makePost = (key: string, text: string, withComposer: boolean) => {
      const wrapper = document.createElement('div')
      wrapper.setAttribute('componentkey', key)
      const post = document.createElement('div')
      post.setAttribute('role', 'listitem')
      const avatar = document.createElement('img')
      avatar.setAttribute('alt', `View ${text} author's profile`)
      const body = document.createElement('div')
      body.setAttribute('data-testid', 'expandable-text-box')
      body.textContent = text
      post.append(avatar, body)
      if (withComposer) {
        const editor = document.createElement('div')
        editor.setAttribute('contenteditable', 'true')
        editor.setAttribute('role', 'textbox')
        editor.setAttribute('aria-label', 'Text editor for creating comment')
        editor.className = 'tiptap'
        post.append(editor)
      }
      wrapper.append(post)
      feed.append(wrapper)
      return post
    }

    const first = makePost('expanded-a_MAIN_FEED', 'Alpha', true)
    const second = makePost('expanded-b_MAIN_FEED', 'Beta', false)
    main.append(feed)
    document.body.append(main)

    expect(postCandidates(document, 'https://www.linkedin.com/feed/')).toEqual([first, second])
    const editor = first.querySelector<HTMLElement>('[contenteditable="true"]')!
    expect(composerIsEligible(editor)).toBe(true)

    reconcile('https://www.linkedin.com/feed/')
    expect(document.querySelectorAll('[data-modaicom-inline-wrapper]').length).toBe(1)
    expect(first.querySelector('[data-modaicom-inline-wrapper]')).not.toBeNull()

    // A reply editor carries the same accessible label; only the first comment
    // composer in the post owns the trigger.
    const reply = document.createElement('div')
    reply.setAttribute('contenteditable', 'true')
    reply.setAttribute('role', 'textbox')
    reply.setAttribute('aria-label', 'Text editor for creating comment')
    reply.className = 'tiptap'
    first.append(reply)
    expect(composerIsEligible(reply)).toBe(false)

    main.remove()
  })

  it('excludes unrelated activity cards and observes only the feed container', () => {
    const main = document.createElement('main')
    const feed = document.createElement('div')
    feed.setAttribute('role', 'feed')
    const valid = document.createElement('article')
    valid.setAttribute('data-urn', 'urn:li:activity:1')
    const body = document.createElement('div')
    body.setAttribute('data-testid', 'post-body')
    valid.append(body)
    const unrelated = document.createElement('article')
    unrelated.setAttribute('data-urn', 'urn:li:activity:2')
    feed.append(valid, unrelated)
    main.append(feed)
    document.body.append(main)
    expect(postCandidates(document, 'https://www.linkedin.com/feed/')).toEqual([valid])
    expect(observationScopes('https://www.linkedin.com/feed/')).toContain(feed)
    expect(observationScopes('https://www.linkedin.com/feed/')).not.toContain(document.body)
    main.remove()
  })

  const ACTIVITY_URL = 'https://www.linkedin.com/feed/update/urn:li:activity:1/'

  function legacyPostWithComment(commentUrn = 'urn:li:comment:(activity:1,10)') {
    const main = document.createElement('main')
    main.innerHTML = `
      <div class="feed-shared-update-v2" data-urn="urn:li:activity:1">
        <div data-testid="actor-name">Ada</div>
        <div data-testid="post-body">Post body.</div>
        <div class="comments-comment-box">
          <div contenteditable="true" aria-label="Add a comment"></div>
        </div>
        <article class="comments-comment-entity" data-id="${commentUrn}">
          <span class="comments-comment-meta__description-title">Grace</span>
          <div class="comments-comment-item__main-content">A comment.</div>
          <div class="comments-comment-box comments-comment-box--reply">
            <div contenteditable="true" aria-placeholder="Add a reply…"></div>
          </div>
        </article>
      </div>`
    document.body.append(main)
    return main
  }

  it('renders a comment-reply trigger beside a legacy reply composer and a post-comment trigger beside the comment box', () => {
    const main = legacyPostWithComment()
    reconcile(ACTIVITY_URL)
    const wrappers = [...document.querySelectorAll('[data-modaicom-inline-wrapper]')]
    expect(wrappers.length).toBe(2)
    const owners = wrappers.map((w) => (w as HTMLElement).dataset.modaicomOwner)
    expect(owners.some((o) => o?.startsWith('post-comment:'))).toBe(true)
    expect(owners.some((o) => o === 'comment-reply:urn:li:comment:(activity:1,10)')).toBe(true)
    // reply trigger sits next to the reply editor
    const replyEditor = main.querySelector('[aria-placeholder="Add a reply…"]')!
    const replyTrigger = replyEditor.nextElementSibling as HTMLElement
    expect(replyTrigger.matches('[data-modaicom-inline-wrapper]')).toBe(true)
    expect(replyTrigger.shadowRoot?.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Generate a reply with modaicom',
    )
    main.remove()
  })

  it('gives one comment-reply trigger per distinct target comment', () => {
    const main = legacyPostWithComment('urn:li:comment:(activity:1,10)')
    const post = main.querySelector('.feed-shared-update-v2')!
    const second = document.createElement('article')
    second.className = 'comments-comment-entity'
    second.setAttribute('data-id', 'urn:li:comment:(activity:1,20)')
    second.innerHTML = `<span class="comments-comment-meta__description-title">Alan</span><div class="comments-comment-item__main-content">Another.</div><div class="comments-comment-box comments-comment-box--reply"><div contenteditable="true" aria-placeholder="Add a reply…"></div></div>`
    post.append(second)
    reconcile(ACTIVITY_URL)
    const replyWrappers = [...document.querySelectorAll('[data-modaicom-inline-wrapper]')].filter((w) =>
      (w as HTMLElement).dataset.modaicomOwner?.startsWith('comment-reply:'),
    )
    expect(replyWrappers.map((w) => (w as HTMLElement).dataset.modaicomOwner).sort()).toEqual([
      'comment-reply:urn:li:comment:(activity:1,10)',
      'comment-reply:urn:li:comment:(activity:1,20)',
    ])
    main.remove()
  })

  describe('INSERT_DRAFT', () => {
    const DRAFT = 'A drafted reply.'
    const MSG = (over: Record<string, unknown> = {}) => ({ version: 2, type: 'INSERT_DRAFT', text: DRAFT, sessionId: 's', generation: 1, ...over })

    function stubExecCommand(editor: HTMLElement) {
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        value: (cmd: string, _ui: boolean, val: string) => {
          if (cmd !== 'insertText') return false
          const sel = document.getSelection()
          if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) sel.getRangeAt(0).deleteContents()
          editor.textContent = (editor.textContent ?? '') + String(val)
          return true
        },
      })
    }

    async function startSession() {
      const sendMessage = vi.fn().mockResolvedValue({ accepted: true })
      vi.stubGlobal('chrome', { runtime: { id: 'ext', sendMessage, onMessage: { addListener: vi.fn() } } })
      vi.stubGlobal('location', { href: ACTIVITY_URL })
      teardownInlineTriggerContentScript()
      initializeInlineTriggerContentScript()
      const main = legacyPostWithComment()
      reconcile(ACTIVITY_URL)
      const wrapper = [...document.querySelectorAll('[data-modaicom-inline-wrapper]')].find((w) =>
        (w as HTMLElement).dataset.modaicomOwner?.startsWith('post-comment:'),
      ) as HTMLElement
      const button = wrapper.shadowRoot?.querySelector('button') as HTMLButtonElement
      button.dispatchEvent(new Event('click'))
      await Promise.resolve()
      await Promise.resolve()
      const relayed = sendMessage.mock.calls
        .map((c) => c[0] as Record<string, unknown>)
        .find((m) => m.type === 'INLINE_EXTRACTION_RESULT')!
      const editor = main.querySelector('[aria-label="Add a comment"]') as HTMLElement
      return { editor, sessionId: relayed.sessionId as string, generation: relayed.generation as number }
    }

    afterEach(() => vi.unstubAllGlobals())

    it('ignores a message that is not an INSERT_DRAFT envelope', () => {
      expect(handleInsertDraftRequest({ version: 2, type: 'GET_LATEST_RELAY' })).toBeUndefined()
      expect(handleInsertDraftRequest(null)).toBeUndefined()
    })

    it('inserts the draft into the exact editor when the session and route match', async () => {
      const { editor, sessionId, generation } = await startSession()
      stubExecCommand(editor)
      expect(handleInsertDraftRequest(MSG({ sessionId, generation }))).toEqual({ ok: true })
      expect(editor.textContent).toContain(DRAFT)
    })

    it('is an idempotent no-op when the editor already holds exactly this draft', async () => {
      const { editor, sessionId, generation } = await startSession()
      editor.textContent = DRAFT
      stubExecCommand(editor)
      expect(handleInsertDraftRequest(MSG({ sessionId, generation }))).toEqual({ ok: true })
      expect(editor.textContent).toBe(DRAFT) // not doubled
    })

    it('refuses editor-not-empty when the box holds other text', async () => {
      const { editor, sessionId, generation } = await startSession()
      editor.textContent = 'Half a sentence I typed'
      stubExecCommand(editor)
      expect(handleInsertDraftRequest(MSG({ sessionId, generation }))).toEqual({ ok: false, reason: 'editor-not-empty' })
      expect(editor.textContent).toBe('Half a sentence I typed')
    })

    it('replaces its own untouched prior insertion on a second Insert (Regenerate loop)', async () => {
      const { editor, sessionId, generation } = await startSession()
      stubExecCommand(editor)
      expect(handleInsertDraftRequest(MSG({ sessionId, generation }))).toEqual({ ok: true })
      expect(editor.textContent).toBe(DRAFT)

      const NEXT = 'A regenerated, different reply.'
      expect(handleInsertDraftRequest(MSG({ sessionId, generation, text: NEXT }))).toEqual({ ok: true })
      expect(editor.textContent).toBe(NEXT) // replaced, not appended
    })

    it('refuses once the user has edited modaicom’s prior insertion', async () => {
      const { editor, sessionId, generation } = await startSession()
      stubExecCommand(editor)
      handleInsertDraftRequest(MSG({ sessionId, generation }))
      editor.textContent = `${DRAFT} — and a thought of my own`

      expect(handleInsertDraftRequest(MSG({ sessionId, generation, text: 'Another draft.' }))).toEqual({
        ok: false,
        reason: 'editor-not-empty',
      })
    })

    it.each([
      ['a stale sessionId', (s: { sessionId: string; generation: number }) => ({ sessionId: 'other', generation: s.generation })],
      ['a stale generation', (s: { sessionId: string; generation: number }) => ({ sessionId: s.sessionId, generation: s.generation + 5 })],
    ])('refuses editor-unavailable for %s', async (_label, mutate) => {
      const session = await startSession()
      stubExecCommand(session.editor)
      expect(handleInsertDraftRequest(MSG(mutate(session)))).toEqual({ ok: false, reason: 'editor-unavailable' })
    })

    it('refuses editor-unavailable when the stashed editor is gone', async () => {
      const { editor, sessionId, generation } = await startSession()
      editor.remove()
      expect(handleInsertDraftRequest(MSG({ sessionId, generation }))).toEqual({ ok: false, reason: 'editor-unavailable' })
    })

    it('refuses route-changed when the page navigated since the trigger click', async () => {
      const { sessionId, generation } = await startSession()
      ;(location as unknown as { href: string }).href = 'https://www.linkedin.com/feed/'
      expect(handleInsertDraftRequest(MSG({ sessionId, generation }))).toEqual({ ok: false, reason: 'route-changed' })
    })

    it('forgets the held editor when the trigger UI is torn down (shared with route-change cleanup)', async () => {
      const { sessionId, generation } = await startSession()
      teardownInlineTriggerContentScript()
      expect(handleInsertDraftRequest(MSG({ sessionId, generation }))).toEqual({ ok: false, reason: 'editor-unavailable' })
    })
  })

  it('suppresses any trigger on an SDUI reply composer (comment URN precedes the editor)', () => {
    const main = document.createElement('main')
    main.innerHTML = `
      <div data-testid="mainFeed" role="list">
        <div componentkey="k_MAIN_FEED"><div role="listitem">
          <img alt="View Ada author's profile" />
          <div data-testid="expandable-text-box">Post.</div>
          <div id="hash_urn:li:comment:(urn:li:activity:1,9)"><span>Grace</span><span>A comment.</span></div>
          <div><div contenteditable="true" role="textbox" aria-label="Text editor for creating comment" class="tiptap"></div></div>
        </div></div>
      </div>`
    document.body.append(main)
    reconcile('https://www.linkedin.com/feed/')
    expect(document.querySelectorAll('[data-modaicom-inline-wrapper]').length).toBe(0)
    main.remove()
  })
})
