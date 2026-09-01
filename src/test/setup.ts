import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// No test may make a real network call (ADR-0012). The default `fetch` throws
// loudly; a test that exercises a provider must stub it explicitly. Tests that
// call `vi.stubGlobal('fetch', ...)` in their own setup override this; the
// per-test `vi.unstubAllGlobals()` they run then restores the guard for the next.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('unmocked fetch: stub `fetch` in this test (no test may hit the network)')
    }),
  )
})

afterEach(cleanup)
