// @vitest-environment jsdom
import { useCharacterNotebookStore } from '@proj-airi/stage-ui/stores/character/notebook'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  executeCancelCompanionWorkflow,
  executeCreateCompanionWorkflow,
  executeListCompanionWorkflows,
  executeResumeCompanionWorkflow,
} from './companion-workflows'

describe('companion workflow tools', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('classifies state-changing computer-use steps as approval-required', async () => {
    const created = JSON.parse(await executeCreateCompanionWorkflow({
      goal: 'Mở trang rồi bấm nút',
      steps: [
        {
          title: 'Mở trang',
          action: {
            type: 'safe-action',
            action: { type: 'open-url', url: 'https://example.com' },
          },
        },
        {
          title: 'Kiểm tra màn hình',
          action: {
            type: 'computer-use',
            argv: ['invoke', 'display.capture'],
          },
        },
        {
          title: 'Bấm nút',
          risk: 'medium',
          action: {
            type: 'computer-use',
            argv: ['invoke', 'input.click', '--x', '10', '--y', '20'],
          },
        },
      ],
    }))

    expect(created.ok).toBe(true)
    expect(created.workflow.steps[0].requiresApproval).toBe(false)
    expect(created.workflow.steps[1].requiresApproval).toBe(false)
    expect(created.workflow.steps[2].requiresApproval).toBe(true)
    expect(created.workflow.steps[2].approvalRisk).toBe('high')

    const notebook = useCharacterNotebookStore()
    expect(notebook.workflows).toHaveLength(1)
    expect(notebook.workflows[0]?.status).toBe('queued')
  })

  it('lists, pauses, resumes and cancels workflow state', async () => {
    const created = JSON.parse(await executeCreateCompanionWorkflow({
      goal: 'Kiểm tra desktop',
      steps: [{
        title: 'Chụp màn hình',
        action: {
          type: 'computer-use',
          argv: ['invoke', 'display.capture'],
        },
      }],
    }))

    const workflowId = created.workflow.id
    const notebook = useCharacterNotebookStore()
    const workflow = notebook.workflows[0]!
    const step = workflow.steps[0]!

    notebook.startWorkflow(workflowId)
    notebook.markWorkflowStepStarted(workflowId, step.id)
    notebook.markWorkflowStepResult(workflowId, step.id, {
      ok: false,
      result: 'temporary failure',
    })

    const paused = JSON.parse(await executeListCompanionWorkflows({ status: 'paused' }))
    expect(paused.count).toBe(1)

    const resumed = JSON.parse(await executeResumeCompanionWorkflow({ workflowId }))
    expect(resumed.workflow.status).toBe('running')
    expect(resumed.workflow.steps[0].status).toBe('pending')

    const cancelled = JSON.parse(await executeCancelCompanionWorkflow({ workflowId }))
    expect(cancelled.workflow.status).toBe('cancelled')
  })

  it('rejects malformed computer-use argv', async () => {
    await expect(executeCreateCompanionWorkflow({
      goal: 'Sai cú pháp',
      steps: [{
        title: 'Sai',
        action: {
          type: 'computer-use',
          argv: ['input.click', '--x', '1'],
        },
      }],
    })).rejects.toThrow('must start with argv')
  })

  it('creates a persistent recurring workflow', async () => {
    const created = JSON.parse(await executeCreateCompanionWorkflow({
      goal: 'Kiểm tra desktop mỗi sáng',
      recurrence: {
        type: 'daily',
        hour: 8,
        minute: 0,
      },
      steps: [{
        title: 'Chụp màn hình',
        action: {
          type: 'computer-use',
          argv: ['invoke', 'display.capture'],
        },
      }],
    }))

    expect(created.workflow.status).toBe('scheduled')
    expect(created.workflow.recurrence).toEqual({
      type: 'daily',
      hour: 8,
      minute: 0,
    })
    expect(created.workflow.nextRunAt).toBeTypeOf('string')
    expect(created.workflow.runsCompleted).toBe(0)
  })
})
