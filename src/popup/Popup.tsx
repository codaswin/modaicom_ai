import { useEffect, useState } from 'react'

import {
  detectCurrentPage,
  type DetectionResult,
} from '../features/linkedin-detection/detectCurrentPage'
import './popup.css'

type PopupState = DetectionResult['kind'] | 'loading'

const statePresentation = {
  loading: {
    icon: '◌',
    message: 'Checking current page…',
    canRetry: false,
  },
  linkedin: {
    icon: '✓',
    message: 'LinkedIn detected ✓',
    canRetry: false,
  },
  other: {
    icon: '↗',
    message: 'Open LinkedIn to use modaicom.',
    canRetry: false,
  },
  error: {
    icon: '!',
    message: 'Unable to detect the current page. Try again.',
    canRetry: true,
  },
} satisfies Record<
  PopupState,
  { icon: string; message: string; canRetry: boolean }
>

export function Popup() {
  const [result, setResult] = useState<DetectionResult | null>(null)

  const retry = () => {
    setResult(null)
    void detectCurrentPage().then(setResult)
  }

  useEffect(() => {
    void detectCurrentPage().then(setResult)
  }, [])

  const state: PopupState = result?.kind ?? 'loading'
  const presentation = statePresentation[state]

  return (
    <main className="popup">
      <header className="popup__header">
        <span className="popup__brand-mark" aria-hidden="true">
          m
        </span>
        <h1>modaicom</h1>
      </header>
      <div
        className={`status status--${state}`}
        role="status"
        aria-live="polite"
      >
        <span className="status__icon" aria-hidden="true">
          {presentation.icon}
        </span>
        <span className="status__message">{presentation.message}</span>
      </div>
      {presentation.canRetry ? (
        <button className="retry-button" onClick={retry}>
          Retry
        </button>
      ) : null}
    </main>
  )
}
