import { describe, expect, it } from 'vitest'

import { contextToGenerationRequest, isGenerationRequest } from './generationRequest'
import { buildGenerationInput } from './prompt'
import type { LinkedInInteractionContext } from '../linkedin-context/interactionContext'

const fullPostContext: LinkedInInteractionContext = {
  kind: 'comment-reply',
  post: {
    authorDisplayName: 'Ada Lovelace',
    originalAuthoredText: 'SQL learning vs reality.',
    authorHeadline: 'Founder',
    stablePostIdentifier: 'urn:li:activity:7494943589722935296',
    publicationTimeLabel: '1w',
  },
  targetComment: { authorDisplayName: 'Grace Hopper', authoredText: 'Window functions were the hardest.' },
}

describe('contextToGenerationRequest — data minimisation', () => {
  it('a comment-reply request carries exactly interactionKind + postText + commentText', () => {
    const request = contextToGenerationRequest(fullPostContext)
    expect(request).toEqual({
      interactionKind: 'comment-reply',
      postText: 'SQL learning vs reality.',
      commentText: 'Window functions were the hardest.',
    })
    expect(Object.keys(request).sort()).toEqual(['commentText', 'interactionKind', 'postText'])
  })

  it('a post-comment request carries exactly interactionKind + postText', () => {
    const request = contextToGenerationRequest({ kind: 'post-comment', post: fullPostContext.post })
    expect(request).toEqual({ interactionKind: 'post-comment', postText: 'SQL learning vs reality.' })
    expect(Object.keys(request)).toEqual(['interactionKind', 'postText'])
  })

  it('never carries author names, headline, identifier, or time label', () => {
    const serialized = JSON.stringify(contextToGenerationRequest(fullPostContext))
    expect(serialized).not.toContain('Ada Lovelace')
    expect(serialized).not.toContain('Grace Hopper')
    expect(serialized).not.toContain('Founder')
    expect(serialized).not.toContain('urn:li:activity')
    expect(serialized).not.toContain('1w')
  })
})

describe('isGenerationRequest — strict guard', () => {
  it('accepts the exact shapes', () => {
    expect(isGenerationRequest({ interactionKind: 'post-comment', postText: 'x' })).toBe(true)
    expect(isGenerationRequest({ interactionKind: 'comment-reply', postText: 'x', commentText: 'y' })).toBe(true)
  })

  it.each([
    { interactionKind: 'post-comment', postText: 'x', authorDisplayName: 'Ada' },
    { interactionKind: 'comment-reply', postText: 'x', commentText: 'y', stablePostIdentifier: 'urn:li:activity:1' },
    { interactionKind: 'post-comment', postText: '   ' },
    { interactionKind: 'comment-reply', postText: 'x' },
    { interactionKind: 'unknown', postText: 'x' },
    { postText: 'x' },
    null,
    'x',
  ])('rejects %j (extra keys, empty, wrong shape)', (value) => {
    expect(isGenerationRequest(value)).toBe(false)
  })
})

describe('buildGenerationInput', () => {
  it('produces { system, user } with the authored text and no PII', () => {
    const input = buildGenerationInput({ interactionKind: 'comment-reply', postText: 'The post.', commentText: 'The comment.' })
    expect(typeof input.system).toBe('string')
    expect(input.user).toContain('The post.')
    expect(input.user).toContain('The comment.')
    expect(input.user).not.toContain('Ada')
  })

  it('frames a post-comment as a top-level comment', () => {
    const input = buildGenerationInput({ interactionKind: 'post-comment', postText: 'The post.' })
    expect(input.user).toContain('The post.')
    expect(input.user.toLowerCase()).toContain('top-level comment')
  })
})
