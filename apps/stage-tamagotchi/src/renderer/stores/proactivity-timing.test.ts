import { describe, expect, it } from 'vitest'

import { allowsSpontaneousCheckIns, resolveProactivityTiming } from './proactivity-timing'

describe('bÔNG proactivity timing', () => {
  it('has shorter intervals as user increases the level', () => {
    const moderate = resolveProactivityTiming('moderate')
    const proactive = resolveProactivityTiming('proactive')
    const veryProactive = resolveProactivityTiming('very-proactive')
    expect(veryProactive.checkInMinGapMs).toBeLessThan(proactive.checkInMinGapMs)
    expect(proactive.checkInMinGapMs).toBeLessThan(moderate.checkInMinGapMs)
    expect(veryProactive.checkInMaxGapMs).toBeLessThan(proactive.checkInMaxGapMs)
    for (const settings of [moderate, proactive, veryProactive]) {
      expect(settings.checkInMinGapMs).toBeLessThan(settings.checkInMaxGapMs)
      expect(settings.firstCheckInMinMs).toBeLessThanOrEqual(settings.firstCheckInMaxMs)
    }
  })
  it('disallows unsolicited check-ins in passive mode', () => {
    expect(allowsSpontaneousCheckIns('passive')).toBe(false)
    expect(allowsSpontaneousCheckIns('moderate')).toBe(true)
  })
  it('falls back to moderate on unexpected saved preferences', () => {
    expect(resolveProactivityTiming('unknown')).toEqual(resolveProactivityTiming('moderate'))
  })
})
