// @vitest-environment jsdom
import { useCharacterNotebookStore } from '@proj-airi/stage-ui/stores/character/notebook'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  executeListCompanionApprovals,
  executeRequestCompanionApproval,
} from './companion-approvals'

describe('companion approval tools', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('queues a computer-use action without executing it', async () => {
    const created = JSON.parse(await executeRequestCompanionApproval({
      title: 'Bấm nút gửi',
      reason: 'Gửi biểu mẫu sau khi anh kiểm tra',
      risk: 'high',
      action: {
        type: 'computer-use',
        argv: ['invoke', 'input.click', '--x', '100', '--y', '200'],
      },
    }))

    expect(created.ok).toBe(true)
    expect(created.approval.status).toBe('pending')
    const notebook = useCharacterNotebookStore()
    expect(notebook.approvals).toHaveLength(1)
    expect(notebook.approvals[0]?.action.argv).toEqual([
      'invoke',
      'input.click',
      '--x',
      '100',
      '--y',
      '200',
    ])
    expect(notebook.activityLog.some(item => item.kind === 'approval-requested')).toBe(true)
  })

  it('lists pending approvals as read-only state', async () => {
    await executeRequestCompanionApproval({
      title: 'Gõ nội dung',
      risk: 'critical',
      action: {
        type: 'computer-use',
        argv: ['invoke', 'input.type', '--text', 'xin chào'],
      },
    })

    const listed = JSON.parse(await executeListCompanionApprovals({ status: 'pending' }))
    expect(listed.count).toBe(1)
    expect(listed.approvals[0].risk).toBe('critical')
    expect(listed.approvals[0].status).toBe('pending')
  })
  it('rejects malformed computer-use requests', async () => {
    await expect(executeRequestCompanionApproval({
      title: 'Sai cú pháp',
      risk: 'high',
      action: {
        type: 'computer-use',
        argv: ['input.click', '--x', '10'],
      },
    })).rejects.toThrow('must start with argv')
  })
})
