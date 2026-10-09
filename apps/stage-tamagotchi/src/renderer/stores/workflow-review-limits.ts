import { errorMessageFrom } from '@moeru/std'

const MINUTE_MS = 60_000
const FIFTEEN_MINUTES_MS = 15 * MINUTE_MS
const DAY_GUARD_MS = 26 * 60 * MINUTE_MS

/**
 * How long autonomous workflow reviews must wait after a quota rejection.
 * The provider stays unchanged. No fallback to paid models or retry loops.
 */
export function workflowReviewQuotaCooldownMs(error: unknown): number {
  if (error instanceof Error && error.name === 'BongLocalQuotaError' && 'reason' in error) {
    if (error.reason === 'day')
      return DAY_GUARD_MS
    const retryAfterMs = 'retryAfterMs' in error ? Number(error.retryAfterMs) : 0
    return Math.max(Number.isFinite(retryAfterMs) ? retryAfterMs : 0, MINUTE_MS)
  }

  const message = (errorMessageFrom(error) ?? '').toLowerCase()
  const code = typeof error === 'object' && error !== null
    ? 'statusCode' in error ? Number(error.statusCode) : 'status' in error ? Number(error.status) : 0
    : 0

  if (code === 402 || /\b402\b|payment_required|insufficient flux/.test(message))
    return FIFTEEN_MINUTES_MS
  if (code === 429 || /\b429\b|resource_exhausted|rate.limit|too many requests/.test(message))
    return MINUTE_MS
  return 0
}
