import type { BrowserWindow } from 'electron'

import type { ReminderRepeat, StageReminder } from '../../../../shared/eventa/reminders'
import type { I18n } from '../../../libs/i18n'
import type { ServerChannel } from '../../../services/airi/channel-server'
import type { GodotStageManager } from '../../../services/airi/godot-stage'
import type { McpStdioManager } from '../../../services/airi/mcp-servers'
import type { AutoUpdater } from '../../../services/electron/auto-updater'
import type { EditorWindowManager } from '../../editor'
import type { NoticeWindowManager } from '../../notice'
import type { OnboardingWindowManager } from '../../onboarding'
import type { SettingsWindowManager } from '../../settings'
import type { WidgetsWindowManager } from '../../widgets'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { ipcMain } from 'electron'
import { array, number, object, optional, string } from 'valibot'

import { electronCenterMainWindow, electronOpenChat, electronOpenEditor, electronOpenMainDevtools, electronOpenSettings, noticeWindowEventa } from '../../../../shared/eventa'
import { electronStageProactiveCheckIn } from '../../../../shared/eventa/auto-presence'
import {
  electronStageReminderCreate,
  electronStageReminderDelete,
  electronStageReminderFired,
  electronStageReminderList,
} from '../../../../shared/eventa/reminders'
import { createConfig } from '../../../libs/electron/persistence'
import { createAuthService } from '../../../services/airi/auth'
import { createGodotStageService } from '../../../services/airi/godot-stage'
import { createMcpServersService } from '../../../services/airi/mcp-servers'
import { createOnboardingService } from '../../../services/airi/onboarding'
import { createWidgetsService } from '../../../services/airi/widgets'
import { createAutoUpdaterService } from '../../../services/electron'
import { toggleWindowShow } from '../../shared'
import { centerWindowOnDisplay } from '../../shared/display'
import { setupBaseWindowElectronInvokes } from '../../shared/window'

const reminderConfigSchema = object({
  reminders: optional(array(object({
    id: string(),
    message: string(),
    triggerAt: number(),
    repeat: optional(string()),
    createdAt: number(),
  }))),
})

const MAX_REMINDER_TIMEOUT_MS = 24 * 60 * 60 * 1000

function normalizeReminderRepeat(value: string | undefined): ReminderRepeat {
  return value === 'daily' || value === 'weekly' ? value : 'none'
}

function nextRecurringTrigger(triggerAt: number, repeat: ReminderRepeat, now: number) {
  const next = new Date(triggerAt)
  const days = repeat === 'weekly' ? 7 : 1

  do {
    next.setDate(next.getDate() + days)
  } while (next.getTime() <= now)

  return next.getTime()
}

export async function setupMainWindowElectronInvokes(params: {
  window: BrowserWindow
  editorWindow: EditorWindowManager
  settingsWindow: SettingsWindowManager
  chatWindow: () => Promise<BrowserWindow>
  widgetsManager: WidgetsWindowManager
  noticeWindow: NoticeWindowManager
  autoUpdater: AutoUpdater
  serverChannel: ServerChannel
  godotStageManager: GodotStageManager
  mcpStdioManager: McpStdioManager
  i18n: I18n
  onboardingWindowManager: OnboardingWindowManager
}) {
  // TODO: once we refactored eventa to support window-namespaced contexts,
  // we can remove the setMaxListeners call below since eventa will be able to dispatch and
  // manage events within eventa's context system.
  ipcMain.setMaxListeners(0)

  const { context } = createContext(ipcMain, params.window)

  await setupBaseWindowElectronInvokes({ context, window: params.window, serverChannel: params.serverChannel, i18n: params.i18n })
  createWidgetsService({ context, widgetsManager: params.widgetsManager, window: params.window })
  createAutoUpdaterService({ context, window: params.window, service: params.autoUpdater })
  createMcpServersService({ context, manager: params.mcpStdioManager })
  createGodotStageService({ context, manager: params.godotStageManager, window: params.window })
  createOnboardingService({ context, onboardingWindowManager: params.onboardingWindowManager, mainWindow: params.window })
  createAuthService({ context, window: params.window })

  const {
    setup: setupReminderConfig,
    get: getReminderConfig,
    update: updateReminderConfig,
  } = createConfig('reminders', 'reminders.json', reminderConfigSchema, {
    default: { reminders: [] },
    autoHeal: true,
  })

  setupReminderConfig()

  let reminderTimer: ReturnType<typeof setTimeout> | undefined

  function reminders(): StageReminder[] {
    return (getReminderConfig()?.reminders ?? [])
      .map(reminder => ({
        id: reminder.id,
        message: reminder.message,
        triggerAt: reminder.triggerAt,
        repeat: normalizeReminderRepeat(reminder.repeat),
        createdAt: reminder.createdAt,
      }))
      .sort((a, b) => a.triggerAt - b.triggerAt)
  }

  function saveReminders(next: StageReminder[]) {
    updateReminderConfig({ reminders: next })
  }

  function clearReminderTimer() {
    if (!reminderTimer)
      return

    clearTimeout(reminderTimer)
    reminderTimer = undefined
  }

  function scheduleNextReminder() {
    clearReminderTimer()

    const next = reminders()[0]
    if (!next)
      return

    const delay = Math.max(0, next.triggerAt - Date.now())
    reminderTimer = setTimeout(fireDueReminders, Math.min(delay, MAX_REMINDER_TIMEOUT_MS))
  }

  function fireDueReminders() {
    reminderTimer = undefined

    const now = Date.now()
    const current = reminders()
    const due = current.filter(reminder => reminder.triggerAt <= now + 1000)

    if (due.length === 0) {
      scheduleNextReminder()
      return
    }

    const dueIds = new Set(due.map(reminder => reminder.id))
    const nextReminders = current
      .filter(reminder => !dueIds.has(reminder.id))

    for (const reminder of due) {
      if (reminder.repeat === 'none')
        continue

      nextReminders.push({
        ...reminder,
        triggerAt: nextRecurringTrigger(reminder.triggerAt, reminder.repeat, now),
      })
    }

    saveReminders(nextReminders)
    scheduleNextReminder()

    const text = due.length === 1
      ? `⏰ ${due[0]?.message ?? ''}`
      : `⏰ Đến giờ:\n${due.map(reminder => `• ${reminder.message}`).join('\n')}`

    if (!params.window.isDestroyed()) {
      if (!params.window.isVisible())
        params.window.showInactive()

      context.emit(electronStageReminderFired, { text })
      context.emit(electronStageProactiveCheckIn, { text })
    }
  }

  defineInvokeHandler(context, electronStageReminderCreate, (payload) => {
    const message = payload.message.trim()
    if (!message)
      throw new Error('Reminder message is empty.')
    if (!Number.isFinite(payload.triggerAt) || payload.triggerAt <= Date.now())
      throw new Error('Reminder time must be in the future.')

    const reminder: StageReminder = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      message,
      triggerAt: payload.triggerAt,
      repeat: normalizeReminderRepeat(payload.repeat),
      createdAt: Date.now(),
    }

    saveReminders([...reminders(), reminder])
    scheduleNextReminder()
    return reminder
  })

  defineInvokeHandler(context, electronStageReminderList, () => reminders())

  defineInvokeHandler(context, electronStageReminderDelete, ({ id }) => {
    const current = reminders()
    const next = current.filter(reminder => reminder.id !== id)
    if (next.length === current.length)
      return false

    saveReminders(next)
    scheduleNextReminder()
    return true
  })

  params.window.webContents.once('did-finish-load', scheduleNextReminder)
  params.window.once('closed', clearReminderTimer)

  defineInvokeHandler(context, electronCenterMainWindow, () => centerWindowOnDisplay(params.window))
  defineInvokeHandler(context, electronOpenMainDevtools, () => params.window.webContents.openDevTools({ mode: 'detach' }))
  defineInvokeHandler(context, electronOpenEditor, () => params.editorWindow.openWindow())
  defineInvokeHandler(context, electronOpenSettings, payload => params.settingsWindow.openWindow(payload?.route))
  defineInvokeHandler(context, electronOpenChat, async () => toggleWindowShow(await params.chatWindow()))
  defineInvokeHandler(context, noticeWindowEventa.openWindow, payload => params.noticeWindow.open(payload))
}
