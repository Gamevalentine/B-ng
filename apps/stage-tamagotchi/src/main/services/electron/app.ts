import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { stat } from 'node:fs/promises'
import { extname, isAbsolute } from 'node:path'
import { env } from 'node:process'

import { defineInvokeHandler } from '@moeru/eventa'
import { app, shell } from 'electron'
import { isLinux, isMacOS, isWindows } from 'std-env'

import {
  electron,
  electronAppGetLaunchAtLogin,
  electronAppIsWayland,
  electronAppOpenUserDataFolder,
  electronAppQuit,
  electronAppRunSafeTaskAction,
  electronAppSetLaunchAtLogin,
} from '../../../shared/eventa'
import { resolveIsWayland } from '../../app/ozone'

const blockedExecutableExtensions = new Set([
  '.bat',
  '.cmd',
  '.com',
  '.cpl',
  '.exe',
  '.gadget',
  '.hta',
  '.jar',
  '.js',
  '.jse',
  '.lnk',
  '.msc',
  '.msi',
  '.msp',
  '.pif',
  '.ps1',
  '.reg',
  '.scf',
  '.scr',
  '.url',
  '.vbs',
  '.vbe',
  '.wsf',
  '.wsh',
])

export function createAppService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  defineInvokeHandler(params.context, electron.app.isMacOS, () => isMacOS)
  defineInvokeHandler(params.context, electron.app.isWindows, () => isWindows)
  defineInvokeHandler(params.context, electron.app.isLinux, () => isLinux)
  defineInvokeHandler(params.context, electronAppIsWayland, () => resolveIsWayland({
    explicitOzonePlatform: app.commandLine.getSwitchValue('ozone-platform'),
    ozonePlatformHint: app.commandLine.getSwitchValue('ozone-platform-hint'),
    env,
  }))
  defineInvokeHandler(params.context, electronAppOpenUserDataFolder, async () => {
    const path = app.getPath('userData')
    const openResult = await shell.openPath(path)
    if (openResult) {
      throw new Error(openResult)
    }
    return { path }
  })
  defineInvokeHandler(params.context, electronAppQuit, () => app.quit())
  defineInvokeHandler(params.context, electronAppRunSafeTaskAction, async (action) => {
    if (action.type === 'open-url') {
      const url = new URL(action.url)
      if (url.protocol !== 'http:' && url.protocol !== 'https:')
        throw new Error('Only HTTP/HTTPS URLs are allowed for autonomous open-url tasks.')

      await shell.openExternal(url.toString())
      return {
        ok: true,
        message: `Opened URL: ${url.toString()}`,
      }
    }

    if (!isAbsolute(action.path))
      throw new Error('Autonomous local-path tasks require an absolute path.')

    const info = await stat(action.path)

    if (action.type === 'open-vscode-workspace') {
      const normalizedPath = action.path.replace(/\\/g, '/')
      await shell.openExternal(`vscode://file/${encodeURI(normalizedPath)}`)
      return {
        ok: true,
        message: `Opened in VS Code: ${action.path}`,
      }
    }

    if (info.isFile()) {
      const extension = extname(action.path).toLowerCase()
      if (blockedExecutableExtensions.has(extension))
        throw new Error(`Executable or script file types are blocked for autonomous tasks: ${extension || '(none)'}`)
    }

    const openResult = await shell.openPath(action.path)
    if (openResult)
      throw new Error(openResult)

    return {
      ok: true,
      message: `Opened path: ${action.path}`,
    }
  })

  function getLaunchAtLoginState() {
    const supported = isWindows && app.isPackaged
    return {
      enabled: supported ? app.getLoginItemSettings().openAtLogin : false,
      supported,
    }
  }

  defineInvokeHandler(params.context, electronAppGetLaunchAtLogin, () => getLaunchAtLoginState())
  defineInvokeHandler(params.context, electronAppSetLaunchAtLogin, (enabled) => {
    const state = getLaunchAtLoginState()
    if (!state.supported)
      return state

    app.setLoginItemSettings({ openAtLogin: Boolean(enabled) })
    return getLaunchAtLoginState()
  })
}
