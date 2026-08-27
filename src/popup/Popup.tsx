import { useEffect, useState } from 'react'

import {
  detectCurrentPage,
  type DetectionResult,
} from '../features/linkedin-detection/detectCurrentPage'
import './popup.css'

export function Popup() {
  const [result, setResult] = useState<DetectionResult | null>(null)

  const retry = () => {
    setResult(null)
    void detectCurrentPage().then(setResult)
  }

  useEffect(() => {
    void detectCurrentPage().then(setResult)
  }, [])

  const isLinkedIn = result?.kind === 'linkedin'
  const isOther = result?.kind === 'other'
  const isError = result?.kind === 'error'
  const icon = isLinkedIn ? '✓' : isOther ? '↗' : isError ? '!' : '◌'
  const message = isLinkedIn
    ? 'LinkedIn detected ✓'
    : isOther
      ? 'Open LinkedIn to use modaicom.'
      : isError
        ? 'Unable to detect the current page. Try again.'
        : 'Checking current page…'

  return (
    <main className="popup">
      <header className="popup__header">
        <span className="popup__brand-mark" aria-hidden="true">
          m
        </span>
        <h1>modaicom</h1>
      </header>
      <div
        className={`status status--${result?.kind ?? 'loading'}`}
        role="status"
        aria-live="polite"
      >
        <span className="status__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="status__message">{message}</span>
      </div>
      {isError ? (
        <button className="retry-button" onClick={retry}>
          Retry
        </button>
      ) : null}
    </main>
  )
}
