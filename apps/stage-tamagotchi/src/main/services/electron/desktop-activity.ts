import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import type { ElectronForegroundWindowContext } from '../../../shared/eventa'

import process from 'node:process'

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { defineInvokeHandler } from '@moeru/eventa'

import { electronGetForegroundWindowContext } from '../../../shared/eventa'

const execFileAsync = promisify(execFile)

const WINDOWS_FOREGROUND_SCRIPT = String.raw`$signature = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class AiriForegroundWindow {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError=true)]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
'@
Add-Type -TypeDefinition $signature -ErrorAction SilentlyContinue | Out-Null
$handle = [AiriForegroundWindow]::GetForegroundWindow()
if ($handle -eq [IntPtr]::Zero) { return }
$pidValue = [uint32]0
[AiriForegroundWindow]::GetWindowThreadProcessId($handle, [ref]$pidValue) | Out-Null
$titleBuffer = New-Object System.Text.StringBuilder 2048
[AiriForegroundWindow]::GetWindowText($handle, $titleBuffer, $titleBuffer.Capacity) | Out-Null
$process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
[pscustomobject]@{
  appName = if ($process) { $process.ProcessName } else { $null }
  processId = [int]$pidValue
  title = $titleBuffer.ToString()
  windowId = $handle.ToInt64()
} | ConvertTo-Json -Compress`

function unavailable(): ElectronForegroundWindowContext {
  return {
    available: false,
    updatedAt: Date.now(),
  }
}

interface WindowsForegroundWindowResult {
  appName?: string
  processId?: number
  title?: string
  windowId?: number
}

async function readWindowsForegroundWindow(): Promise<WindowsForegroundWindowResult | undefined> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', WINDOWS_FOREGROUND_SCRIPT],
    {
      encoding: 'utf8',
      timeout: 5_000,
      windowsHide: true,
    },
  )

  const text = stdout.trim()
  if (!text)
    return undefined

  return JSON.parse(text) as WindowsForegroundWindowResult
}

export function createDesktopActivityService(params: {
  context: ReturnType<typeof createContext>['context']
  window: BrowserWindow
}) {
  defineInvokeHandler(params.context, electronGetForegroundWindowContext, async (_, options) => {
    if (params.window.webContents.id !== options?.raw.ipcMainEvent.sender.id)
      return unavailable()

    if (process.platform !== 'win32')
      return unavailable()

    try {
      const foreground = await readWindowsForegroundWindow()
      if (!foreground)
        return unavailable()

      return {
        available: true,
        appName: foreground.appName,
        processId: foreground.processId,
        title: foreground.title,
        updatedAt: Date.now(),
        windowId: foreground.windowId,
      }
    }
    catch (error) {
      console.info('[DesktopActivity] Foreground window unavailable:', error)
      return unavailable()
    }
  })
}
