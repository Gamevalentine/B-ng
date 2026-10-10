// @vitest-environment jsdom
import { useCharacterNotebookStore } from '@proj-airi/stage-ui/stores/character/notebook'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  executeStartEmployeeRunner,
  executeStartEmployeeSession,
} from './companion-integrations'

describe('companion employee integrations', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('starts Gmail using the existing browser session', async () => {
    const created = JSON.parse(await executeStartEmployeeSession({
      target: 'gmail',
      objective: 'Kiểm tra thư quan trọng hôm nay',
      runNow: true,
    }))

    expect(created.target).toBe('gmail')
    expect(created.workflow.status).toBe('queued')
    expect(created.workflow.goal).toContain('[Gmail]')
    expect(created.workflow.steps[0].action).toEqual({
      type: 'safe-action',
      action: {
        type: 'open-url',
        url: 'https://mail.google.com/',
      },
    })

    const notebook = useCharacterNotebookStore()
    expect(notebook.workflows).toHaveLength(1)
    expect(notebook.workflows[0]?.metadata).toMatchObject({
      employeeIntegration: true,
      employeeTarget: 'gmail',
      employeeTargetName: 'Gmail',
      employeeAllowedHosts: ['mail.google.com'],
      employeePlaybookVersion: 1,
    })
  })

  it('creates a recurring Google Calendar employee routine', async () => {
    const created = JSON.parse(await executeStartEmployeeSession({
      target: 'google-calendar',
      objective: 'Kiểm tra lịch ngày mai và nhắc việc cần chuẩn bị',
      recurrence: {
        type: 'daily',
        hour: 20,
        minute: 0,
      },
      runNow: false,
    }))

    expect(created.workflow.status).toBe('scheduled')
    expect(created.workflow.recurrence).toEqual({
      type: 'daily',
      hour: 20,
      minute: 0,
    })
    expect(created.workflow.nextRunAt).toBeTypeOf('string')
  })

  it('limits GitHub sessions to github.com', async () => {
    await expect(executeStartEmployeeSession({
      target: 'github',
      objective: 'Kiểm tra issue',
      url: 'https://example.com/not-github',
      runNow: true,
    })).rejects.toThrow('only accept HTTPS github.com URLs')

    const created = JSON.parse(await executeStartEmployeeSession({
      target: 'github',
      objective: 'Kiểm tra issue mới',
      url: 'https://github.com/code-ai3/airi/issues',
      runNow: true,
    }))

    expect(created.workflow.steps[0].action.action.url).toBe('https://github.com/code-ai3/airi/issues')

    const notebook = useCharacterNotebookStore()
    expect(notebook.workflows[0]?.metadata).toMatchObject({
      employeeTarget: 'github',
      employeeAllowedHosts: ['github.com', 'www.github.com'],
    })
  })

  it('requires an HTTP/HTTPS URL for generic browser work', async () => {
    await expect(executeStartEmployeeSession({
      target: 'browser',
      objective: 'Đọc trang',
      runNow: true,
    })).rejects.toThrow('requires url')

    await expect(executeStartEmployeeSession({
      target: 'browser',
      objective: 'Đọc trang',
      url: 'ftp://example.com/file',
      runNow: true,
    })).rejects.toThrow('only accept HTTP/HTTPS URLs')

    const created = JSON.parse(await executeStartEmployeeSession({
      target: 'browser',
      objective: 'Theo dõi trạng thái hệ thống',
      url: 'https://status.example.com/dashboard',
      runNow: true,
    }))

    expect(created.workflow.steps[0].action.action.url).toBe('https://status.example.com/dashboard')
    const notebook = useCharacterNotebookStore()
    expect(notebook.workflows[0]?.metadata).toMatchObject({
      employeeTarget: 'browser',
      employeeAllowedHosts: ['status.example.com'],
    })
  })

  it('opens a local workspace through the VS Code protocol', async () => {
    await expect(executeStartEmployeeSession({
      target: 'vscode',
      objective: 'Kiểm tra project AIRI',
      workspacePath: 'AIRI',
      runNow: true,
    })).rejects.toThrow('requires an absolute local workspacePath')

    const created = JSON.parse(await executeStartEmployeeSession({
      target: 'vscode',
      objective: 'Kiểm tra project AIRI',
      workspacePath: 'E:\\AIRI',
      runNow: true,
    }))

    expect(created.targetName).toBe('VS Code')
    expect(created.workflow.steps[0].action).toEqual({
      type: 'safe-action',
      action: {
        type: 'open-vscode-workspace',
        path: 'E:\\AIRI',
      },
    })

    const notebook = useCharacterNotebookStore()
    expect(notebook.workflows[0]?.metadata).toMatchObject({
      employeeIntegration: true,
      employeeTarget: 'vscode',
      employeeTargetName: 'VS Code',
      employeeAllowedHosts: [],
      employeeWorkspacePath: 'E:\\AIRI',
      employeePlaybookVersion: 1,
    })
  })

  it('starts one end-to-end runner across multiple declared surfaces', async () => {
    const created = JSON.parse(await executeStartEmployeeRunner({
      objective: 'Kiểm tra AIRI, đối chiếu issue GitHub và xác minh trạng thái web',
      completionCriteria: 'Có bằng chứng từ workspace, GitHub và trang trạng thái rằng công việc đã được kiểm tra.',
      surfaces: [
        {
          target: 'vscode',
          workspacePath: 'E:\\AIRI',
        },
        {
          target: 'github',
          url: 'https://github.com/code-ai3/airi/issues',
        },
        {
          target: 'browser',
          url: 'https://status.example.com/dashboard',
        },
      ],
      runNow: true,
    }))

    expect(created.runner).toBe(true)
    expect(created.targets).toEqual(['vscode', 'github', 'browser'])
    expect(created.allowedHosts).toEqual(['github.com', 'www.github.com', 'status.example.com'])
    expect(created.workspacePaths).toEqual(['E:\\AIRI'])
    expect(created.workflow.status).toBe('queued')
    expect(created.workflow.steps).toHaveLength(3)

    const notebook = useCharacterNotebookStore()
    expect(notebook.workflows[0]?.metadata).toMatchObject({
      employeeIntegration: true,
      employeeRunner: true,
      employeeRunnerVersion: 1,
      employeeTargets: ['vscode', 'github', 'browser'],
      employeeAllowedHosts: ['github.com', 'www.github.com', 'status.example.com'],
      employeeWorkspacePaths: ['E:\\AIRI'],
      employeeCompletionCriteria: 'Có bằng chứng từ workspace, GitHub và trang trạng thái rằng công việc đã được kiểm tra.',
    })
  })
})
