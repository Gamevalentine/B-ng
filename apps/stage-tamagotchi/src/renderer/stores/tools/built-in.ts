import type { ExecutableTool } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import type { ChatToolReference } from '@proj-airi/stage-ui/types/chat'

import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { defineStore } from 'pinia'

import { companionApprovalTools } from './builtin/companion-approvals'
import { companionIntegrationTools } from './builtin/companion-integrations'
import { companionTaskTools } from './builtin/companion-tasks'
import { companionWorkflowTools } from './builtin/companion-workflows'
import { computerUseTools } from './builtin/computer-use'
import { imageJournalTools } from './builtin/image-journal'
import { weatherTools } from './builtin/weather'
import { widgetsTools } from './builtin/widgets'

export const companionTaskToolReferences = [
  { name: 'companion_task_create' },
  { name: 'companion_task_list' },
  { name: 'companion_task_complete' },
  { name: 'companion_task_reschedule' },
] satisfies ChatToolReference[]

export const companionApprovalToolReferences = [
  { name: 'companion_approval_request' },
  { name: 'companion_approval_list' },
] satisfies ChatToolReference[]

export const companionWorkflowToolReferences = [
  { name: 'companion_workflow_create' },
  { name: 'companion_workflow_list' },
  { name: 'companion_workflow_cancel' },
  { name: 'companion_workflow_resume' },
] satisfies ChatToolReference[]

export const companionIntegrationToolReferences = [
  { name: 'companion_employee_start' },
  { name: 'companion_employee_run' },
] satisfies ChatToolReference[]

const companionDefaultToolReferences = [
  ...companionTaskToolReferences,
  ...companionApprovalToolReferences,
  ...companionWorkflowToolReferences,
  ...companionIntegrationToolReferences,
] satisfies ChatToolReference[]

export const computerUseToolReferences = [
  { name: 'computer_use' },
  { name: 'computer_use_read_image' },
] satisfies ChatToolReference[]

export const widgetToolReferences = [
  { name: 'stage_widgets' },
  { name: 'get_weather' },
] satisfies ChatToolReference[]

export const artistryToolReferences = [
  { name: 'image_journal' },
  ...widgetToolReferences,
] satisfies ChatToolReference[]

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
      companionTaskTools(),
      companionApprovalTools(),
      companionWorkflowTools(),
      companionIntegrationTools(),
      imageJournalTools(),
      widgetsTools(),
      weatherTools(),
      computerUseTools(),
    ])).flat()

    llmToolsStore.removeToolsByIds(...registeredToolIds())
    llmToolsStore.addTools(...tools.map(tool => ({
      ...tool,
      // Public, read-only weather lookup should be available during normal voice chat.
      defaultActive: tool.function.name === 'get_weather' || companionDefaultToolReferences.some(reference => reference.name === tool.function.name),
      requiresExplicitSelection: computerUseToolReferences.some(reference => reference.name === tool.function.name),
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
