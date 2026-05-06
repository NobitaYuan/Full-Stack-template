import { defineStore } from 'pinia'
import { getSessionList, createSession as apiCreateSession, deleteSession as apiDeleteSession, updateSessionTitle as apiUpdateTitle } from '@/api/agent'
import type { components } from '@/api/api-types'

type AgentSession = components['schemas']['AgentSession']

export const useAgentStore = defineStore('agentStore', () => {
  const sessions = ref<AgentSession[]>([])
  const currentSessionId = ref<string | null>(null)
  const loading = ref(false)

  async function fetchSessions() {
    loading.value = true
    try {
      const { data, error } = await getSessionList()
      if (error) return
      sessions.value = data?.data?.items ?? []
      // 首次加载或当前会话不存在时，自动选中第一个
      if (!currentSessionId.value && sessions.value.length > 0) {
        currentSessionId.value = sessions.value[0].id
      }
    } finally {
      loading.value = false
    }
  }

  async function createNewSession(title?: string) {
    const { data, error } = await apiCreateSession(title ? { title } : undefined)
    if (error) return null
    const session = data?.data
    if (!session) return null
    sessions.value.unshift(session)
    currentSessionId.value = session.id
    return session
  }

  function selectSession(id: string) {
    currentSessionId.value = id
  }

  async function deleteSessionById(id: string) {
    const { error } = await apiDeleteSession(id)
    if (error) return
    sessions.value = sessions.value.filter((s) => s.id !== id)
    if (currentSessionId.value === id) {
      currentSessionId.value = sessions.value.length > 0 ? sessions.value[0].id : null
    }
  }

  async function updateTitle(id: string, title: string) {
    const { error } = await apiUpdateTitle(id, { title })
    if (error) return
    const session = sessions.value.find((s) => s.id === id)
    if (session) session.title = title
  }

  return { sessions, currentSessionId, loading, fetchSessions, createNewSession, selectSession, deleteSessionById, updateTitle }
})
