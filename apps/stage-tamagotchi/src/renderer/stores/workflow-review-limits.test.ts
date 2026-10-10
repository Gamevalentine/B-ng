import { describe, expect, it } from 'vitest'

import { workflowReviewQuotaCooldownMs } from './workflow-review-limits'

function localQuotaError(reason: string, retryAfterMs: number) {
  return Object.assign(new Error('local quota reached'), {
    name: 'BongLocalQuotaError',
    reason,
    retryAfterMs,
  })
}

describe('workflow review provider quota policy', () => {
  it('backs off fifteen minutes after HTTP 402 or insufficient flux', () => {
    expect(workflowReviewQuotaCooldownMs({ status: 402, message: 'Payment required' })).toBe(900_000)
    expect(workflowReviewQuotaCooldownMs(new Error('Insufficient flux'))).toBe(900_000)
  })

  it('backs off a minute after 429 or exhausted requests', () => {
    expect(workflowReviewQuotaCooldownMs({ statusCode: 429 })).toBe(60_000)
    expect(workflowReviewQuotaCooldownMs(new Error('RESOURCE_EXHAUSTED'))).toBe(60_000)
  })

  it('honors local cooldown or day safety guard', () => {
    expect(workflowReviewQuotaCooldownMs(localQuotaError('minute', 2_000))).toBe(60_000)
    expect(workflowReviewQuotaCooldownMs(localQuotaError('provider-cooldown', 200_000))).toBe(200_000)
    expect(workflowReviewQuotaCooldownMs(localQuotaError('day', 0))).toBe(26 * 60 * 60_000)
  })

  it('does not treat ordinary auth, timeout or cancellation as quota errors', () => {
    expect(workflowReviewQuotaCooldownMs({ statusCode: 401 })).toBe(0)
    expect(workflowReviewQuotaCooldownMs(new Error('user canceled'))).toBe(0)
    expect(workflowReviewQuotaCooldownMs(new Error('temporary network timeout'))).toBe(0)
  })
})
