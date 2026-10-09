import { describe, expect, it } from 'vitest'

import { clampBoundsWithinRect } from './display'

describe('bÔNG floating window work-area placement', () => {
  it('recovers a companion submerged below the Windows taskbar', () => {
    const workArea = { x: 0, y: 0, width: 1280, height: 672 }
    const safeArea = { ...workArea, height: workArea.height - 16 }
    const current = { x: 949, y: 427, width: 311, height: 369 }

    expect(clampBoundsWithinRect(current, safeArea)).toEqual({
      x: 949,
      y: 287,
      width: 311,
      height: 369,
    })
  })

  it('preserves an already safe position on another monitor', () => {
    const monitor = { x: 1920, y: 0, width: 1920, height: 1032 }
    const windowBounds = { x: 3400, y: 590, width: 300, height: 350 }

    expect(clampBoundsWithinRect(windowBounds, { ...monitor, height: monitor.height - 16 })).toEqual(windowBounds)
  })
})
