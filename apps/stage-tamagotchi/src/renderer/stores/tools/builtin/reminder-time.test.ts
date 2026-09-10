import { describe, expect, it } from 'vitest'

import { parseTimeExpression } from './reminder-time'

function localDate(year: number, month: number, day: number, hour: number, minute = 0) {
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

function parts(triggerAt: number) {
  const date = new Date(triggerAt)
  return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()]
}

describe('Vietnamese reminder time parsing', () => {
  describe('relative durations', () => {
    it('parses explicit relative minutes', () => {
      const now = localDate(2026, 9, 10, 20)
      expect(parseTimeExpression('sau 30 phút', 'none', now).triggerAt).toBe(now.getTime() + 30 * 60 * 1000)
      expect(parseTimeExpression('30 phút nữa', 'none', now).triggerAt).toBe(now.getTime() + 30 * 60 * 1000)
    })

    it('parses hours plus minutes as a duration only with a relative marker', () => {
      const now = localDate(2026, 9, 10, 20)
      expect(parseTimeExpression('sau 1 giờ 30 phút', 'none', now).triggerAt).toBe(now.getTime() + 90 * 60 * 1000)
    })

    it('does not mistake the minute part of a clock time for a relative duration', () => {
      const now = localDate(2026, 9, 10, 7)
      expect(parts(parseTimeExpression('8 giờ 30 phút', 'none', now).triggerAt)).toEqual([2026, 9, 10, 8, 30])
    })
  })

  describe('Vietnamese day parts', () => {
    it('maps 1 giờ trưa to 13:00', () => {
      const now = localDate(2026, 9, 10, 10)
      expect(parts(parseTimeExpression('1 giờ trưa', 'none', now).triggerAt)).toEqual([2026, 9, 10, 13, 0])
    })

    it('keeps 12 giờ trưa at noon', () => {
      const now = localDate(2026, 9, 10, 10)
      expect(parts(parseTimeExpression('12 giờ trưa', 'none', now).triggerAt)).toEqual([2026, 9, 10, 12, 0])
    })

    it('keeps late-morning trưa phrasing in the morning', () => {
      const now = localDate(2026, 9, 10, 8)
      expect(parts(parseTimeExpression('11 giờ trưa', 'none', now).triggerAt)).toEqual([2026, 9, 10, 11, 0])
    })

    it('maps early đêm hours to after midnight', () => {
      const now = localDate(2026, 9, 10, 0, 30)
      expect(parts(parseTimeExpression('1 giờ đêm', 'none', now).triggerAt)).toEqual([2026, 9, 10, 1, 0])
    })

    it('maps late đêm hours to PM', () => {
      const now = localDate(2026, 9, 10, 20)
      expect(parts(parseTimeExpression('10 giờ đêm', 'none', now).triggerAt)).toEqual([2026, 9, 10, 22, 0])
    })

    it('maps 12 giờ đêm to the next midnight', () => {
      const now = localDate(2026, 9, 10, 20)
      expect(parts(parseTimeExpression('12 giờ đêm', 'none', now).triggerAt)).toEqual([2026, 9, 11, 0, 0])
    })
  })

  describe('explicit days and dates', () => {
    it('does not silently move a past tối nay reminder to tomorrow', () => {
      const now = localDate(2026, 9, 10, 21)
      expect(() => parseTimeExpression('8 giờ tối nay', 'none', now)).toThrow('đã qua')
    })

    it('keeps a future tối nay reminder on today', () => {
      const now = localDate(2026, 9, 10, 19)
      expect(parts(parseTimeExpression('8 giờ tối nay', 'none', now).triggerAt)).toEqual([2026, 9, 10, 20, 0])
    })

    it('treats 12 giờ đêm nay as the upcoming midnight', () => {
      const now = localDate(2026, 9, 10, 20)
      expect(parts(parseTimeExpression('12 giờ đêm nay', 'none', now).triggerAt)).toEqual([2026, 9, 11, 0, 0])
    })

    it('rejects impossible calendar dates', () => {
      const now = localDate(2026, 9, 10, 20)
      expect(() => parseTimeExpression('31/02 8 giờ', 'none', now)).toThrow('không hợp lệ')
      expect(() => parseTimeExpression('10/13 8 giờ', 'none', now)).toThrow('không hợp lệ')
    })

    it('moves a date without a year to the next future occurrence', () => {
      const now = localDate(2026, 9, 10, 20)
      expect(parts(parseTimeExpression('1/1 9 giờ', 'none', now).triggerAt)).toEqual([2027, 1, 1, 9, 0])
    })

    it('finds the next valid leap year for 29/02 without a year', () => {
      const now = localDate(2026, 9, 10, 20)
      expect(parts(parseTimeExpression('29/02 9 giờ', 'none', now).triggerAt)).toEqual([2028, 2, 29, 9, 0])
    })

    it('rejects an explicitly past year instead of changing it', () => {
      const now = localDate(2026, 9, 10, 20)
      expect(() => parseTimeExpression('1/1/2026 9 giờ', 'none', now)).toThrow('đã qua')
    })
  })

  describe('recurrence and weekdays', () => {
    it('infers daily recurrence from Vietnamese text', () => {
      const now = localDate(2026, 9, 10, 20)
      const result = parseTimeExpression('mỗi ngày 7 giờ', 'none', now)
      expect(result.repeat).toBe('daily')
      expect(parts(result.triggerAt)).toEqual([2026, 9, 11, 7, 0])
    })

    it('infers weekly recurrence and resolves the requested weekday', () => {
      const now = localDate(2026, 9, 10, 20)
      const result = parseTimeExpression('mỗi thứ 2 7 giờ', 'none', now)
      expect(result.repeat).toBe('weekly')
      expect(parts(result.triggerAt)).toEqual([2026, 9, 14, 7, 0])
    })

    it('moves a same-weekday past time to the following week', () => {
      const now = localDate(2026, 9, 14, 20)
      expect(parts(parseTimeExpression('thứ 2 7 giờ', 'none', now).triggerAt)).toEqual([2026, 9, 21, 7, 0])
    })
  })

  it('rejects invalid clock minutes', () => {
    const now = localDate(2026, 9, 10, 7)
    expect(() => parseTimeExpression('8 giờ 75 phút', 'none', now)).toThrow('không hợp lệ')
  })
})
