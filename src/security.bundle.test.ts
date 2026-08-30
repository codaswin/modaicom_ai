import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { INTENTS, LENGTHS, TONES } from './features/generation/preferences'

// ADR-0008: the API key must never be reachable from code that runs near
// LinkedIn or in the popup. The eslint boundary rule blocks direct imports of
// keyStore; this asserts nothing leaks transitively into the shipped bundles.

const DIST_ASSETS = join(process.cwd(), 'dist', 'assets')
const KEY_MARKERS = ['modaicom.provider.', 'keyStore', 'Bearer ', 'api.openai.com']

function readEntryFromHtmlLike(source: string): string {
  const entry = source.match(/assets\/([^"']+\.js)/)?.[1]
  if (!entry) throw new Error('no entry chunk found')
  return readFileSync(join(DIST_ASSETS, entry), 'utf8')
}

function chunkFor(loaderKeyword: string): string {
  const loader = readdirSync(DIST_ASSETS).find((f) => f.includes(loaderKeyword) && f.includes('loader'))
  if (!loader) throw new Error(`no ${loaderKeyword} loader found`)
  return readEntryFromHtmlLike(readFileSync(join(DIST_ASSETS, loader), 'utf8'))
}

function reachableChunks(entrySrc: string): string[] {
  // shallow: the content-script entry statically imports its dependency chunks
  const seen = new Set<string>()
  const queue = [entrySrc]
  while (queue.length) {
    const src = queue.pop()!
    for (const match of src.matchAll(/["'](?:\.\/)?([A-Za-z0-9_-]+-[A-Za-z0-9]+\.js)["']/g)) {
      const name = match[1]
      if (!name || seen.has(name)) continue
      seen.add(name)
      const path = join(DIST_ASSETS, name)
      if (existsSync(path)) queue.push(readFileSync(path, 'utf8'))
    }
  }
  return [entrySrc, ...[...seen].map((n) => readFileSync(join(DIST_ASSETS, n), 'utf8')).filter(Boolean)]
}

describe.runIf(existsSync(DIST_ASSETS))('shipped bundle hygiene', () => {
  it('the content-script bundle graph contains no API-key material', () => {
    const sources = reachableChunks(chunkFor('inlineTrigger'))
    for (const src of sources) {
      for (const marker of KEY_MARKERS) {
        expect(src.includes(marker), `content-script chunk unexpectedly contains "${marker}"`).toBe(false)
      }
    }
  })

  it('the content-script bundle graph contains no Response Controls instruction text (ADR-0009)', () => {
    const sources = reachableChunks(chunkFor('inlineTrigger'))
    const instructions = [...TONES, ...INTENTS, ...LENGTHS].map((row) => row.instruction)
    for (const src of sources) {
      for (const instruction of instructions) {
        expect(src.includes(instruction), `content-script chunk unexpectedly contains a tone/intent/length instruction`).toBe(
          false,
        )
      }
    }
  })

  it('the popup bundle graph contains no API-key material', () => {
    const popupHtml = readFileSync(join(process.cwd(), 'dist', 'src', 'popup', 'index.html'), 'utf8')
    const sources = reachableChunks(readEntryFromHtmlLike(popupHtml))
    for (const src of sources) {
      expect(src.includes('keyStore'), 'popup chunk unexpectedly imports keyStore').toBe(false)
      expect(src.includes('Bearer '), 'popup chunk unexpectedly contains a bearer-key template').toBe(false)
    }
  })
})
