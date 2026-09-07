import type { ExecutableTool } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import type { ChatToolReference } from '@proj-airi/stage-ui/types/chat'

import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { defineStore } from 'pinia'

import { imageJournalTools } from './builtin/image-journal'
import { reminderTools } from './builtin/reminders'
import { weatherTools } from './builtin/weather'
import { widgetsTools } from './builtin/widgets'

export const widgetToolReferences = [
  { name: 'stage_widgets' },
  { name: 'get_weather' },
] satisfies ChatToolReference[]

export const reminderToolReferences = [
  { name: 'set_reminder' },
  { name: 'list_reminders' },
  { name: 'cancel_reminder' },
] satisfies ChatToolReference[]

export const artistryToolReferences = [
  { name: 'image_journal' },
  ...widgetToolReferences,
  ...reminderToolReferences,
] satisfies ChatToolReference[]

const reminderToolNames = new Set(reminderToolReferences.map(tool => tool.name))

export const useTamagotchiBuiltinToolsStore = defineStore('tamagotchi-builtin-tools', () => {
  const llmToolsStore = useLlmToolsStore()
  const toolIdPrefix = 'tamagotchi:'

  function registeredToolIds() {
    return llmToolsStore.tools
      .filter(tool => tool.id.startsWith(toolIdPrefix))
      .map(tool => tool.id)
  }

  async function refresh() {
    const tools = (await Promise.all([
      imageJournalTools(),
      widgetsTools(),
      weatherTools(),
      reminderTools(),
    ])).flat()

    llmToolsStore.removeToolsByIds(...registeredToolIds())
    llmToolsStore.addTools(...tools.map(tool => ({
      ...tool,
      defaultActive: reminderToolNames.has(tool.function.name),
      id: `${toolIdPrefix}${tool.function.name}`,
    } satisfies ExecutableTool)))
  }

  return { refresh }
}, {
  synced: {
    actions: ['refresh'],
    state: false,
  },
})
