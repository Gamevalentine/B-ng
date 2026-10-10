import type { Tool } from '@xsai/shared-chat'

import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function executableTool(name: string): Tool {
  return {
    type: 'function',
    function: {
      name,
      parameters: { type: 'object', properties: {} },
    },
    execute: vi.fn(),
  }
}

vi.mock('./builtin/image-journal', () => ({
  imageJournalTools: vi.fn(async () => [executableTool('image_journal')]),
}))
vi.mock('./builtin/weather', () => ({
  weatherTools: vi.fn(async () => [executableTool('get_weather')]),
}))
vi.mock('./builtin/widgets', () => ({
  widgetsTools: vi.fn(async () => [executableTool('stage_widgets')]),
}))

describe('useTamagotchiBuiltinToolsStore', async () => {
  const { useTamagotchiBuiltinToolsStore } = await import('./built-in')

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps public weather available by default while other tools remain request-selected', async () => {
    const toolsStore = useLlmToolsStore()

    await useTamagotchiBuiltinToolsStore().refresh()

    expect(toolsStore.activeTools.map(tool => tool.function.name)).toContain('get_weather')
    expect(toolsStore.activeTools.map(tool => tool.function.name)).not.toContain('computer_use')
    expect(toolsStore.tools.find(tool => tool.id === 'tamagotchi:get_weather')?.defaultActive).toBe(true)
    expect(toolsStore.tools.find(tool => tool.id === 'tamagotchi:image_journal')?.defaultActive).toBe(false)
    expect(toolsStore.tools.find(tool => tool.id === 'tamagotchi:stage_widgets')?.defaultActive).toBe(false)
    expect(toolsStore.tools.filter(tool => tool.requiresExplicitSelection).map(tool => tool.function.name)).toEqual(['computer_use', 'computer_use_read_image'])
    expect(toolsStore.getToolsByNames('get_weather')[0]?.function.name).toBe('get_weather')
  })
})
