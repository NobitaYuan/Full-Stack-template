/**
 * 消息队列 Composable
 * 负责 UIMessage[] 的增删改查原子操作
 */

import type { UIMessage } from 'ai'

export interface MessageQueue {
  readonly messages: Readonly<Ref<UIMessage[]>>
  addUser(text: string): void
  addAssistant(): string
  addSystemError(text: string): void
  updateParts(id: string, parts: UIMessage['parts']): void
  updateTextState(id: string, state: 'streaming' | 'done'): void
  setMessages(msgs: UIMessage[]): void
  clear(): void
}

export function useMessageQueue(): MessageQueue {
  const messages = ref<UIMessage[]>([])

  function addUser(text: string) {
    messages.value = [
      ...messages.value,
      {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text }],
      },
    ]
  }

  function addAssistant(): string {
    const id = crypto.randomUUID()
    messages.value = [
      ...messages.value,
      {
        id,
        role: 'assistant',
        parts: [{ type: 'text', text: '', state: 'streaming' }],
      },
    ]
    return id
  }

  function addSystemError(text: string) {
    messages.value = [
      ...messages.value,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        parts: [{ type: 'text', text, state: 'done' }],
      },
    ]
  }

  function updateParts(id: string, parts: UIMessage['parts']) {
    const idx = messages.value.findIndex((m) => m.id === id)
    if (idx === -1) return
    messages.value = [...messages.value.slice(0, idx), { ...messages.value[idx], parts }, ...messages.value.slice(idx + 1)]
  }

  function updateTextState(id: string, state: 'streaming' | 'done') {
    const idx = messages.value.findIndex((m) => m.id === id)
    if (idx === -1) return
    const msg = messages.value[idx]
    const parts = msg.parts.map((p) => (p.type === 'text' ? { ...p, state } : p))
    messages.value = [...messages.value.slice(0, idx), { ...msg, parts }, ...messages.value.slice(idx + 1)]
  }

  function setMessages(msgs: UIMessage[]) {
    messages.value = msgs
  }

  function clear() {
    messages.value = []
  }

  return {
    messages: shallowReadonly(messages),
    addUser,
    addAssistant,
    addSystemError,
    updateParts,
    updateTextState,
    setMessages,
    clear,
  }
}
