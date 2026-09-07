import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export type ReminderRepeat = 'none' | 'daily' | 'weekly'

export interface StageReminder {
  id: string
  message: string
  triggerAt: number
  repeat: ReminderRepeat
  createdAt: number
}

export interface CreateStageReminderPayload {
  message: string
  triggerAt: number
  repeat?: ReminderRepeat
}

export interface DeleteStageReminderPayload {
  id: string
}

export interface StageReminderFiredPayload {
  text: string
}

export const electronStageReminderCreate = defineInvokeEventa<StageReminder, CreateStageReminderPayload>('eventa:invoke:electron:stage:reminder-create')
export const electronStageReminderList = defineInvokeEventa<StageReminder[]>('eventa:invoke:electron:stage:reminder-list')
export const electronStageReminderDelete = defineInvokeEventa<boolean, DeleteStageReminderPayload>('eventa:invoke:electron:stage:reminder-delete')
export const electronStageReminderFired = defineEventa<StageReminderFiredPayload>('eventa:event:electron:stage:reminder-fired')
