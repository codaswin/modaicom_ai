import type { InteractionKind } from '../features/linkedin-context/interactionContext'
import triggerCss from './inlineTrigger.css?raw'

// Builds the inline modaicom trigger inside an isolated shadow root. The wrapper
// <span> is the light-DOM host (it still carries the reconcile bookkeeping data
// attributes); everything visual lives in the shadow root and is styled from the
// single bundled stylesheet, applied via adoptedStyleSheets where available and
// a <style> element otherwise (older engines / test shims).

export const OWNED_WRAPPER_ATTR = 'data-modaicom-inline-wrapper'

const TRIGGER_LABELS: Record<InteractionKind, string> = {
  'post-comment': 'Generate a comment with modaicom',
  'comment-reply': 'Generate a reply with modaicom',
}

const TOOLTIP_TEXT = 'Generate with modaicom'

let cachedSheet: CSSStyleSheet | undefined
function sharedStyleSheet(): CSSStyleSheet | undefined {
  if (typeof CSSStyleSheet === 'undefined') return undefined
  try {
    if (!cachedSheet) {
      cachedSheet = new CSSStyleSheet()
      cachedSheet.replaceSync(triggerCss)
    }
    return cachedSheet
  } catch {
    return undefined
  }
}

function applyStyles(root: ShadowRoot): void {
  const sheet = sharedStyleSheet()
  if (sheet && 'adoptedStyleSheets' in root) {
    root.adoptedStyleSheets = [sheet]
    return
  }
  const style = document.createElement('style')
  style.textContent = triggerCss
  root.append(style)
}

export type InlineTriggerHandle = {
  /** The light-DOM wrapper to insert next to the editor. */
  host: HTMLElement
  /** Whether an extraction is currently in progress. */
  readonly busy: boolean
  /** Toggle the extraction-in-progress state (disabled + spinner + aria-busy). */
  setBusy: (busy: boolean) => void
}

export function createInlineTrigger(
  kind: InteractionKind,
  ownerKey: string,
  onActivate: (event: Event) => void,
): InlineTriggerHandle {
  const host = document.createElement('span')
  host.setAttribute(OWNED_WRAPPER_ATTR, '')
  host.dataset.modaicomOwner = ownerKey

  const root = host.attachShadow({ mode: 'open' })
  applyStyles(root)

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'trigger'
  button.setAttribute('aria-label', TRIGGER_LABELS[kind])
  button.setAttribute('aria-busy', 'false')
  button.addEventListener('click', onActivate)

  const mark = document.createElement('span')
  mark.className = 'mark'
  mark.setAttribute('aria-hidden', 'true')
  mark.textContent = 'm'

  const tooltip = document.createElement('span')
  tooltip.className = 'tooltip'
  tooltip.setAttribute('aria-hidden', 'true')
  tooltip.textContent = TOOLTIP_TEXT

  button.append(mark, tooltip)
  root.append(button)

  let busy = false
  return {
    host,
    get busy() {
      return busy
    },
    setBusy: (next: boolean) => {
      busy = next
      button.disabled = next
      button.setAttribute('aria-busy', next ? 'true' : 'false')
      button.classList.toggle('is-busy', next)
    },
  }
}
