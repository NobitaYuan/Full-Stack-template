<script setup lang="ts">
import type { DynamicToolUIPart, TextUIPart } from 'ai'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Loader } from '@/components/ai-elements/loader'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { PromptInput, PromptInputTextarea, PromptInputSubmit, PromptInputFooter } from '@/components/ai-elements/prompt-input'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { Tool, ToolContent, ToolHeader } from '@/components/ai-elements/tool'
import { useAgentChat } from './composables/useAgentChat'
import { useAgentStore } from '@/stores/useAgentStore'
import SessionList from './components/SessionList.vue'
import PermissionCard from './components/PermissionCard.vue'

const agentStore = useAgentStore()
const { messages, status, pendingRequests, sendMessage, stop, loadSession, clearMessages, approvePermission, denyPermission } = useAgentChat()

const suggestions = ['帮我查询所有用户', '创建一个新用户，用户名 zhangsan，密码 abc123', '查询用户列表，分析一下数据概况']

watch(
  () => agentStore.currentSessionId,
  async (newId, oldId) => {
    if (newId === oldId) return
    if (newId) {
      await loadSession(newId)
    } else {
      clearMessages()
    }
  },
)

function handleSubmit({ text }: { text: string }) {
  if (!text.trim()) return
  sendMessage(text.trim())
}

function handleToggleSubmit() {
  if (status.value === 'streaming' || status.value === 'submitted') {
    stop()
  }
}

// eslint-disable-next-line ts/consistent-type-imports
type Part = { type: string; [key: string]: unknown }

function isTextPart(part: Part): part is TextUIPart {
  return part.type === 'text'
}

function isToolPart(part: Part): part is DynamicToolUIPart {
  return part.type === 'dynamic-tool'
}

function handleSuggestionClick(prompt: string) {
  sendMessage(prompt)
}
</script>

<template>
  <div class="agent-page">
    <SessionList class="agent-sidebar" />
    <div class="agent-main">
      <!-- 空状态 -->
      <div v-if="!agentStore.currentSessionId" class="agent-empty">
        <div class="text-center">
          <p class="text-lg font-medium">AI 助手</p>
          <p class="mt-1 text-sm text-muted-foreground">选择或新建一个会话开始对话</p>
        </div>
      </div>

      <template v-else>
        <!-- 消息区域 -->
        <div class="agent-conversation">
          <!-- 空会话引导 -->
          <div v-if="messages.length === 0 && status === 'ready'" class="agent-welcome">
            <p class="text-lg font-medium">你好，有什么可以帮你的？</p>
          </div>

          <Conversation v-else>
            <ConversationContent>
              <div v-for="message in messages" :key="message.id">
                <template v-for="(part, partIndex) in message.parts" :key="`${message.id}-${partIndex}`">
                  <!-- 文本消息 -->
                  <Message v-if="isTextPart(part)" :from="message.role">
                    <MessageContent>
                      <MessageResponse :content="part.text" />
                    </MessageContent>
                  </Message>

                  <!-- 工具调用 -->
                  <Tool v-else-if="isToolPart(part)" class="w-full">
                    <ToolHeader type="dynamic-tool" :state="part.state" :tool-name="part.toolName" />
                    <ToolContent>
                      <div class="p-3 text-xs">
                        <pre class="max-h-40 overflow-auto text-muted-foreground">{{ JSON.stringify(part.input, null, 2) }}</pre>
                      </div>
                    </ToolContent>
                  </Tool>
                </template>
              </div>

              <PermissionCard v-for="req in pendingRequests" :key="req.requestId" :request="req" @approve="approvePermission" @deny="denyPermission" />

              <Loader v-if="status === 'submitted'" class="mx-auto" />
            </ConversationContent>

            <ConversationScrollButton />
          </Conversation>
        </div>

        <!-- 输入区域 -->
        <div class="agent-input">
          <Suggestions v-if="messages.length === 0 && status === 'ready'" class="mb-3 justify-center">
            <Suggestion v-for="s in suggestions" :key="s" :suggestion="s" @click="handleSuggestionClick" />
          </Suggestions>

          <PromptInput class="mx-auto max-w-3xl" @submit="handleSubmit">
            <PromptInputTextarea placeholder="输入消息…（Shift+Enter 换行）" />
            <PromptInputFooter>
              <PromptInputSubmit :status="status" @click="handleToggleSubmit" />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.agent-page {
  height: 100%;
  display: flex;
}

.agent-sidebar {
  width: 280px;
  flex-shrink: 0;
}

.agent-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: hsl(var(--card));
}

.agent-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.agent-conversation {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.agent-input {
  flex-shrink: 0;
  border-top: 1px solid hsl(var(--border));
  padding: 12px;
}

.agent-welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
