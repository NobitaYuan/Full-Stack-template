<script lang="ts" setup>
import { useUserStore } from '@/stores/useUserStore'
import { UserOutlined, DownOutlined, LogoutOutlined, MailOutlined } from '@ant-design/icons-vue'

const userStore = useUserStore()
</script>

<template>
  <div class="userInfo">
    <!-- 消息 -->
    <a-popover trigger="click">
      <a-badge :count="3" :offset="[4, 6]">
        <a-button type="text">
          <MailOutlined />
        </a-button>
      </a-badge>
      <template #content>
        <div class="w-[260px] min-h-[180px]">
          <a-empty />
        </div>
      </template>
    </a-popover>

    <!-- 用户 -->
    <a-dropdown :trigger="['click']">
      <a-button type="text">
        <UserOutlined class="header-user-avatar" />
        <span class="header-user-account">{{ userStore.userName }}</span>
        <DownOutlined />
      </a-button>
      <template #overlay>
        <a-menu>
          <a-menu-item key="info">
            <UserOutlined />
            <span style="margin-left: 8px">用户信息</span>
          </a-menu-item>
          <a-menu-item key="logout" @click="userStore.logout(true)">
            <LogoutOutlined />
            <span style="margin-left: 8px">退出登录</span>
          </a-menu-item>
        </a-menu>
      </template>
    </a-dropdown>
  </div>
</template>

<style lang="scss" scoped>
.userInfo {
  display: flex;
  gap: 8px;
  :deep(.ant-btn-text) {
    color: #fff;
    &:hover {
      color: #1890ff;
    }
  }
}
.header-user-avatar {
  margin-right: 4px;
}
.header-user-account {
  margin-right: 4px;
}
</style>
