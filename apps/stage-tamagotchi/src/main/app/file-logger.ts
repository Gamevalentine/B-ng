/**
 * File Logger for Electron Main Process
 *
 * Sets up file-based logging by creating timestamped log files in the userData directory.
 *
 * Log file naming: airi-tamagotchi-{timestamp}.log
 * - No rotation needed due to unique timestamp per session
 * - Unique timestamp per session avoids cross-process log file sharing
 * - Easy to identify and debug specific sessions
 */

import process from 'node:process'

import { mkdir, open, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { errorMessageFromValue } from '@proj-airi/stage-shared'
import { app, dialog } from 'electron'

const LOG_FILE_PREFIX = 'airi-tamagotchi'
let crashHandlersInstalled = false

export interface FileLoggerHandle {
  logFilePath: string | null
  logFileFd: number | null
  appendLog: (content: string) => Promise<void>
  close: () => Promise<void>
}

export const nullFileLoggerHandle: FileLoggerHandle = {
  logFilePath: null,
  logFileFd: null,
  appendLog: async () => {},
  close: async () => {},
}

function getErrorMessage(error: unknown): string {
  return errorMessageFromValue(error)
}

function createLogFilePath(logsDir: string, timestamp: number): string {
  return join(logsDir, `${LOG_FILE_PREFIX}-${timestamp}.log`)
}

async function ensureLogsDirectory(): Promise<string | null> {
  try {
    const logsDir = join(app.getPath('userData'), 'logs')
    await mkdir(logsDir, { recursive: true })
    return logsDir
  }
  catch (error) {
    const message = getErrorMessage(error)
    console.error(`[FileLogger] Failed to create logs directory: ${message}`)
    return null
  }
}

async function getLogFileSize(filePath: string): Promise<number | null> {
  try {
    const stats = await stat(filePath)
    return stats.size
  }
  catch {
    return null
  }
}

export async function setupFileLogger(): Promise<FileLoggerHandle> {
  const timestamp = Date.now()

  const logsDir = await ensureLogsDirectory()
  if (!logsDir) {
    return nullFileLoggerHandle
  }

  const logFilePath = createLogFilePath(logsDir, timestamp)

  try {
    const fileHandle = await open(logFilePath, 'a')
    const logFileFd = fileHandle.fd
    let isFileClosed = false

    const sessionStartMessage = `[FileLogger] Initialized - logging to: ${logFilePath}\n`
    await fileHandle.appendFile(sessionStartMessage)

    console.info(`[FileLogger] Session logs: ${logFilePath}`)

    async function appendLog(content: string) {
      if (isFileClosed) {
        return
      }

      const normalizedContent = content.endsWith('\n') ? content : `${content}\n`

      try {
        await fileHandle.appendFile(normalizedContent)
      }
      catch (error) {
        const message = getErrorMessage(error)
        console.error(`[FileLogger] Failed to write log: ${message}`)
      }
    }

    if (!crashHandlersInstalled) {
      crashHandlersInstalled = true

      const reportCrash = (title: string, message: string, showDialog: boolean) => {
        const entry = `[CrashGuard] ${title}: ${message}\n`
        void appendLog(entry)
        console.error(entry.trim())

        if (showDialog) {
          dialog.showErrorBox(
            `AIRI - ${title}`,
            `${message}\n\nCrash log:\n${logFilePath}`,
          )
        }
      }

      process.on('uncaughtException', (error) => {
        reportCrash('Uncaught exception', getErrorMessage(error), true)
      })

      process.on('unhandledRejection', (reason) => {
        reportCrash('Unhandled rejection', getErrorMessage(reason), false)
      })

      app.on('render-process-gone', (_event, _webContents, details) => {
        if (details.reason === 'clean-exit')
          return

        reportCrash(
          'Renderer process stopped',
          `reason=${details.reason}; exitCode=${details.exitCode}`,
          true,
        )
      })

      app.on('child-process-gone', (_event, details) => {
        if (details.reason === 'clean-exit')
          return

        reportCrash(
          'Child process stopped',
          `type=${details.type}; reason=${details.reason}; exitCode=${details.exitCode}`,
          details.type === 'GPU',
        )
      })
    }

    async function close() {
      if (isFileClosed) {
        return
      }

      try {
        await fileHandle.close()
        isFileClosed = true
        console.info('[FileLogger] File closed successfully')
      }
      catch (error) {
        const message = getErrorMessage(error)
        console.error(`[FileLogger] Failed to close log file: ${message}`)
      }

      const size = await getLogFileSize(logFilePath)
      const sizeInfo = size !== null ? ` (${(size / 1024).toFixed(2)} KB)` : ''
      console.info(`[FileLogger] Session log file: ${logFilePath}${sizeInfo}`)
    }

    return { logFilePath, logFileFd, appendLog, close }
  }
  catch (error) {
    const message = getErrorMessage(error)
    console.error(`[FileLogger] Failed to create log file - logging to console only: ${message}`)
    return nullFileLoggerHandle
  }
}
