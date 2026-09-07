import type { Tool } from '@xsai/shared-chat'

import type { ReminderRepeat, StageReminder } from '../../../../shared/eventa/reminders'

import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import {
  electronStageReminderCreate,
  electronStageReminderDelete,
  electronStageReminderList,
} from '../../../../shared/eventa/reminders'

function normalizeVietnamese(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

function inferredRepeat(text: string): ReminderRepeat {
  if (/\b(?:moi ngay|hang ngay|hangngay)\b/.test(text))
    return 'daily'
  if (/\b(?:moi tuan|hang tuan)\b/.test(text) || /\bmoi thu\s*(?:[2-7]|hai|ba|tu|nam|sau|bay)\b/.test(text) || /\bmoi chu nhat\b/.test(text))
    return 'weekly'
  return 'none'
}

function weekdayFromText(text: string) {
  const match = text.match(/\bthu\s*([2-7]|hai|ba|tu|nam|sau|bay)\b|\bchu nhat\b/)
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

function parseTimeExpression(when: string, requestedRepeat?: ReminderRepeat, now = new Date()) {
  const text = normalizeVietnamese(when)
  const repeat = requestedRepeat && requestedRepeat !== 'none' ? requestedRepeat : inferredRepeat(text)

  const relativeMinutes = text.match(/(?:sau\s+)?(\d+)\s*phut(?:\s*nua)?/)
  if (relativeMinutes) {
    const triggerAt = now.getTime() + Number(relativeMinutes[1] ?? 0) * 60 * 1000
    return { triggerAt, repeat }
  }

  const relativeHours = text.match(/(?:sau\s+)?(\d+(?:[.,]\d+)?)\s*gio(?:\s*nua)?/)
  if (relativeHours && /nua|sau\s+/.test(relativeHours[0] ?? '')) {
    const hours = Number((relativeHours[1] ?? '0').replace(',', '.'))
    const triggerAt = now.getTime() + hours * 60 * 60 * 1000
    return { triggerAt, repeat }
  }

  const target = new Date(now)
  target.setSeconds(0, 0)
  let explicitDay = false

  const dateMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/)
  if (dateMatch) {
    const day = Number(dateMatch[1] ?? 0)
    const month = Number(dateMatch[2] ?? 0) - 1
    const year = dateMatch[3] ? Number(dateMatch[3]) : now.getFullYear()
    target.setFullYear(year, month, day)
    explicitDay = true
  }
  else if (/\b(?:ngay mai|mai)\b/.test(text)) {
    target.setDate(target.getDate() + 1)
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
  const timeMatch = timeSource.match(/\b(\d{1,2})\s*(?::|h|gio)(?:\s*(\d{1,2}))?(?:\s+(sang|trua|chieu|toi|dem))?\b/)
  if (!timeMatch)
    throw new Error(`Không nhận ra thời gian "${when}". Ví dụ: "12 giờ", "8:30 tối nay", "30 phút nữa", "thứ 2 7 giờ".`)

  let hour = Number(timeMatch[1] ?? 0)
  const minute = Number(timeMatch[2] ?? 0)
  const dayPart = timeMatch[3]

  if (minute > 59 || hour > 23)
    throw new Error(`Thời gian "${when}" không hợp lệ.`)

  if ((dayPart === 'chieu' || dayPart === 'toi' || dayPart === 'dem') && hour < 12)
    hour += 12
  else if (dayPart === 'sang' && hour === 12)
    hour = 0

  target.setHours(hour, minute, 0, 0)

  if (weekday !== undefined && target.getTime() <= now.getTime())
    target.setDate(target.getDate() + 7)
  else if (!explicitDay && target.getTime() <= now.getTime())
    target.setDate(target.getDate() + 1)

  if (target.getTime() <= now.getTime())
    throw new Error(`Thời gian "${when}" đã qua.`)

  return { triggerAt: target.getTime(), repeat }
}

function formatReminderTime(triggerAt: number) {
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(triggerAt))
}

function reminderInvokes() {
  const context = getElectronEventaContext()
  return {
    create: useElectronEventaInvoke(electronStageReminderCreate, context),
    list: useElectronEventaInvoke(electronStageReminderList, context),
    remove: useElectronEventaInvoke(electronStageReminderDelete, context),
  }
}

const setReminderParams = z.object({
  message: z.string().min(1).describe('What AIRI should remind the user about.'),
  when: z.string().min(1).describe('The user time expression, preferably preserved verbatim, e.g. "12 giờ", "30 phút nữa", "8 giờ tối nay", "thứ 2 7 giờ", "mỗi ngày 7 giờ".'),
  repeat: z.enum(['none', 'daily', 'weekly']).describe('Recurrence. Use "none" for a one-time reminder, "daily" for every day, or "weekly" for every week.'),
})

const cancelReminderParams = z.object({
  id: z.string().min(1).describe('Reminder id returned by list_reminders.'),
})

async function executeSetReminder(input: { message: string, when: string, repeat: ReminderRepeat }) {
  const parsed = parseTimeExpression(input.when, input.repeat)
  const reminder = await reminderInvokes().create({
    message: input.message.trim(),
    triggerAt: parsed.triggerAt,
    repeat: parsed.repeat,
  })

  const repeatText = reminder.repeat === 'daily'
    ? ' và lặp lại mỗi ngày'
    : reminder.repeat === 'weekly'
      ? ' và lặp lại mỗi tuần'
      : ''

  return `Đã đặt nhắc "${reminder.message}" vào ${formatReminderTime(reminder.triggerAt)}${repeatText}. Mã nhắc: ${reminder.id}.`
}

async function executeListReminders() {
  const reminders = await reminderInvokes().list()
  if (reminders.length === 0)
    return 'Hiện chưa có lời nhắc nào.'

  return reminders
    .map((reminder: StageReminder) => `${reminder.id} | ${formatReminderTime(reminder.triggerAt)} | ${reminder.repeat} | ${reminder.message}`)
    .join('\n')
}

async function executeCancelReminder(input: { id: string }) {
  const removed = await reminderInvokes().remove({ id: input.id })
  return removed ? `Đã xóa lời nhắc ${input.id}.` : `Không tìm thấy lời nhắc ${input.id}.`
}

const tools: Promise<Tool>[] = [
  tool({
    name: 'set_reminder',
    description: 'Create a real persistent AIRI reminder. Use this whenever the user asks AIRI to remind them, set an alarm/time, or schedule a future prompt. Do not say AIRI cannot remind them when this tool is available.',
    execute: executeSetReminder,
    parameters: setReminderParams,
  }),
  tool({
    name: 'list_reminders',
    description: 'List all currently scheduled AIRI reminders, including their ids and recurrence.',
    execute: executeListReminders,
    parameters: z.object({}),
  }),
  tool({
    name: 'cancel_reminder',
    description: 'Delete a scheduled AIRI reminder by id. If the user describes a reminder instead of giving an id, call list_reminders first to identify it.',
    execute: executeCancelReminder,
    parameters: cancelReminderParams,
  }),
]

export const reminderTools = async () => Promise.all(tools)
