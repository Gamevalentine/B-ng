<script setup lang="ts">
import SettingsGeneralFields from '@proj-airi/stage-pages/components/settings-general-fields.vue'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useCharacterNotebookStore } from '@proj-airi/stage-ui/stores/character'
import { FieldCheckbox, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import BongAudioSetup from '../../../components/BongAudioSetup.vue'

import {
  electron,
  electronAppGetLaunchAtLogin,
  electronAppIconGet,
  electronAppIconSet,
  electronAppSetLaunchAtLogin,
} from '../../../../shared/eventa'
import { useProactiveCompanionStore } from '../../../stores/proactive-companion'

const { t } = useI18n()
const proactiveCompanion = useProactiveCompanionStore()
const notebook = useCharacterNotebookStore()
const { enabled: proactiveEnabled, observationEnabled, mode: proactiveMode } = storeToRefs(proactiveCompanion)
const approvalQueue = computed(() => notebook.approvals
  .filter(approval => approval.status === 'pending' || approval.status === 'approved' || approval.status === 'executing')
  .toSorted((a, b) => b.updatedAt - a.updatedAt))
const openWorkflows = computed(() => notebook.workflows
  .filter(workflow => workflow.status !== 'completed' && workflow.status !== 'cancelled')
  .toSorted((a, b) => b.updatedAt - a.updatedAt))
const recentActivity = computed(() => notebook.activityLog
  .toSorted((a, b) => b.createdAt - a.createdAt)
  .slice(0, 20))
const pendingApprovalCount = computed(() => notebook.approvals.filter(approval => approval.status === 'pending').length)
const proactiveModeOptions = [
  { label: 'Bình thường', value: 'normal' },
  { label: 'Tập trung', value: 'focus' },
  { label: 'Im lặng', value: 'silent' },
  { label: 'Ngủ', value: 'sleep' },
]
const getHidden = useElectronEventaInvoke(electronAppIconGet)
const setHidden = useElectronEventaInvoke(electronAppIconSet)
const getLaunchAtLogin = useElectronEventaInvoke(electronAppGetLaunchAtLogin)
const setLaunchAtLogin = useElectronEventaInvoke(electronAppSetLaunchAtLogin)
const isLinux = useElectronEventaInvoke(electron.app.isLinux)
// The value stays undefined on Linux, and the field does not show there.
const hideAppIcon = shallowRef<boolean>()
const launchAtLogin = shallowRef<boolean>()
const launchAtLoginSupported = shallowRef(false)

onMounted(async () => {
  try {
    if (!await isLinux())
      hideAppIcon.value = await getHidden()
  }
  catch {
    toast.error(t('tamagotchi.settings.pages.system.general.hide-app-icon.load-error'))
  }

  try {
    const state = await getLaunchAtLogin()
    launchAtLogin.value = state.enabled
    launchAtLoginSupported.value = state.supported
  }
  catch {
    launchAtLoginSupported.value = false
  }
})

async function updateHidden(hidden: boolean) {
  try {
    hideAppIcon.value = await setHidden(hidden)
  }
  catch {
    toast.error(t('tamagotchi.settings.pages.system.general.hide-app-icon.save-error'))
  }
}

async function updateLaunchAtLogin(enabled: boolean) {
  try {
    const state = await setLaunchAtLogin(enabled)
    launchAtLogin.value = state.enabled
    launchAtLoginSupported.value = state.supported
  }
  catch {
    launchAtLogin.value = false
  }
}

function approvalRiskLabel(risk: 'medium' | 'high' | 'critical') {
  if (risk === 'critical')
    return 'Rủi ro rất cao'
  if (risk === 'high')
    return 'Rủi ro cao'
  return 'Rủi ro vừa'
}

function approvalStatusLabel(status: string) {
  if (status === 'executing')
    return 'Đang thực hiện'
  if (status === 'approved')
    return 'Đã duyệt · chờ thực hiện'
  if (status === 'pending')
    return 'Chờ anh duyệt'
  return status
}

function workflowStatusLabel(status: string) {
  switch (status) {
    case 'scheduled':
      return 'Đã lên lịch'
    case 'queued':
      return 'Đang xếp hàng'
    case 'running':
      return 'Đang làm'
    case 'waiting-approval':
      return 'Chờ anh duyệt'
    case 'paused':
      return 'Tạm dừng'
    case 'failed':
      return 'Bị lỗi'
    default:
      return status
  }
}

function workflowStepStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Chưa làm'
    case 'running':
      return 'Đang làm'
    case 'waiting-approval':
      return 'Chờ duyệt'
    case 'completed':
      return 'Đã xong'
    case 'failed':
      return 'Bị kẹt'
    case 'skipped':
      return 'Đã bỏ qua'
    default:
      return status
  }
}

function formatActivityTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  })
}

async function resolveApproval(approvalId: string, decision: 'approved' | 'rejected') {
  try {
    // Wait for the elected leader to commit the decision before reporting success.
    const approval = await notebook.resolveApproval(approvalId, decision)
    if (!approval || approval.status !== decision) {
      toast.error('Chưa thể xác nhận quyết định. Vui lòng thử lại.')
      return
    }

    if (decision === 'approved')
      toast.success('Đã cho phép một lần. BÔNG sẽ thực hiện sau khi Windows xác nhận.')
    else
      toast.info('Đã từ chối. BÔNG sẽ không thực hiện hành động này.')
  }
  catch (error) {
    console.error('[BÔNG] Approval synchronization failed:', error)
    toast.error('Không đồng bộ được yêu cầu. Chưa thực hiện hành động nào.')
  }
}

function clearResolvedApprovals() {
  notebook.clearResolvedApprovals()
  toast.success('Đã dọn các yêu cầu đã xử lý.')
}

function resumeWorkflow(workflowId: string) {
  const workflow = notebook.resumeWorkflow(workflowId)
  if (workflow)
    toast.success('AIRI sẽ tiếp tục từ bước đang bị dừng.')
}

function cancelWorkflow(workflowId: string) {
  const workflow = notebook.cancelWorkflow(workflowId)
  if (workflow)
    toast.info('Đã hủy công việc nhiều bước và vô hiệu các quyền chưa dùng.')
}

function clearActivityLog() {
  notebook.clearActivityLog()
  toast.success('Đã xóa nhật ký hoạt động.')
}
</script>

<template>
  <SettingsGeneralFields>
    <template #additional-fields>
      <BongAudioSetup />
      <FieldCheckbox
        v-model="proactiveEnabled"
        label="AIRI chủ động"
        description="Cho phép AIRI tự thức dậy, hỏi thăm, nhắc việc, đi ngủ và xuất hiện lại theo ngữ cảnh."
      />
      <FieldCheckbox
        v-model="observationEnabled"
        label="Quan sát màn hình"
        description="Cho phép AIRI xem ứng dụng/cửa sổ đang dùng và chụp ảnh màn hình tạm thời khi cần hiểu ngữ cảnh."
      />
      <FieldSelect
        v-model="proactiveMode"
        label="Chế độ đồng hành"
        :options="proactiveModeOptions"
      />
      <FieldCheckbox
        v-if="launchAtLoginSupported && launchAtLogin !== undefined"
        :model-value="launchAtLogin"
        label="Tự chạy cùng Windows"
        description="Khởi động AIRI tự động khi anh đăng nhập Windows để em có thể tự thức dậy và đồng hành mà không cần anh mở ứng dụng thủ công."
        @update:model-value="updateLaunchAtLogin"
      />
      <FieldCheckbox
        v-if="hideAppIcon !== undefined"
        :model-value="hideAppIcon"
        :label="t('tamagotchi.settings.pages.system.general.hide-app-icon.title')"
        :description="t('tamagotchi.settings.pages.system.general.hide-app-icon.description')"
        @update:model-value="updateHidden"
      />
    </template>
  </SettingsGeneralFields>

  <section class="airi-control-panel">
    <header class="airi-control-header">
      <div>
        <h2>Trung tâm quyền hạn AIRI</h2>
        <p>Những thao tác làm thay đổi máy tính phải được anh duyệt trước. AIRI chỉ được chạy đúng hành động hiển thị bên dưới một lần.</p>
      </div>
      <span v-if="pendingApprovalCount" class="airi-count-badge">
        {{ pendingApprovalCount }} chờ duyệt
      </span>
    </header>

    <div class="airi-section-heading">
      <div>
        <h3>Yêu cầu quyền</h3>
        <p>Kiểm tra kỹ lệnh trước khi bấm Cho phép.</p>
      </div>
      <button class="airi-link-button" type="button" @click="clearResolvedApprovals">
        Dọn yêu cầu đã xử lý
      </button>
    </div>

    <div v-if="approvalQueue.length" class="airi-stack">
      <article
        v-for="approval in approvalQueue"
        :key="approval.id"
        class="airi-approval-card"
        :data-risk="approval.risk"
      >
        <div class="airi-card-top">
          <strong>{{ approval.title }}</strong>
          <div class="airi-badges">
            <span class="airi-badge">{{ approvalRiskLabel(approval.risk) }}</span>
            <span class="airi-badge" :data-status="approval.status">
              {{ approvalStatusLabel(approval.status) }}
            </span>
          </div>
        </div>

        <p v-if="approval.reason" class="airi-card-description">
          {{ approval.reason }}
        </p>
        <code class="airi-command">{{ approval.action.argv.join(' ') }}</code>

        <div v-if="approval.status === 'pending'" class="airi-approval-actions">
          <button class="airi-button airi-button-approve" type="button" @click="resolveApproval(approval.id, 'approved')">
            Cho phép một lần
          </button>
          <button class="airi-button airi-button-reject" type="button" @click="resolveApproval(approval.id, 'rejected')">
            Từ chối
          </button>
        </div>
        <p v-else class="airi-waiting-note">
          AIRI sẽ thực hiện đúng lệnh này ở vòng xử lý tiếp theo khi anh đang dùng máy. Quyền tự hết hạn sau 30 phút.
        </p>
      </article>
    </div>
    <p v-else class="airi-empty-state">
      Hiện không có hành động nào đang chờ anh duyệt.
    </p>

    <div class="airi-section-heading airi-workflow-heading">
      <div>
        <h3>Multi-step Worker</h3>
        <p>AIRI tự đi từng bước, tự làm phần an toàn và dừng đúng chỗ cần anh cho phép.</p>
      </div>
    </div>

    <div v-if="openWorkflows.length" class="airi-stack">
      <article
        v-for="workflow in openWorkflows"
        :key="workflow.id"
        class="airi-workflow-card"
        :data-status="workflow.status"
      >
        <div class="airi-card-top">
          <div>
            <strong>{{ workflow.goal }}</strong>
            <p v-if="workflow.summary" class="airi-card-description">
              {{ workflow.summary }}
            </p>
          </div>
          <span class="airi-badge" :data-status="workflow.status">
            {{ workflowStatusLabel(workflow.status) }}
          </span>
        </div>

        <div class="airi-workflow-progress">
          <span>
            Bước {{ Math.min(workflow.currentStepIndex + 1, workflow.steps.length) }}/{{ workflow.steps.length }}
            · tự chỉnh kế hoạch {{ workflow.revisionCount ?? 0 }} lần
            <template v-if="workflow.runsCompleted">
              · đã chạy {{ workflow.runsCompleted }} lượt
            </template>
          </span>
          <div class="airi-progress-track">
            <span
              class="airi-progress-fill"
              :style="{ width: `${Math.round((workflow.steps.filter(step => step.status === 'completed' || step.status === 'skipped').length / workflow.steps.length) * 100)}%` }"
            />
          </div>
        </div>

        <p v-if="workflow.nextRunAt" class="airi-workflow-next-run">
          Lượt tiếp theo: {{ formatActivityTime(workflow.nextRunAt) }}
        </p>

        <div class="airi-workflow-steps">
          <div
            v-for="(step, index) in workflow.steps"
            :key="step.id"
            class="airi-workflow-step"
            :data-status="step.status"
          >
            <span class="airi-step-index">{{ index + 1 }}</span>
            <div class="airi-step-copy">
              <div class="airi-step-title">
                <strong>{{ step.title }}</strong>
                <span>{{ workflowStepStatusLabel(step.status) }}</span>
              </div>
              <p v-if="step.details">
                {{ step.details }}
              </p>
              <code v-if="step.action.type === 'computer-use'" class="airi-step-command">
                {{ step.action.argv.join(' ') }}
              </code>
              <p v-if="step.requiresApproval" class="airi-step-approval-note">
                Bước này sẽ dừng để xin phép trước khi thực hiện.
              </p>
            </div>
          </div>
        </div>

        <p v-if="workflow.lastEvaluation" class="airi-workflow-evaluation">
          <strong>Đánh giá gần nhất:</strong> {{ workflow.lastEvaluation }}
        </p>
        <p v-if="workflow.lastError" class="airi-workflow-error">
          {{ workflow.lastError }}
        </p>

        <div class="airi-approval-actions">
          <button
            v-if="workflow.status === 'paused' || workflow.status === 'failed'"
            class="airi-button airi-button-approve"
            type="button"
            @click="resumeWorkflow(workflow.id)"
          >
            Thử lại từ bước này
          </button>
          <button class="airi-button airi-button-reject" type="button" @click="cancelWorkflow(workflow.id)">
            Hủy công việc
          </button>
        </div>
      </article>
    </div>
    <p v-else class="airi-empty-state">
      Chưa có công việc nhiều bước nào đang chạy.
    </p>

    <div class="airi-section-heading airi-activity-heading">
      <div>
        <h3>Nhật ký hoạt động</h3>
        <p>20 hoạt động gần nhất của cơ chế tự chủ và hệ thống phê duyệt.</p>
      </div>
      <button class="airi-link-button" type="button" @click="clearActivityLog">
        Xóa nhật ký
      </button>
    </div>

    <div v-if="recentActivity.length" class="airi-activity-list">
      <div v-for="entry in recentActivity" :key="entry.id" class="airi-activity-item" :data-status="entry.status">
        <span class="airi-activity-dot" />
        <div class="airi-activity-copy">
          <div class="airi-activity-title">
            <strong>{{ entry.title }}</strong>
            <time>{{ formatActivityTime(entry.createdAt) }}</time>
          </div>
          <p v-if="entry.details">
            {{ entry.details }}
          </p>
        </div>
      </div>
    </div>
    <p v-else class="airi-empty-state">
      Chưa có hoạt động nào được ghi lại.
    </p>
  </section>
</template>

<style scoped>
.airi-control-panel {
  margin-top: 24px;
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  border-radius: 16px;
  padding: 18px;
  background: color-mix(in srgb, currentColor 3%, transparent);
}

.airi-control-header,
.airi-section-heading,
.airi-card-top,
.airi-activity-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.airi-control-header h2,
.airi-section-heading h3,
.airi-card-top strong,
.airi-activity-title strong {
  margin: 0;
}

.airi-control-header p,
.airi-section-heading p,
.airi-card-description,
.airi-waiting-note,
.airi-empty-state,
.airi-activity-copy p {
  margin: 4px 0 0;
  opacity: 0.7;
  font-size: 13px;
  line-height: 1.45;
}

.airi-section-heading {
  margin-top: 20px;
  margin-bottom: 10px;
}

.airi-count-badge,
.airi-badge {
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 11px;
  white-space: nowrap;
}

.airi-count-badge {
  font-weight: 700;
}

.airi-stack,
.airi-activity-list {
  display: grid;
  gap: 10px;
}

.airi-approval-card {
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  border-radius: 12px;
  padding: 14px;
  background: color-mix(in srgb, currentColor 2%, transparent);
}

.airi-approval-card[data-risk='critical'] {
  border-color: rgba(239, 68, 68, 0.5);
}

.airi-badges,
.airi-approval-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.airi-badge[data-status='approved'] {
  border-color: rgba(34, 197, 94, 0.45);
}

.airi-command {
  display: block;
  margin-top: 10px;
  border-radius: 8px;
  padding: 9px 10px;
  overflow-wrap: anywhere;
  background: rgba(127, 127, 127, 0.12);
  font-size: 12px;
  line-height: 1.45;
}

.airi-approval-actions {
  margin-top: 12px;
}

.airi-button,
.airi-link-button {
  border-radius: 9px;
  cursor: pointer;
  font: inherit;
}

.airi-button {
  border: 0;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
}

.airi-button-approve {
  background: #16a34a;
  color: white;
}

.airi-button-reject {
  background: rgba(127, 127, 127, 0.14);
  color: inherit;
}

.airi-link-button {
  border: 0;
  padding: 4px 0;
  background: transparent;
  color: inherit;
  opacity: 0.72;
  font-size: 12px;
}

.airi-link-button:hover {
  opacity: 1;
}

.airi-workflow-heading,
.airi-activity-heading {
  margin-top: 24px;
}

.airi-workflow-card {
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  border-radius: 12px;
  padding: 14px;
  background: color-mix(in srgb, currentColor 2%, transparent);
}

.airi-workflow-card[data-status='waiting-approval'] {
  border-color: rgba(217, 119, 6, 0.45);
}

.airi-workflow-card[data-status='paused'],
.airi-workflow-card[data-status='failed'] {
  border-color: rgba(220, 38, 38, 0.4);
}

.airi-workflow-progress {
  display: grid;
  gap: 6px;
  margin-top: 12px;
  font-size: 12px;
}

.airi-progress-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.16);
}

.airi-progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: currentColor;
  opacity: 0.65;
  transition: width 180ms ease;
}

.airi-workflow-next-run {
  margin: 8px 0 0;
  opacity: 0.72;
  font-size: 12px;
}

.airi-workflow-steps {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.airi-workflow-step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  border-radius: 10px;
  padding: 10px;
}

.airi-workflow-step[data-status='completed'] {
  opacity: 0.62;
}

.airi-workflow-step[data-status='waiting-approval'] {
  border-color: rgba(217, 119, 6, 0.4);
}

.airi-workflow-step[data-status='failed'] {
  border-color: rgba(220, 38, 38, 0.4);
}

.airi-step-index {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  place-items: center;
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.14);
  font-size: 11px;
  font-weight: 700;
}

.airi-step-copy {
  min-width: 0;
  flex: 1;
}

.airi-step-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
}

.airi-step-title > span {
  flex: 0 0 auto;
  opacity: 0.55;
  font-size: 11px;
}

.airi-step-copy p {
  margin: 4px 0 0;
  opacity: 0.7;
  font-size: 12px;
  line-height: 1.4;
}

.airi-step-command {
  display: block;
  margin-top: 6px;
  overflow-wrap: anywhere;
  opacity: 0.68;
  font-size: 11px;
}

.airi-step-approval-note {
  font-weight: 600;
}

.airi-workflow-evaluation {
  margin: 10px 0 0;
  border-radius: 9px;
  padding: 8px 10px;
  background: rgba(127, 127, 127, 0.1);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.airi-workflow-error {
  margin: 10px 0 0;
  color: #dc2626;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.airi-activity-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent);
  padding: 8px 2px 10px;
}

.airi-activity-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  margin-top: 5px;
  border-radius: 999px;
  background: #64748b;
}

.airi-activity-item[data-status='success'] .airi-activity-dot {
  background: #16a34a;
}

.airi-activity-item[data-status='warning'] .airi-activity-dot {
  background: #d97706;
}

.airi-activity-item[data-status='error'] .airi-activity-dot {
  background: #dc2626;
}

.airi-activity-copy {
  min-width: 0;
  flex: 1;
}

.airi-activity-title time {
  flex: 0 0 auto;
  opacity: 0.5;
  font-size: 11px;
}

.airi-activity-copy p {
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .airi-control-header,
  .airi-section-heading,
  .airi-card-top,
  .airi-activity-title {
    align-items: flex-start;
    flex-direction: column;
  }

  .airi-badges,
  .airi-approval-actions {
    flex-wrap: wrap;
  }
}
</style>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.system.general.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
