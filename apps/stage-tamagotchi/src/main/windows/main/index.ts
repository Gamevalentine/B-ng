import type { Rectangle } from 'electron'
import type { InferOutput } from 'valibot'

import type { I18n } from '../../libs/i18n'
import type { ServerChannel } from '../../services/airi/channel-server'
import type { GodotStageManager } from '../../services/airi/godot-stage'
import type { McpStdioManager } from '../../services/airi/mcp-servers'
import type { AutoUpdater } from '../../services/electron/auto-updater'
import type { EditorWindowManager } from '../editor'
import type { NoticeWindowManager } from '../notice'
import type { OnboardingWindowManager } from '../onboarding'
import type { SettingsWindowManager } from '../settings'
import type { WidgetsWindowManager } from '../widgets'

import { dirname, join, resolve } from 'node:path'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

import { is } from '@electron-toolkit/utils'
import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { initScreenCaptureForWindow } from '@proj-airi/electron-screen-capture/main'
import { defu } from 'defu'
import { BrowserWindow, ipcMain, powerMonitor } from 'electron'
import { isLinux, isMacOS } from 'std-env'
import { array, number, object, optional, string } from 'valibot'

import icon from '../../../../resources/icon.png?asset'

import { electronStartDraggingWindow } from '../../../shared/eventa'
import { electronStageProactiveCheckIn } from '../../../shared/eventa/auto-presence'
import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'
import { baseUrl, getElectronMainDirname, load, withHashRoute } from '../../libs/electron/location'
import { createConfig } from '../../libs/electron/persistence'
import { protectPrivilegedWindowNavigation, setWindowAlwaysOnTop, transparentWindowConfig } from '../shared'
import { setupMainWindowElectronInvokes } from './rpc/index.electron'

const appConfigSchema = object({
  windows: optional(array(object({
    title: optional(string()),
    tag: string(),
    x: optional(number()),
    y: optional(number()),
    width: optional(number()),
    height: optional(number()),
  }))),
})

type AppConfig = InferOutput<typeof appConfigSchema>

const HUMAN_WAKE_HOUR = 7
const HUMAN_WAKE_END_HOUR = 23
const HUMAN_WAKE_END_MINUTE = 30
const HUMAN_WAKE_RETRY_MS = 60 * 1000
const USER_ACTIVE_IDLE_SECONDS = 5 * 60
const PROACTIVE_WAKE_MIN_MS = 45 * 60 * 1000
const PROACTIVE_WAKE_MAX_MS = 120 * 60 * 1000
const PROACTIVE_DISMISS_MIN_MS = 20 * 1000
const PROACTIVE_DISMISS_MAX_MS = 30 * 1000
const PROACTIVE_MESSAGES = [
  'Anh vẫn đang làm việc à?',
  'Nghỉ một chút chưa?',
  'Em ghé qua xem anh còn ở đây không nè.',
]

function isWithinHumanHours(date: Date) {
  const minutes = date.getHours() * 60 + date.getMinutes()
  const startMinutes = HUMAN_WAKE_HOUR * 60
  const endMinutes = HUMAN_WAKE_END_HOUR * 60 + HUMAN_WAKE_END_MINUTE
  return minutes >= startMinutes && minutes < endMinutes
}

function getNextHumanWakeAt(date: Date) {
  const nextWake = new Date(date)
  nextWake.setHours(HUMAN_WAKE_HOUR, 0, 0, 0)

  if (nextWake.getTime() <= date.getTime())
    nextWake.setDate(nextWake.getDate() + 1)

  return nextWake
}

function isUserActive() {
  return powerMonitor.getSystemIdleTime() < USER_ACTIVE_IDLE_SECONDS
}

function randomDelay(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1))
}

export async function setupMainWindow(params: {
  editorWindow: EditorWindowManager
  settingsWindow: SettingsWindowManager
  chatWindow: () => Promise<BrowserWindow>
  widgetsManager: WidgetsWindowManager
  noticeWindow: NoticeWindowManager
  autoUpdater: AutoUpdater
  onWindowCreated?: (window: BrowserWindow) => void
  serverChannel: ServerChannel
  godotStageManager: GodotStageManager
  mcpStdioManager: McpStdioManager
  i18n: I18n
  onboardingWindowManager: OnboardingWindowManager
}) {
  const {
    setup: setupConfig,
    get: getConfigRaw,
    update: updateConfig,
  } = createConfig('app', 'config.json', appConfigSchema, {
    default: { windows: [] },
    autoHeal: true,
  })
  const getConfig = (): AppConfig => getConfigRaw() ?? { windows: [] }

  setupConfig()

  const mainWindowConfig = getConfig().windows?.find(w => w.title === 'AIRI' && w.tag === 'main')

  const window = new BrowserWindow({
    title: 'AIRI',
    width: mainWindowConfig?.width ?? 450.0,
    height: mainWindowConfig?.height ?? 600.0,
    x: mainWindowConfig?.x,
    y: mainWindowConfig?.y,
    show: false,
    icon,
    webPreferences: {
      preload: join(dirname(fileURLToPath(import.meta.url)), '../preload/index.mjs'),
      sandbox: false,
    },
    // Thanks to [@HeartArmy](https://github.com/HeartArmy) for the tip implementation.
    //
    // https://github.com/electron/electron/issues/10078#issuecomment-3410164802
    // https://stackoverflow.com/questions/39835282/set-browserwindow-always-on-top-even-other-app-is-in-fullscreen-electron-mac
    type: isMacOS ? 'panel' : undefined,
    ...transparentWindowConfig(),
  })

  if (params.onWindowCreated) {
    params.onWindowCreated(window)
  }

  const { context: stageEventaContext } = createContext(ipcMain, window)

  let allowClose = false
  let humanWakeTimer: ReturnType<typeof setTimeout> | undefined
  let proactiveWakeTimer: ReturnType<typeof setTimeout> | undefined
  let proactiveDismissTimer: ReturnType<typeof setTimeout> | undefined

  function clearProactiveDismissTimer() {
    if (!proactiveDismissTimer)
      return

    clearTimeout(proactiveDismissTimer)
    proactiveDismissTimer = undefined
  }

  function scheduleHumanWake(delayOverride?: number) {
    if (humanWakeTimer)
      clearTimeout(humanWakeTimer)

    const now = new Date()
    const nextWake = getNextHumanWakeAt(now)
    const delay = delayOverride ?? Math.max(0, nextWake.getTime() - now.getTime())

    humanWakeTimer = setTimeout(() => {
      humanWakeTimer = undefined

      const wakeTime = new Date()
      if (window.isDestroyed())
        return

      if (!isWithinHumanHours(wakeTime)) {
        scheduleHumanWake()
        return
      }

      if (!window.isVisible()) {
        if (!isUserActive()) {
          scheduleHumanWake(HUMAN_WAKE_RETRY_MS)
          return
        }

        window.showInactive()
      }

      scheduleHumanWake()
    }, delay)
  }

  function scheduleProactiveWake(delayOverride?: number) {
    if (proactiveWakeTimer)
      clearTimeout(proactiveWakeTimer)

    const delay = delayOverride ?? randomDelay(PROACTIVE_WAKE_MIN_MS, PROACTIVE_WAKE_MAX_MS)
    proactiveWakeTimer = setTimeout(() => {
      proactiveWakeTimer = undefined

      const wakeTime = new Date()
      if (window.isDestroyed())
        return

      if (!isWithinHumanHours(wakeTime)) {
        const nextWake = getNextHumanWakeAt(wakeTime)
        scheduleProactiveWake(Math.max(HUMAN_WAKE_RETRY_MS, nextWake.getTime() - wakeTime.getTime()))
        return
      }

      if (!isUserActive()) {
        scheduleProactiveWake(HUMAN_WAKE_RETRY_MS)
        return
      }

      if (window.isVisible()) {
        scheduleProactiveWake()
        return
      }

      const text = PROACTIVE_MESSAGES[Math.floor(Math.random() * PROACTIVE_MESSAGES.length)] ?? PROACTIVE_MESSAGES[0]
      window.showInactive()
      stageEventaContext.emit(electronStageProactiveCheckIn, { text })

      clearProactiveDismissTimer()
      proactiveDismissTimer = setTimeout(() => {
        proactiveDismissTimer = undefined
        if (!window.isDestroyed() && window.isVisible() && !window.isFocused())
          window.hide()
      }, randomDelay(PROACTIVE_DISMISS_MIN_MS, PROACTIVE_DISMISS_MAX_MS))

      scheduleProactiveWake()
    }, delay)
  }

  onAppBeforeQuit(() => {
    allowClose = true
    if (humanWakeTimer)
      clearTimeout(humanWakeTimer)
    if (proactiveWakeTimer)
      clearTimeout(proactiveWakeTimer)
    clearProactiveDismissTimer()
  })

  // NOTICE: in development mode, open devtools by default
  if (is.dev || env.MAIN_APP_DEBUG || env.APP_DEBUG) {
    try {
      window.webContents.openDevTools({ mode: 'detach' })
    }
    catch (err) {
      console.error('failed to open devtools:', err)
    }
  }

  function handleNewBounds(newBounds: Rectangle) {
    const config = getConfig()
    if (!config.windows || !Array.isArray(config.windows)) {
      config.windows = []
    }

    const existingConfigIndex = config.windows.findIndex(w => w.title === 'AIRI' && w.tag === 'main')

    if (existingConfigIndex === -1) {
      config.windows.push({
        title: 'AIRI',
        tag: 'main',
        x: newBounds.x,
        y: newBounds.y,
        width: newBounds.width,
        height: newBounds.height,
      })
    }
    else {
      const mainWindowConfig = defu(config.windows[existingConfigIndex], { title: 'AIRI', tag: 'main' })

      mainWindowConfig.x = newBounds.x
      mainWindowConfig.y = newBounds.y
      mainWindowConfig.width = newBounds.width
      mainWindowConfig.height = newBounds.height

      config.windows[existingConfigIndex] = mainWindowConfig
    }

    updateConfig(config)
  }

  window.on('resize', () => handleNewBounds(window.getBounds()))
  window.on('move', () => handleNewBounds(window.getBounds()))
  window.on('focus', clearProactiveDismissTimer)
  window.on('close', (event) => {
    if (allowClose) {
      return
    }

    clearProactiveDismissTimer()
    event.preventDefault()
    window.hide()
  })

  // Thanks to [@HeartArmy](https://github.com/HeartArmy) for the tip implementation.
  //
  // https://github.com/electron/electron/issues/10078#issuecomment-3410164802
  // https://stackoverflow.com/questions/39835282/set-browserwindow-always-on-top-even-other-app-is-in-fullscreen-electron-mac
  window.setVisibleOnAllWorkspaces(true)
  if (isMacOS) {
    window.setFullScreenable(false)
    window.setWindowButtonVisibility(false)
  }
  setWindowAlwaysOnTop(window, true)

  window.on('ready-to-show', () => {
    window.show()
    scheduleHumanWake()
    scheduleProactiveWake()
  })
  protectPrivilegedWindowNavigation(window)

  await setupMainWindowElectronInvokes({
    window,
    editorWindow: params.editorWindow,
    settingsWindow: params.settingsWindow,
    chatWindow: params.chatWindow,
    widgetsManager: params.widgetsManager,
    noticeWindow: params.noticeWindow,
    autoUpdater: params.autoUpdater,
    serverChannel: params.serverChannel,
    godotStageManager: params.godotStageManager,
    mcpStdioManager: params.mcpStdioManager,
    i18n: params.i18n,
    onboardingWindowManager: params.onboardingWindowManager,
  })

  await load(window, withHashRoute(baseUrl(resolve(getElectronMainDirname(), '..', 'renderer')), '/', {
    query: { 'synced-leader': 'true' },
  }))

  /**
   * This is a know issue (or expected behavior maybe) to Electron.
   * We don't use this approach on Linux because it's not working.
   *
   * Discussion: https://github.com/electron/electron/issues/37789
   * Workaround: https://github.com/noobfromph/electron-click-drag-plugin
   */
  if (!isLinux) {
    const { default: clickDragPlugin } = await import('electron-click-drag-plugin')

    function handleStartDraggingWindow() {
      try {
        const windowId = window.getNativeWindowHandle()
        clickDragPlugin.startDrag(windowId)
      }
      catch (error) {
        console.error(error)
      }
    }

    // TODO: once we refactored eventa to support window-namespaced contexts,
    // we can remove the setMaxListeners call below since eventa will be able to dispatch and
    // manage events within eventa's context system.
    ipcMain.setMaxListeners(0)

    const cleanUpWindowDraggingInvokeHandler = defineInvokeHandler(stageEventaContext, electronStartDraggingWindow, handleStartDraggingWindow)

    window.on('closed', () => {
      cleanUpWindowDraggingInvokeHandler()
    })
  }

  initScreenCaptureForWindow(window)

  return window
}
