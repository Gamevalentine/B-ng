export type ProactivityLevel = 'passive' | 'moderate' | 'proactive' | 'very-proactive'

export interface ProactivityTiming {
  firstCheckInMinMs: number
  firstCheckInMaxMs: number
  checkInMinGapMs: number
  checkInMaxGapMs: number
  returnGreetingMinMs: number
  returnGreetingMaxMs: number
  sleepMinMs: number
  sleepMaxMs: number
  awakeMinMs: number
  awakeMaxMs: number
}

/**
 * Companion check-ins remain optional. Focus, silent and sleep modes take priority.
 * Task reminders and approved workflows are governed separately.
 */
const MINUTE = 60_000
const levelTimings: Record<ProactivityLevel, ProactivityTiming> = {
  'passive': {
    firstCheckInMinMs: 120 * MINUTE,
    firstCheckInMaxMs: 120 * MINUTE,
    checkInMinGapMs: 120 * MINUTE,
    checkInMaxGapMs: 120 * MINUTE,
    returnGreetingMinMs: 120 * MINUTE,
    returnGreetingMaxMs: 120 * MINUTE,
    sleepMinMs: 45 * MINUTE,
    sleepMaxMs: 60 * MINUTE,
    awakeMinMs: 70 * MINUTE,
    awakeMaxMs: 90 * MINUTE,
  },
  'moderate': {
    firstCheckInMinMs: 2 * MINUTE,
    firstCheckInMaxMs: 5 * MINUTE,
    checkInMinGapMs: 20 * MINUTE,
    checkInMaxGapMs: 45 * MINUTE,
    returnGreetingMinMs: 20_000,
    returnGreetingMaxMs: 90_000,
    sleepMinMs: 20 * MINUTE,
    sleepMaxMs: 45 * MINUTE,
    awakeMinMs: 35 * MINUTE,
    awakeMaxMs: 70 * MINUTE,
  },
  'proactive': {
    firstCheckInMinMs: 2 * MINUTE,
    firstCheckInMaxMs: 4 * MINUTE,
    checkInMinGapMs: 12 * MINUTE,
    checkInMaxGapMs: 24 * MINUTE,
    returnGreetingMinMs: 20_000,
    returnGreetingMaxMs: 65_000,
    sleepMinMs: 15 * MINUTE,
    sleepMaxMs: 30 * MINUTE,
    awakeMinMs: 35 * MINUTE,
    awakeMaxMs: 65 * MINUTE,
  },
  'very-proactive': {
    firstCheckInMinMs: 1 * MINUTE,
    firstCheckInMaxMs: 2 * MINUTE,
    checkInMinGapMs: 6 * MINUTE,
    checkInMaxGapMs: 12 * MINUTE,
    returnGreetingMinMs: 15_000,
    returnGreetingMaxMs: 45_000,
    sleepMinMs: 12 * MINUTE,
    sleepMaxMs: 22 * MINUTE,
    awakeMinMs: 35 * MINUTE,
    awakeMaxMs: 60 * MINUTE,
  },
}

export function resolveProactivityTiming(level: unknown): ProactivityTiming {
  if (level === 'passive' || level === 'proactive' || level === 'very-proactive')
    return levelTimings[level]
  return levelTimings.moderate
}

export function allowsSpontaneousCheckIns(level: unknown): boolean {
  return level !== 'passive'
}
