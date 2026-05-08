<script setup lang="ts">
import type { ToolPermissionRequest } from '../composables/useAgentChat'

const props = defineProps<{ request: ToolPermissionRequest }>()
const emit = defineEmits<{
  approve: [requestId: string, updatedInput?: Record<string, unknown>]
  deny: [requestId: string]
}>()

const selected = reactive<Record<string, string[]>>({})
const activeTab = ref('0')

function isAskUser() {
  return props.request.toolName === 'AskUserQuestion'
}

interface QuestionItem {
  question: string
  header?: string
  options?: Array<{ label: string; description?: string }>
  multiSelect?: boolean
}

function getQuestions(): QuestionItem[] {
  if (!isAskUser()) return []
  return (props.request.input.questions as QuestionItem[]) ?? []
}

const questions = computed(() => getQuestions())

const answers = computed(() => {
  const result: Record<string, string> = {}
  for (const q of questions.value) {
    const labels = selected[q.question] ?? []
    result[q.question] = q.multiSelect ? labels.join(', ') : (labels[0] ?? '')
  }
  return result
})

const allAnswered = computed(() => {
  if (questions.value.length === 0) return false
  return questions.value.every((q) => (selected[q.question]?.length ?? 0) > 0)
})

function isSelected(question: string, label: string) {
  return selected[question]?.includes(label) ?? false
}

function toggleOption(question: string, label: string, multiSelect?: boolean) {
  const current = selected[question] ?? []
  if (multiSelect) {
    selected[question] = current.includes(label) ? current.filter((l) => l !== label) : [...current, label]
  } else {
    selected[question] = [label]
  }
}

function handleAnswer() {
  const updatedInput = {
    ...props.request.input,
    answers: answers.value,
  }
  emit('approve', props.request.requestId, updatedInput)
}
</script>

<template>
  <!-- AskUserQuestion：选项 UI -->
  <a-card v-if="isAskUser()" class="permission-card">
    <!-- 多个问题时用 Tab 切换 -->
    <a-tabs v-if="questions.length > 1" v-model:activeKey="activeTab">
      <a-tab-pane v-for="(q, idx) in questions" :key="String(idx)" :tab="q.header || `问题 ${idx + 1}`">
        <div class="question-item">
          <p class="question-text">{{ q.question }}</p>
          <div class="options">
            <a-button
              v-for="opt in q.options"
              :key="opt.label"
              :type="isSelected(q.question, opt.label) ? 'primary' : 'default'"
              @click="toggleOption(q.question, opt.label, q.multiSelect)"
            >
              {{ opt.label }}
              <span v-if="opt.description" class="opt-desc">{{ opt.description }}</span>
            </a-button>
          </div>
          <a-input v-model:value="answers[q.question]" placeholder="或输入自定义回答..." class="custom-input" />
        </div>
      </a-tab-pane>
    </a-tabs>

    <!-- 单个问题时不用 Tab -->
    <div v-else-if="questions.length === 1" class="question-item">
      <p class="question-text">{{ questions[0].question }}</p>
      <div class="options">
        <a-button
          v-for="opt in questions[0].options"
          :key="opt.label"
          :type="isSelected(questions[0].question, opt.label) ? 'primary' : 'default'"
          @click="toggleOption(questions[0].question, opt.label, questions[0].multiSelect)"
        >
          {{ opt.label }}
        </a-button>
      </div>
      <a-input v-model:value="answers[questions[0].question]" placeholder="或输入自定义回答..." class="custom-input" />
    </div>

    <a-button type="primary" :disabled="!allAnswered" @click="handleAnswer"> 确认 </a-button>
  </a-card>

  <!-- 其他工具：approve/deny -->
  <a-card v-else class="permission-card">
    <p>工具 {{ request.toolName }} 请求执行权限</p>
    <a-button type="primary" @click="emit('approve', request.requestId)">允许</a-button>
    <a-button danger @click="emit('deny', request.requestId)">拒绝</a-button>
  </a-card>
</template>

<style lang="scss" scoped>
.permission-card {
  margin: 12px 0;
}
.question-item {
  padding: 12px 0;
}
.question-text {
  font-weight: 500;
  margin-bottom: 8px;
}
.options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}
.opt-desc {
  font-size: 12px;
  margin-left: 4px;
  opacity: 0.65;
}
.custom-input {
  margin-top: 8px;
}
</style>
