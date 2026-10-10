import type { ScheduledTask, TaskRecurrence } from '@proj-airi/stage-ui/stores/character'
import type { Tool } from '@xsai/shared-chat'

import { useCharacterNotebookStore } from '@proj-airi/stage-ui/stores/character'
import { tool } from '@xsai/tool'
import { z } from 'zod'

const taskPrioritySchema = z.enum(['low', 'normal', 'high', 'critical'])
const taskAutonomySchema = z.enum(['remind', 'safe-auto'])
const taskRecurrenceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('interval'),
    everyMinutes: z.number().int().min(5).max(525_600),
  }),
  z.object({
    type: z.literal('daily'),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
  z.object({
    type: z.literal('weekly'),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
])

const safeActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('open-url'),
    url: z.string().url().max(2048).describe('HTTP/HTTPS URL to open at execution time.'),
  }),
  z.object({
    type: z.literal('open-path'),
    path: z.string().min(1).max(1024).describe('Absolute file or folder path to open at execution time. Executable/script paths are rejected by the desktop safety layer.'),
  }),
  z.object({
    type: z.literal('open-vscode-workspace'),
    path: z.string().min(1).max(1024).describe('Absolute file or folder path to open in VS Code.'),
  }),
])

const createTaskParams = z.object({
  title: z.string().min(1).max(160).describe('Short task title.'),
  details: z.string().max(1000).optional().describe('Optional task details or next action.'),
  priority: taskPrioritySchema.optional().default('normal'),
  dueAt: z.string().optional().describe('Optional ISO 8601 date/time. Omit if the task has no scheduled reminder yet.'),
  autonomy: taskAutonomySchema.optional().default('remind').describe('Use safe-auto only when the user explicitly asked AIRI to perform the safe action automatically without another confirmation.'),
  safeAction: safeActionSchema.optional().describe('Optional non-destructive action. Required for safe-auto tasks.'),
  recurrence: taskRecurrenceSchema.optional().describe('Optional recurring schedule in the PC local timezone. Interval repeats after completion; daily/weekly keep the requested local clock time.'),
})

const listTasksParams = z.object({
  status: z.enum(['open', 'scheduled', 'queued', 'done', 'all']).optional().default('open'),
})

const completeTaskParams = z.object({
  taskId: z.string().min(1).describe('Task id returned by companion_task_list or companion_task_create.'),
})

const rescheduleTaskParams = z.object({
  taskId: z.string().min(1),
  dueAt: z.string().optional().describe('New ISO 8601 date/time for the next occurrence.'),
  recurrence: taskRecurrenceSchema.nullable().optional().describe('Set or replace recurrence. Pass null to stop recurrence; with no dueAt this returns the task to the unscheduled queue.'),
  reason: z.string().max(500).optional(),
})

function parseDueAt(value?: string) {
  if (!value?.trim())
    return undefined

  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp))
    throw new Error('dueAt must be a valid ISO 8601 date/time.')
  return timestamp
}

function serializeTask(task: ScheduledTask) {
  return {
    id: task.id,
    title: task.title,
    details: task.details,
    priority: task.priority,
    status: task.status,
    autonomy: task.autonomy ?? 'remind',
    safeAction: task.safeAction,
    recurrence: task.recurrence,
    occurrencesCompleted: task.occurrencesCompleted ?? 0,
    dueAt: typeof task.dueAt === 'number' ? new Date(task.dueAt).toISOString() : undefined,
    lastRunAt: typeof task.lastRunAt === 'number' ? new Date(task.lastRunAt).toISOString() : undefined,
    lastRunResult: task.lastRunResult,
    createdAt: new Date(task.createdAt).toISOString(),
    updatedAt: new Date(task.updatedAt).toISOString(),
  }
}

export async function executeCreateCompanionTask(input: z.input<typeof createTaskParams>) {
  const autonomy = input.autonomy ?? 'remind'
  if (autonomy === 'safe-auto' && !input.safeAction)
    throw new Error('safe-auto tasks require a safeAction.')

  if (input.safeAction && autonomy !== 'safe-auto')
    throw new Error('safeAction is only allowed when autonomy is safe-auto.')

  const notebook = useCharacterNotebookStore()
  const task = notebook.scheduleTask({
    title: input.title.trim(),
    details: input.details?.trim() || undefined,
    priority: input.priority ?? 'normal',
    autonomy,
    safeAction: input.safeAction,
    recurrence: input.recurrence as TaskRecurrence | undefined,
    dueAt: parseDueAt(input.dueAt),
    metadata: {
      createdBy: 'airi-chat-tool',
    },
  })

  return JSON.stringify({
    ok: true,
    task: serializeTask(task),
  })
}

export async function executeListCompanionTasks(input: z.infer<typeof listTasksParams>) {
  const notebook = useCharacterNotebookStore()
  const tasks = notebook.tasks.filter((task) => {
    switch (input.status) {
      case 'all':
        return true
      case 'done':
        return task.status === 'done'
      case 'scheduled':
        return task.status === 'scheduled'
      case 'queued':
        return task.status === 'queued'
      case 'open':
      default:
        return task.status !== 'done' && task.status !== 'dropped'
    }
  })

  return JSON.stringify({
    count: tasks.length,
    tasks: tasks
      .toSorted((a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER))
      .map(serializeTask),
  })
}

export async function executeCompleteCompanionTask(input: z.infer<typeof completeTaskParams>) {
  const notebook = useCharacterNotebookStore()
  const task = notebook.tasks.find(item => item.id === input.taskId)
  if (!task)
    throw new Error('Task not found.')

  notebook.markTaskDone(input.taskId)
  const updated = notebook.tasks.find(item => item.id === input.taskId)!
  return JSON.stringify({
    ok: true,
    task: serializeTask(updated),
  })
}

export async function executeRescheduleCompanionTask(input: z.infer<typeof rescheduleTaskParams>) {
  const notebook = useCharacterNotebookStore()
  if (!notebook.tasks.some(item => item.id === input.taskId))
    throw new Error('Task not found.')

  notebook.requeueTask(input.taskId, {
    dueAt: parseDueAt(input.dueAt),
    recurrence: input.recurrence as TaskRecurrence | null | undefined,
    reason: input.reason?.trim() || undefined,
  })

  const updated = notebook.tasks.find(item => item.id === input.taskId)!
  return JSON.stringify({
    ok: true,
    task: serializeTask(updated),
  })
}

const tools: Promise<Tool>[] = [
  tool({
    name: 'companion_task_create',
    description: 'Create a persistent personal task. It can be one-time or recurring (interval, daily, weekly in the PC local timezone). Use autonomy=safe-auto only when the user explicitly asked AIRI to run the safe action automatically; safe-auto is intentionally limited to opening an HTTP/HTTPS URL, a non-executable file/folder path, or a local VS Code workspace. If recurrence is provided without dueAt, AIRI calculates the first occurrence automatically.',
    execute: executeCreateCompanionTask,
    parameters: createTaskParams,
  }),
  tool({
    name: 'companion_task_list',
    description: 'List persistent personal tasks and their ids/status/due times.',
    execute: executeListCompanionTasks,
    parameters: listTasksParams,
  }),
  tool({
    name: 'companion_task_complete',
    description: 'Mark a persistent personal task as done.',
    execute: executeCompleteCompanionTask,
    parameters: completeTaskParams,
  }),
  tool({
    name: 'companion_task_reschedule',
    description: 'Reschedule the next occurrence and optionally set, replace, or clear recurrence. Pass recurrence=null and omit dueAt to stop recurrence and return the task to the unscheduled queue.',
    execute: executeRescheduleCompanionTask,
    parameters: rescheduleTaskParams,
  }),
]

export const companionTaskTools = async () => Promise.all(tools)
