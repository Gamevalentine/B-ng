import { describe, expect, it, vi } from 'vitest'

import { describeWindowsComputerUseAction, runWindowsComputerUse, supportsWindowsComputerUse, windowsActionRequiresApproval, windowsComputerUseTimeoutMs } from './windows-bridge'

describe('windows computer-use bridge validation', () => {
  const options = { storeRoot: 'E:/BONG_DATA/computer-use' }

  it('gives explicit Windows confirmations time without delaying read-only requests', () => {
    expect(windowsComputerUseTimeoutMs(['invoke', 'input.key', 'tab'])).toBe(120_000)
    expect(windowsComputerUseTimeoutMs(['invoke', 'input.typeText', 'hello'])).toBe(120_000)
    expect(windowsComputerUseTimeoutMs(['invoke', 'input.clickPoint', '10', '20'])).toBe(120_000)
    expect(windowsComputerUseTimeoutMs(['invoke', 'window.list'])).toBe(20_000)
    expect(windowsComputerUseTimeoutMs(['invoke', 'display.capture'])).toBe(20_000)
  })

  it('requires a stable target window identity before typing any text', () => {
    expect(() => describeWindowsComputerUseAction(['invoke', 'input.typeText', 'hello'])).toThrow('window handle')
    expect(() => describeWindowsComputerUseAction(['invoke', 'input.typeText', 'hello', '0', 'Scratch'])).toThrow('Out-of-range')
    expect(describeWindowsComputerUseAction(['invoke', 'input.typeText', 'hello', '12345', 'BÔNG QA Scratch']))
      .toBe('Nhập 5 ký tự vào cửa sổ "BÔNG QA Scratch" (HWND 12345): "hello"')
  })

  it('returns explicit uncertainty when the native confirmation process times out', async () => {
    const out = await runWindowsComputerUse(['invoke', 'input.key', 'tab'], {
      ...options,
      approved: true,
      execPowerShell: async () => { throw Object.assign(new Error('timed out'), { killed: true, code: 'ETIMEDOUT', stdout: '', stderr: '#< CLIXML' }) },
    })
    expect(out.exitCode).toBe(1)
    expect(out.output).toMatchObject({ failure: { code: 'windows_command_timeout' } })
    expect(out.stderr).toBe('')
  })

  it('supports only explicitly recognized read-only operations', () => {
    expect(supportsWindowsComputerUse(['invoke', 'window.list'])).toBe(true)
    expect(supportsWindowsComputerUse(['invoke', 'display.list'])).toBe(true)
    expect(supportsWindowsComputerUse(['invoke', 'display.capture'])).toBe(true)
    expect(supportsWindowsComputerUse(['invoke', 'screen.captureRegion', '0', '0', '200', '100'])).toBe(true)
    expect(supportsWindowsComputerUse(['invoke', 'input.clickPoint', '100', '200'])).toBe(true)
    expect(supportsWindowsComputerUse(['invoke', 'input.typeText', 'hello'])).toBe(true)
    expect(supportsWindowsComputerUse(['invoke', 'input.key', 'ctrl+s'])).toBe(true)
    expect(windowsActionRequiresApproval(['invoke', 'input.clickPoint', '100', '200'])).toBe(true)
    expect(windowsActionRequiresApproval(['invoke', 'display.capture'])).toBe(false)
    expect(supportsWindowsComputerUse(['shell', 'window.list'])).toBe(false)
  })

  it('rejects unexpected arguments without starting a process', async () => {
    const run = vi.fn()
    const config = { ...options, execPowerShell: run }
    await expect(runWindowsComputerUse(['invoke', 'window.list', '--bad-flag'], config)).rejects.toThrow('does not accept')
    await expect(runWindowsComputerUse(['invoke', 'window.findText'], config)).rejects.toThrow('search term')
    await expect(runWindowsComputerUse(['invoke', 'screen.captureRegion', '1', '2', '0', '200'], config)).rejects.toThrow('Out-of-range')
    await expect(runWindowsComputerUse(['invoke', 'screen.captureRegion', '1', '2', '20000', '20'], config)).rejects.toThrow('Out-of-range')
    await expect(runWindowsComputerUse(['invoke', 'input.clickPoint', '100', '200'], config)).rejects.toThrow('approved')
    await expect(runWindowsComputerUse(['invoke', 'input.typeText', 'hello'], config)).rejects.toThrow('approved')
    await expect(runWindowsComputerUse(['invoke', 'input.key', 'ctrl+s'], config)).rejects.toThrow('approved')
    await expect(runWindowsComputerUse(['invoke', 'input.key', 'win+r'], { ...config, approved: true })).rejects.toThrow('Unsupported Windows shortcut')
    expect(run).not.toHaveBeenCalled()
  })

  it('stages a user-approved input action without executing it in tests', async () => {
    const invoke = vi.fn(async () => ({ stdout: '{"status":"completed","result":{"performed":true}}', stderr: '' }))
    const result = await runWindowsComputerUse(['invoke', 'input.clickPoint', '100', '200', '777', 'BONG QA Scratch'], {
      ...options,
      approved: true,
      execPowerShell: invoke,
    })
    expect(result.exitCode).toBe(0)
    expect(invoke).toHaveBeenCalledOnce()
  })

  it('accepts JSON output from a trusted PowerShell process and fails closed for malformed output', async () => {
    const ok = await runWindowsComputerUse(['invoke', 'display.list'], {
      ...options,
      execPowerShell: async () => ({ stdout: '{"status":"completed","result":[{"primary":true}]}', stderr: '' }),
    })
    expect(ok.exitCode).toBe(0)
    expect(ok.output).toEqual({ status: 'completed', result: [{ primary: true }] })
    const failed = await runWindowsComputerUse(['invoke', 'window.list'], {
      ...options,
      execPowerShell: async () => ({ stdout: 'garbage', stderr: 'parse error' }),
    })
    expect(failed.exitCode).toBe(1)
  })
})
