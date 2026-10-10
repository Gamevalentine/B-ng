import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'

import { toIpcSafeComputerUseArgv } from './computer-use-ipc'

describe('computer-use IPC serialization', () => {
  it('converts a reactive approval argv into a structured-clone-safe array', () => {
    const reactiveAction = reactive({ argv: ['invoke', 'input.key', 'tab'] })
    expect(() => structuredClone({ argv: reactiveAction.argv, approved: true })).toThrow()
    const payload = { argv: toIpcSafeComputerUseArgv(reactiveAction.argv), approved: true }
    expect(structuredClone(payload)).toEqual({ argv: ['invoke', 'input.key', 'tab'], approved: true })
    expect(payload.argv).not.toBe(reactiveAction.argv)
  })

  it('preserves the original command sequence without altering it', () => {
    const original = reactive(['invoke', 'display.capture'])
    const clone = toIpcSafeComputerUseArgv(original)
    clone.push('--json')
    expect(original).toEqual(['invoke', 'display.capture'])
    expect(clone).toEqual(['invoke', 'display.capture', '--json'])
  })
})
