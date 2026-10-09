import type { CompanionApprovalRequest } from '@proj-airi/stage-ui/stores/character/notebook'
import type { Tool } from '@xsai/shared-chat'

import { useCharacterNotebookStore } from '@proj-airi/stage-ui/stores/character/notebook'
import { tool } from '@xsai/tool'
import { z } from 'zod'

const approvalRiskSchema = z.enum(['medium', 'high', 'critical'])

const computerUseActionSchema = z.object({
  type: z.literal('computer-use'),
  argv: z.array(z.string().min(1).max(500)).min(2).max(40),
})

const requestApprovalParams = z.object({
  title: z.string().min(1).max(160).describe('Short Vietnamese-friendly summary of the action that needs permission.'),
  reason: z.string().max(800).optional().describe('Why this action is needed and what it will change.'),
  risk: approvalRiskSchema.default('high'),
  action: computerUseActionSchema,
})

const listApprovalsParams = z.object({
  status: z.enum(['pending', 'approved', 'executing', 'rejected', 'completed', 'failed', 'expired', 'all']).default('pending'),
})

function serializeApproval(approval: CompanionApprovalRequest) {
  return {
    id: approval.id,
    title: approval.title,
    reason: approval.reason,
    risk: approval.risk,
    status: approval.status,
    action: approval.action,
    workflowId: approval.workflowId,
    workflowStepId: approval.workflowStepId,
    createdAt: new Date(approval.createdAt).toISOString(),
    updatedAt: new Date(approval.updatedAt).toISOString(),
    resolvedAt: typeof approval.resolvedAt === 'number' ? new Date(approval.resolvedAt).toISOString() : undefined,
    expiresAt: typeof approval.expiresAt === 'number' ? new Date(approval.expiresAt).toISOString() : undefined,
    executionStartedAt: typeof approval.executionStartedAt === 'number' ? new Date(approval.executionStartedAt).toISOString() : undefined,
    executedAt: typeof approval.executedAt === 'number' ? new Date(approval.executedAt).toISOString() : undefined,
    result: approval.result,
  }
}

export async function executeRequestCompanionApproval(input: z.input<typeof requestApprovalParams>) {
  if (input.action.argv[0] !== 'invoke')
    throw new Error('computer-use approval actions must start with argv ["invoke", ...].')

  const notebook = useCharacterNotebookStore()
  const approval = notebook.requestApproval({
    title: input.title.trim(),
    reason: input.reason?.trim() || undefined,
    risk: input.risk ?? 'high',
    action: {
      type: 'computer-use',
      argv: input.action.argv,
    },
  })

  return JSON.stringify({
    ok: true,
    approval: serializeApproval(approval),
    message: 'Approval requested. The action will not run until the user explicitly approves it in AIRI settings.',
  })
}

export async function executeListCompanionApprovals(input: z.input<typeof listApprovalsParams>) {
  const notebook = useCharacterNotebookStore()
  const status = input.status ?? 'pending'
  const approvals = notebook.approvals
    .filter(approval => status === 'all' || approval.status === status)
    .toSorted((a, b) => b.updatedAt - a.updatedAt)

  return JSON.stringify({
    count: approvals.length,
    approvals: approvals.map(serializeApproval),
  })
}

const tools: Promise<Tool>[] = [
  tool({
    name: 'companion_approval_request',
    description: [
      'Request explicit user approval before a state-changing desktop action.',
      'Use this instead of computer_use when the action clicks, types, changes app/window state, submits data, or otherwise has side effects.',
      'The request only queues the proposed argv and never approves or executes it.',
      'Describe the action clearly because the user will review the exact argv before approving.',
    ].join(' '),
    execute: executeRequestCompanionApproval,
    parameters: requestApprovalParams,
  }),
  tool({
    name: 'companion_approval_list',
    description: 'List approval requests and their current state. This tool is read-only and cannot approve a request.',
    execute: executeListCompanionApprovals,
    parameters: listApprovalsParams,
  }),
]

export const companionApprovalTools = async () => Promise.all(tools)
