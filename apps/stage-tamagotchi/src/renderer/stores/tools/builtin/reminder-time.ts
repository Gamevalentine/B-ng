import type { ReminderRepeat } from '../../../../shared/eventa/reminders'

export function normalizeVietnamese(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

function inferredRepeat(text: string): ReminderRepeat {
  if (/\b(moi ngay|hang ngay|hangngay)\b/.test(text))
    return 'daily'
  if (/\b(moi tuan|hang tuan)\b/.test(text) || /\bmoi thu\s*(2|3|4|5|6|7|hai|ba|tu|nam|sau|bay)\b/.test(text) || /\bmoi chu nhat\b/.test(text))
    return 'weekly'
  return 'none'
}

function weekdayFromText(text: string) {
  const match = text.match(/\bthu\s*(2|3|4|5|6|7|hai|ba|tu|nam|sau|bay)\b|\bchu nhat\b/)
  if (!match)
    return undefined
  if ((match[0] ?? '').includes('chu nhat'))
    return 0

  const token = match[1]
  if (!token)
    return undefined

  const named: Record<string, number> = { hai: 1, ba: 2, tu: 3, nam: 4, sau: 5, bay: 6 }
  if (token in named)
    return named[token]

  const numeric = Number(token)
  return Number.isFinite(numeric) ? numeric - 1 : undefined
}

function isValidCalendarDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31)
    return false

  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
}

function nextValidYearForDate(month: number, day: number, fromYear: number) {
  for (let year = fromYear; year <= fromYear + 8; year++) {
    if (isValidCalendarDate(year, month, day))
      return year
  }
  return undefined
}

function hasRelativeMarker(value: string) {
  return /^sau\b/.test(value.trim()) || /\bnua\b/.test(value)
}

function parseRelativeTime(text: string, now: Date, repeat: ReminderRepeat) {
  const relativeHours = text.match(/\b(?:sau\s+)?(\d+(?:[.,]\d+)?)\s*gio(?:\s*(\d{1,2})\s*phut)?(?:\s*nua)?\b/)
  if (relativeHours && hasRelativeMarker(relativeHours[0] ?? '')) {
    const hours = Number((relativeHours[1] ?? '0').replace(',', '.'))
    const minutes = Number(relativeHours[2] ?? 0)
    if (!Number.isFinite(hours) || minutes > 59)
      throw new Error('Khoảng thời gian nhắc không hợp lệ.')

    return {
      triggerAt: now.getTime() + (hours * 60 + minutes) * 60 * 1000,
      repeat,
    }
  }

  const relativeMinutes = text.match(/\b(?:sau\s+)?(\d+)\s*phut(?:\s*nua)?\b/)
  if (relativeMinutes && hasRelativeMarker(relativeMinutes[0] ?? '')) {
    return {
      triggerAt: now.getTime() + Number(relativeMinutes[1] ?? 0) * 60 * 1000,
      repeat,
    }
  }

  return undefined
}

export function parseTimeExpression(when: string, requestedRepeat?: ReminderRepeat, now = new Date()) {
  const text = normalizeVietnamese(when)
  const repeat = requestedRepeat && requestedRepeat !== 'none' ? requestedRepeat : inferredRepeat(text)

  const relative = parseRelativeTime(text, now, repeat)
  if (relative)
    return relative

  const target = new Date(now)
  target.setSeconds(0, 0)

  let explicitDay = false
  let dateWithoutYear = false
  let dateParts: { day: number, month: number } | undefined

  const dateMatch = text.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?\b/)
  if (dateMatch) {
    const day = Number(dateMatch[1] ?? 0)
    const month = Number(dateMatch[2] ?? 0)
    dateParts = { day, month }

    if (dateMatch[3]) {
      const year = Number(dateMatch[3])
      if (!isValidCalendarDate(year, month, day))
        throw new Error(`Ngày "${dateMatch[0]}" không hợp lệ.`)
      target.setFullYear(year, month - 1, day)
    }
    else {
      dateWithoutYear = true
      const year = nextValidYearForDate(month, day, now.getFullYear())
      if (year === undefined)
        throw new Error(`Ngày "${dateMatch[0]}" không hợp lệ.`)
      target.setFullYear(year, month - 1, day)
    }

    explicitDay = true
  }
  else if (/\b(ngay mai|mai)\b/.test(text)) {
    target.setDate(target.getDate() + 1)
    explicitDay = true
  }
  else if (/\b(hom nay|sang nay|trua nay|chieu nay|toi nay|dem nay)\b/.test(text)) {
    explicitDay = true
  }

  const weekday = weekdayFromText(text)
  if (weekday !== undefined) {
    const daysAhead = (weekday - target.getDay() + 7) % 7
    if (daysAhead > 0)
      target.setDate(target.getDate() + daysAhead)
    explicitDay = true
  }

  const timeSource = dateMatch ? text.replace(dateMatch[0] ?? '', ' ') : text
  const timeMatch = timeSource.match(/\b(\d{1,2})\s*(?::|h|gio)\s*(\d{1,2})?\s*(?:phut)?\s*(sang|trua|chieu|toi|dem)?\b/)
  if (!timeMatch)
    throw new Error(`Không nhận ra thời gian "${when}". Ví dụ: "12 giờ", "8:30 tối nay", "30 phút nữa", "thứ 2 7 giờ".`)

  let hour = Number(timeMatch[1] ?? 0)
  const minute = Number(timeMatch[2] ?? 0)
  const dayPart = timeMatch[3]

  if (minute > 59 || hour > 23 || (dayPart && hour > 12))
    throw new Error(`Thời gian "${when}" không hợp lệ.`)

  let rollToNextDay = false

  if (dayPart === 'sang' && hour === 12) {
    hour = 0
  }
  else if (dayPart === 'trua') {
    if (hour >= 1 && hour <= 3)
      hour += 12
  }
  else if (dayPart === 'chieu') {
    if (hour < 12)
      hour += 12
  }
  else if (dayPart === 'toi') {
    if (hour === 12) {
      hour = 0
      rollToNextDay = true
    }
    else if (hour < 12) {
      hour += 12
    }
  }
  else if (dayPart === 'dem') {
    if (hour === 12) {
      hour = 0
      rollToNextDay = true
    }
    else if (hour >= 6 && hour < 12) {
      hour += 12
    }
  }

  target.setHours(hour, minute, 0, 0)
  if (rollToNextDay)
    target.setDate(target.getDate() + 1)

  if (dateWithoutYear && dateParts && target.getTime() <= now.getTime()) {
    const nextYear = nextValidYearForDate(dateParts.month, dateParts.day, target.getFullYear() + 1)
    if (nextYear === undefined)
      throw new Error(`Ngày "${dateMatch?.[0] ?? when}" không hợp lệ.`)

    target.setFullYear(nextYear, dateParts.month - 1, dateParts.day)
    target.setHours(hour, minute, 0, 0)
    if (rollToNextDay)
      target.setDate(target.getDate() + 1)
  }

  if (weekday !== undefined && target.getTime() <= now.getTime())
    target.setDate(target.getDate() + 7)
  else if (!explicitDay && target.getTime() <= now.getTime())
    target.setDate(target.getDate() + 1)

  if (target.getTime() <= now.getTime())
    throw new Error(`Thời gian "${when}" đã qua.`)

  return { triggerAt: target.getTime(), repeat }
}
