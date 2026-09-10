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
import { parseTimeExpression } from './reminder-time'

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
