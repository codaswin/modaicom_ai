export type DiagnosticCode = 'FEED_ROOT_NOT_FOUND' | 'POST_ROOT_NOT_RECOGNIZED' | 'BODY_MARKER_NOT_FOUND' | 'COMPOSER_NOT_RECOGNIZED' | 'OWNERSHIP_AMBIGUOUS' | 'EXACT_ROOT_INVALID' | 'AUTHOR_NOT_FOUND' | 'POST_TEXT_NOT_FOUND' | 'RELAY_REJECTED'
export type StructuralDiagnostic = { stage: 'feed' | 'individual'; event: string; code?: DiagnosticCode; routeRecognized?: boolean; feedContainerVariant?: string; candidateCount?: number; candidateRootVariant?: string; activityIdentifierPresent?: boolean; originalBodyMarkerPresent?: boolean; nestedCandidateRejected?: boolean; supportedComposerVariant?: string; ownershipAssociationSucceeded?: boolean; insertionAttempted?: boolean; insertionSucceeded?: boolean; snapshotValidationPassed?: boolean; stableIdentifierValidationPassed?: boolean; exactRootExtractorInvoked?: boolean; authorFieldFound?: boolean; authoredBodyFieldFound?: boolean; normalizationSucceeded?: boolean; extractionOutcome?: string; messageAccepted?: boolean; relayWriteAccepted?: boolean }
const enabled = (): boolean => Boolean((globalThis as { __MODAICOM_DEV_DIAGNOSTICS__?: boolean }).__MODAICOM_DEV_DIAGNOSTICS__)
const events: StructuralDiagnostic[] = []
export function recordDiagnostic(event: StructuralDiagnostic): void { if (enabled()) events.push({ ...event }) }
export function getDiagnostics(): StructuralDiagnostic[] { return enabled() ? events.map((event) => ({ ...event })) : [] }
export function clearDiagnostics(): void { events.length = 0 }

if (enabled()) (globalThis as { __modaicomDiagnostics?: unknown }).__modaicomDiagnostics = { get: getDiagnostics, clear: clearDiagnostics }
