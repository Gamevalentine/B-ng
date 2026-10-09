import { describe, expect, it } from 'vitest'

import { computerUseRequiresApproval } from './computer-use'

describe('computer-use approval gate', () => {
  it('allows help and real AUV read-only inspection commands', () => {
    expect(computerUseRequiresApproval(['invoke', '--help'])).toBe(false)
    expect(computerUseRequiresApproval(['invoke', 'display.capture'])).toBe(false)
    expect(computerUseRequiresApproval(['invoke', 'display.list', '--json'])).toBe(false)
    expect(computerUseRequiresApproval(['invoke', 'screen.findText', 'Settings', '--json'])).toBe(false)
    expect(computerUseRequiresApproval(['invoke', 'screen.waitForText', 'Ready', '--json'])).toBe(false)
    expect(computerUseRequiresApproval(['invoke', 'window.list', '--json'])).toBe(false)
    expect(computerUseRequiresApproval(['invoke', 'window.findText', 'Settings', '--json'])).toBe(false)
    expect(computerUseRequiresApproval(['invoke', 'mediaControl.nowPlaying', '--json'])).toBe(false)
    expect(computerUseRequiresApproval(['invoke', 'ocr.read'])).toBe(false)
    expect(computerUseRequiresApproval(['invoke', 'scan.windows'])).toBe(false)
  })

  it('requires approval for real AUV state-changing actions', () => {
    expect(computerUseRequiresApproval(['invoke', 'screen.clickText', 'Continue'])).toBe(true)
    expect(computerUseRequiresApproval(['invoke', 'input.clickPoint', '100', '100'])).toBe(true)
    expect(computerUseRequiresApproval(['invoke', 'input.typeText', 'hello'])).toBe(true)
    expect(computerUseRequiresApproval(['invoke', 'input.key', 'ctrl+s'])).toBe(true)
    expect(computerUseRequiresApproval(['invoke', 'mediaControl.play'])).toBe(true)
  })

  it('fails closed for unknown command shapes', () => {
    expect(computerUseRequiresApproval([])).toBe(true)
    expect(computerUseRequiresApproval(['something-else'])).toBe(true)
  })
})
