<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAgentStore } from '@/stores/useAgentStore'

const agentStore = useAgentStore()
const { sessions, currentSessionId } = storeToRefs(agentStore)

const hoverId = ref<string | null>(null)

function handleSelect(id: string) {
  agentStore.selectSession(id)
}

async function handleDelete(id: string) {
  await agentStore.deleteSessionById(id)
}

async function handleCreate() {
  await agentStore.createNewSession()
}

onMounted(() => {
  agentStore.fetchSessions()
})
</script>

<template>
  <div class="session-list">
    <div class="session-header">
      <span class="session-title">会话列表</span>
      <t-button theme="primary" size="small" @click="handleCreate">新建</t-button>
    </div>
    <div class="session-items">
      <div
        v-for="session in sessions"
        :key="session.id"
        class="session-item"
        :class="{ active: currentSessionId === session.id }"
        @click="handleSelect(session.id)"
        @mouseenter="hoverId = session.id"
        @mouseleave="hoverId = null"
      >
        <span class="session-name">{{ session.title || '新对话' }}</span>
        <t-popconfirm content="确定删除此会话？" @confirm="handleDelete(session.id)">
          <t-button v-show="hoverId === session.id || currentSessionId === session.id" theme="danger" variant="text" size="small" @click.stop>
            <template #icon><t-icon name="delete" /></template>
          </t-button>
        </t-popconfirm>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.session-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid hsl(var(--border));
  background: hsl(var(--card));
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid hsl(var(--border));
}

.session-title {
  font-size: 14px;
  font-weight: 600;
}

.session-items {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;

  &:hover {
    background: hsl(var(--accent));
  }

  &.active {
    background: hsl(var(--accent));
    font-weight: 500;
  }
}

.session-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
</style>
