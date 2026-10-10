// @vitest-environment jsdom
import { useCharacterNotebookStore } from '@proj-airi/stage-ui/stores/character'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  executeCompleteCompanionTask,
  executeCreateCompanionTask,
  executeListCompanionTasks,
  executeRescheduleCompanionTask,
} from './companion-tasks'

describe('companion task tools', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('creates and lists a scheduled persistent task', async () => {
    const dueAt = new Date(Date.now() + 60_000).toISOString()

    const created = JSON.parse(await executeCreateCompanionTask({
      title: 'Kiểm tra build',
      details: 'Mở log nếu build lỗi',
      priority: 'high',
      dueAt,
    }))

    expect(created.ok).toBe(true)
    expect(created.task.status).toBe('scheduled')
    expect(created.task.dueAt).toBe(dueAt)

    const listed = JSON.parse(await executeListCompanionTasks({ status: 'open' }))
    expect(listed.count).toBe(1)
    expect(listed.tasks[0].id).toBe(created.task.id)
  })

  it('creates an unscheduled task without causing a scheduled reminder', async () => {
    await executeCreateCompanionTask({
      title: 'Việc để sau',
      priority: 'normal',
    })

    const notebook = useCharacterNotebookStore()
    expect(notebook.tasks[0]?.status).toBe('queued')
    expect(notebook.getDueTasks(Date.now(), 60_000)).toHaveLength(0)
  })

  it('marks a task complete', async () => {
    const created = JSON.parse(await executeCreateCompanionTask({
      title: 'Hoàn thành em này',
      priority: 'normal',
    }))

    const completed = JSON.parse(await executeCompleteCompanionTask({ taskId: created.task.id }))
    expect(completed.ok).toBe(true)
    expect(completed.task.status).toBe('done')

    const open = JSON.parse(await executeListCompanionTasks({ status: 'open' }))
    expect(open.count).toBe(0)
  })

  it('reschedules and can return a task to the queue', async () => {
    const created = JSON.parse(await executeCreateCompanionTask({
      title: 'Đổi lịch',
      priority: 'normal',
    }))

    const dueAt = new Date(Date.now() + 120_000).toISOString()
    const scheduled = JSON.parse(await executeRescheduleCompanionTask({
      taskId: created.task.id,
      dueAt,
      reason: 'Anh đổi giờ',
    }))
    expect(scheduled.task.status).toBe('scheduled')
    expect(scheduled.task.dueAt).toBe(dueAt)

    const queued = JSON.parse(await executeRescheduleCompanionTask({
      taskId: created.task.id,
    }))
    expect(queued.task.status).toBe('queued')
    expect(queued.task.dueAt).toBeUndefined()
  })

  it('rejects invalid dueAt values', async () => {
    await expect(executeCreateCompanionTask({
      title: 'Sai giờ',
      priority: 'normal',
      autonomy: 'remind',
      dueAt: 'không-phải-ngày-giờ',
    })).rejects.toThrow('dueAt must be a valid ISO 8601 date/time.')
  })

  it('creates an explicitly approved safe-auto task', async () => {
    const dueAt = new Date(Date.now() + 60_000).toISOString()
    const created = JSON.parse(await executeCreateCompanionTask({
      title: 'Mở trang tài liệu',
      priority: 'normal',
      autonomy: 'safe-auto',
      dueAt,
      safeAction: {
        type: 'open-url',
        url: 'https://example.com/docs',
      },
    }))

    expect(created.task.autonomy).toBe('safe-auto')
    expect(created.task.safeAction).toEqual({
      type: 'open-url',
      url: 'https://example.com/docs',
    })
  })

  it('rejects safe-auto without a safe action', async () => {
    await expect(executeCreateCompanionTask({
      title: 'Tự chạy nhưng thiếu hành động',
      priority: 'normal',
      autonomy: 'safe-auto',
    })).rejects.toThrow('safe-auto tasks require a safeAction.')
  })

  it('rejects safe actions on reminder-only tasks', async () => {
    await expect(executeCreateCompanionTask({
      title: 'Không được tự chạy',
      priority: 'normal',
      autonomy: 'remind',
      safeAction: {
        type: 'open-url',
        url: 'https://example.com',
      },
    })).rejects.toThrow('safeAction is only allowed when autonomy is safe-auto.')
  })

  it('creates a recurring task without an explicit first dueAt', async () => {
    const created = JSON.parse(await executeCreateCompanionTask({
      title: 'Học tiếng Anh hằng ngày',
      priority: 'normal',
      recurrence: {
        type: 'daily',
        hour: 20,
        minute: 0,
      },
    }))

    expect(created.task.status).toBe('scheduled')
    expect(created.task.recurrence).toEqual({
      type: 'daily',
      hour: 20,
      minute: 0,
    })
    expect(created.task.dueAt).toBeTypeOf('string')
    expect(created.task.occurrencesCompleted).toBe(0)
  })

  it('completing a recurring task schedules its next occurrence', async () => {
    const created = JSON.parse(await executeCreateCompanionTask({
      title: 'Nhắc giãn cơ',
      priority: 'normal',
      dueAt: new Date(Date.now() - 1_000).toISOString(),
      recurrence: {
        type: 'interval',
        everyMinutes: 30,
      },
    }))

    const completed = JSON.parse(await executeCompleteCompanionTask({ taskId: created.task.id }))
    expect(completed.task.status).toBe('scheduled')
    expect(completed.task.occurrencesCompleted).toBe(1)
    expect(Date.parse(completed.task.dueAt)).toBeGreaterThan(Date.now())
  })

  it('can stop recurrence and leave the task unscheduled', async () => {
    const created = JSON.parse(await executeCreateCompanionTask({
      title: 'Nhắc định kỳ',
      priority: 'normal',
      recurrence: {
        type: 'interval',
        everyMinutes: 60,
      },
    }))

    const updated = JSON.parse(await executeRescheduleCompanionTask({
      taskId: created.task.id,
      recurrence: null,
      reason: 'Anh không cần nhắc định kỳ nữa',
    }))

    expect(updated.task.status).toBe('queued')
    expect(updated.task.recurrence).toBeUndefined()
    expect(updated.task.dueAt).toBeUndefined()
  })
})
