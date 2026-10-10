import process from 'node:process'

import { describe, expect, it, vi } from 'vitest'

import { createComputerUseRuntime } from './runtime'

describe.runIf(process.platform === 'win32')('main-process one-time Windows authorization', () => {
  const settings = { binaryPath: 'unused-in-mock', storeRoot: 'E:/AI_WORKSPACE/Temp/bong-approval-unit' }

  it('fails closed even when legacy renderer sends approved:true', async () => {
    const confirmWindowsAction = vi.fn(async () => false)
    const runWindowsAction = vi.fn(async (argv: string[], _options?: unknown) => ({
      argv,
      exitCode: 0,
      output: { status: 'completed' },
      stderr: '',
    }))
    const runtime = createComputerUseRuntime({ ...settings, confirmWindowsAction, runWindowsAction })
    try {
      const argv = ['invoke', 'input.clickPoint', '100', '200', '777', 'BONG QA Scratch']
      const result = await runtime.run({ argv, approved: true })
      expect(result.exitCode).toBe(1)
      expect(result.output).toMatchObject({ failure: { code: 'approval_denied' } })
      expect(confirmWindowsAction).toHaveBeenCalledOnce()
      expect(confirmWindowsAction).toHaveBeenCalledWith('Nhấp chuột tại X=100, Y=200 trong cửa sổ "BONG QA Scratch" (HWND 777)', argv)
      expect(runWindowsAction).not.toHaveBeenCalled()
    }
    finally {
      await runtime.dispose()
    }
  })

  it('allows exactly the action described by the confirmed dialog, then demands new approval', async () => {
    const confirmWindowsAction = vi.fn(async () => true)
    const runWindowsAction = vi.fn(async (argv: string[], _options?: unknown) => ({
      argv,
      exitCode: 0,
      output: { status: 'completed', result: { performed: true } },
      stderr: '',
    }))
    const runtime = createComputerUseRuntime({ ...settings, confirmWindowsAction, runWindowsAction })
    try {
      const first = ['invoke', 'input.typeText', 'BONG QA only', '777', 'BONG QA Scratch']
      const second = ['invoke', 'input.clickPoint', '25', '50', '777', 'BONG QA Scratch']
      expect((await runtime.run({ argv: first })).exitCode).toBe(0)
      expect((await runtime.run({ argv: second })).exitCode).toBe(0)
      expect(confirmWindowsAction).toHaveBeenCalledTimes(2)
      expect(confirmWindowsAction).toHaveBeenNthCalledWith(1, 'Nhập 12 ký tự vào cửa sổ "BONG QA Scratch" (HWND 777): "BONG QA only"', first)
      expect(confirmWindowsAction).toHaveBeenNthCalledWith(2, 'Nhấp chuột tại X=25, Y=50 trong cửa sổ "BONG QA Scratch" (HWND 777)', second)
      expect(runWindowsAction).toHaveBeenCalledTimes(2)
      expect(runWindowsAction.mock.calls[0][0]).toEqual(first)
      expect(runWindowsAction.mock.calls[1][0]).toEqual(second)
      expect(runWindowsAction.mock.calls[0][1]).toMatchObject({ approved: true })
    }
    finally {
      await runtime.dispose()
    }
  })

  it('rejects malformed or unsupported input before asking the user, and denies on dialog failure', async () => {
    const confirmWindowsAction = vi.fn(async () => true)
    const runWindowsAction = vi.fn()
    const runtime = createComputerUseRuntime({ ...settings, confirmWindowsAction, runWindowsAction })
    try {
      await expect(runtime.run({ argv: ['invoke', 'input.typeText', ''] })).rejects.toThrow('requires text')
      await expect(runtime.run({ argv: ['invoke', 'input.typeText', 'sample without a target'] })).rejects.toThrow('window handle')
      await expect(runtime.run({ argv: ['invoke', 'input.key', 'win+r'] })).rejects.toThrow('Unsupported')
      expect(confirmWindowsAction).not.toHaveBeenCalled()
      expect(runWindowsAction).not.toHaveBeenCalled()
    }
    finally {
      await runtime.dispose()
    }
    const failing = createComputerUseRuntime({
      ...settings,
      confirmWindowsAction: async () => { throw new Error('dialog closed unexpectedly') },
      runWindowsAction,
    })
    try {
      const result = await failing.run({ argv: ['invoke', 'input.key', 'tab'] })
      expect(result.output).toMatchObject({ failure: { code: 'approval_denied' } })
      expect(runWindowsAction).not.toHaveBeenCalled()
    }
    finally {
      await failing.dispose()
    }
  })
})
