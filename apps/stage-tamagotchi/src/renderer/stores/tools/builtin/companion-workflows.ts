import type {
  CompanionApprovalRisk,
  CompanionWorkflow,
} from '@proj-airi/stage-ui/stores/character/notebook'
import type { Tool } from '@xsai/shared-chat'

import { useCharacterNotebookStore } from '@proj-airi/stage-ui/stores/character/notebook'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { computerUseRequiresApproval } from './computer-use'

const approvalRiskSchema = z.enum(['medium', 'high', 'critical'])
const workflowRecurrenceSchema = z.discriminatedUnion('type', [
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
    url: z.string().url().max(2048),
  }),
  z.object({
    type: z.literal('open-path'),
    path: z.string().min(1).max(1024),
  }),
  z.object({
    type: z.literal('open-vscode-workspace'),
    path: z.string().min(1).max(1024),
  }),
])

const workflowStepSchema = z.object({
  title: z.string().min(1).max(160),
  details: z.string().max(800).optional(),
  risk: approvalRiskSchema.optional(),
  action: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('safe-action'),
      action: safeActionSchema,
    }),
    z.object({
      type: z.literal('computer-use'),
      argv: z.array(z.string().min(1).max(500)).min(2).max(40),
    }),
  ]),
})
const createWorkflowParams = z.object({
  goal: z.string().min(1).max(500).describe('The user-delegated end goal.'),
  summary: z.string().max(1000).optional().describe('Short explanation of the plan.'),
  steps: z.array(workflowStepSchema).min(1).max(12),
  recurrence: workflowRecurrenceSchema.optional().describe('Optional recurring schedule in the PC local timezone.'),
  runNow: z.boolean().optional().default(false).describe('When recurrence is set, run the first cycle immediately instead of waiting for the first scheduled time.'),
})

const listWorkflowParams = z.object({
  status: z.enum(['open', 'scheduled', 'queued', 'running', 'waiting-approval', 'paused', 'completed', 'failed', 'cancelled', 'all']).default('open'),
})

const workflowIdParams = z.object({
  workflowId: z.string().min(1),
})

function effectiveRisk(requested: CompanionApprovalRisk | undefined, requiresApproval: boolean): CompanionApprovalRisk {
  if (!requiresApproval)
    return 'medium'
  return requested === 'critical' ? 'critical' : 'high'
}

function serializeWorkflow(workflow: CompanionWorkflow) {
  return {
    id: workflow.id,
    goal: workflow.goal,
    summary: workflow.summary,
    status: workflow.status,
    currentStepIndex: workflow.currentStepIndex,
    currentStepNumber: Math.min(workflow.currentStepIndex + 1, workflow.steps.length),
    totalSteps: workflow.steps.length,
    lastError: workflow.lastError,
    recurrence: workflow.recurrence,
    nextRunAt: typeof workflow.nextRunAt === 'number' ? new Date(workflow.nextRunAt).toISOString() : undefined,
    runsCompleted: workflow.runsCompleted ?? 0,
    revisionCount: workflow.revisionCount ?? 0,
    lastEvaluation: workflow.lastEvaluation,
    lastEvaluatedAt: typeof workflow.lastEvaluatedAt === 'number' ? new Date(workflow.lastEvaluatedAt).toISOString() : undefined,
    createdAt: new Date(workflow.createdAt).toISOString(),
    updatedAt: new Date(workflow.updatedAt).toISOString(),
    completedAt: typeof workflow.completedAt === 'number' ? new Date(workflow.completedAt).toISOString() : undefined,
    steps: workflow.steps.map((step, index) => ({
      id: step.id,
      number: index + 1,
      title: step.title,
      details: step.details,
      status: step.status,
      action: step.action,
      requiresApproval: step.requiresApproval,
      approvalRisk: step.approvalRisk,
      approvalId: step.approvalId,
      lastResult: step.lastResult,
    })),
  }
}

export async function executeCreateCompanionWorkflow(
  input: z.input<typeof createWorkflowParams>,
  options?: unknown,
) {
  const internal = options as { metadata?: Record<string, unknown> } | undefined
  const notebook = useCharacterNotebookStore()

  const steps = input.steps.map((step) => {
    if (step.action.type === 'safe-action') {
      return {
        title: step.title.trim(),
        details: step.details?.trim() || undefined,
        action: step.action,
        requiresApproval: false,
        approvalRisk: 'medium' as const,
      }
    }

    if (step.action.argv[0] !== 'invoke')
      throw new Error('Every computer-use workflow step must start with argv ["invoke", ...].')

    const requiresApproval = computerUseRequiresApproval(step.action.argv)
    return {
      title: step.title.trim(),
      details: step.details?.trim() || undefined,
      action: step.action,
      requiresApproval,
      approvalRisk: effectiveRisk(step.risk, requiresApproval),
    }
  })

  const workflow = notebook.createWorkflow({
    goal: input.goal.trim(),
    summary: input.summary?.trim() || undefined,
    steps,
    recurrence: input.recurrence,
    runNow: input.runNow ?? false,
    metadata: {
      createdBy: 'airi-chat-tool',
      ...internal?.metadata,
    },
  })
  return JSON.stringify({
    ok: true,
    workflow: serializeWorkflow(workflow),
    message: workflow.status === 'scheduled'
      ? 'The recurring workflow is scheduled persistently. Each completed cycle will schedule the next one; state-changing steps still require explicit approval.'
      : 'The multi-step workflow is queued. Read-only and safe steps may run automatically; state-changing computer-use steps will pause for explicit approval.',
  })
}

export async function executeListCompanionWorkflows(input: z.input<typeof listWorkflowParams>) {
  const notebook = useCharacterNotebookStore()
  const status = input.status ?? 'open'
  const workflows = notebook.workflows.filter((workflow) => {
    if (status === 'all')
      return true
    if (status === 'open')
      return !['completed', 'cancelled'].includes(workflow.status)
    return workflow.status === status
  })

  return JSON.stringify({
    count: workflows.length,
    workflows: workflows
      .toSorted((a, b) => b.updatedAt - a.updatedAt)
      .map(serializeWorkflow),
  })
}

export async function executeCancelCompanionWorkflow(input: z.input<typeof workflowIdParams>) {
  const notebook = useCharacterNotebookStore()
  const workflow = notebook.cancelWorkflow(input.workflowId)
  if (!workflow)
    throw new Error('Workflow not found.')

  return JSON.stringify({
    ok: true,
    workflow: serializeWorkflow(workflow),
  })
}

export async function executeResumeCompanionWorkflow(input: z.input<typeof workflowIdParams>) {
  const notebook = useCharacterNotebookStore()
  const existing = notebook.workflows.find(workflow => workflow.id === input.workflowId)
  if (!existing)
    throw new Error('Workflow not found.')
  if (existing.status !== 'paused' && existing.status !== 'failed')
    throw new Error('Only a paused or failed workflow can be resumed.')

  const workflow = notebook.resumeWorkflow(input.workflowId)!
  return JSON.stringify({
    ok: true,
    workflow: serializeWorkflow(workflow),
  })
}
const tools: Promise<Tool>[] = [
  tool({
    name: 'companion_workflow_create',
    description: [
      'Create a persistent multi-step desktop workflow for a goal the user explicitly delegated to AIRI. The workflow may also repeat by interval, daily, or weekly schedule.',
      'Plan the known steps in order. Use safe-action for opening an HTTP/HTTPS URL, non-executable path, or a local VS Code workspace.',
      'Use computer-use for desktop inspection or interaction. Read-only computer-use steps run automatically.',
      'State-changing steps are automatically classified by code and will stop for explicit user approval before execution.',
      'After a state-changing step, include a read-only scan/capture verification step when the result can be checked on screen.',
      'Never store passwords, OTPs, API keys, payment credentials, or other secrets inside workflow steps.',
    ].join(' '),
    execute: executeCreateCompanionWorkflow,
    parameters: createWorkflowParams,
  }),
  tool({
    name: 'companion_workflow_list',
    description: 'List persistent multi-step workflows with progress, step states, approval requirements, and results.',
    execute: executeListCompanionWorkflows,
    parameters: listWorkflowParams,
  }),
  tool({
    name: 'companion_workflow_cancel',
    description: 'Cancel a workflow and invalidate any pending or approved-but-not-yet-executed permissions belonging to it.',
    execute: executeCancelCompanionWorkflow,
    parameters: workflowIdParams,
  }),
  tool({
    name: 'companion_workflow_resume',
    description: 'Resume a paused or failed workflow from its current step after the user has resolved the problem.',
    execute: executeResumeCompanionWorkflow,
    parameters: workflowIdParams,
  }),
]

export const companionWorkflowTools = async () => Promise.all(tools)
