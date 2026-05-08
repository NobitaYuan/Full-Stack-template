# TDesign → Ant Design Vue 迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将前端 UI 组件库从 TDesign Vue Next 替换为 Ant Design Vue 4.x

**Architecture:** 保持现有的自动按需引入架构，仅替换 resolver 和组件库。逐文件替换组件，每个文件独立完成模板+脚本+样式的迁移。

**Tech Stack:** ant-design-vue 4.x, @ant-design/icons-vue, unplugin-vue-components

---

## File Structure

| 操作 | 文件 | 说明 |
|------|------|------|
| Modify | `apps/client/package.json` | 替换依赖 |
| Modify | `apps/client/vite.config.ts` | 替换 resolver |
| Modify | `apps/client/src/main.ts` | 替换 CSS 导入 |
| Modify | `apps/client/src/App.vue` | 替换 ConfigProvider |
| Modify | `apps/client/src/layout/header.vue` | Switch + Icons |
| Modify | `apps/client/src/layout/components/userInfo.vue` | Dropdown + Badge + Button |
| Modify | `apps/client/src/layout/nav.vue` | Icon 替换 |
| Modify | `apps/client/src/components/demoBox.vue` | Radio + Switch + Card |
| Modify | `apps/client/src/views/login/index.vue` | Form + Input + Button |
| Modify | `apps/client/src/views/userManage/index.vue` | Table + Dialog + Form |
| Modify | `apps/client/src/views/agent/components/SessionList.vue` | Button + Popconfirm |
| Modify | `apps/client/src/views/agent/components/PermissionCard.vue` | Card + Tabs + Button |
| Modify | `apps/client/src/router/index.ts` | 注释 agent 路由 |
| Modify | `CLAUDE.md` | 技术栈速查 |
| Modify | `apps/client/CLAUDE.md` | UI 组件章节 |
| Delete | `apps/client/src/types/components.d.ts` | 自动重新生成 |

---

### Task 1: 替换依赖

**Files:**
- Modify: `apps/client/package.json`

- [ ] **Step 1: 卸载 TDesign，安装 ant-design-vue**

```bash
cd d:/coding/bidReviewr
pnpm --filter @repo/client remove tdesign-vue-next tdesign-icons-vue-next
pnpm --filter @repo/client add ant-design-vue@4 @ant-design/icons-vue
```

- [ ] **Step 2: 验证依赖安装成功**

Run: `cat apps/client/package.json | grep -E "ant-design|tdesign"`
Expected: 只看到 ant-design-vue 和 @ant-design/icons-vue，没有 tdesign

---

### Task 2: 替换 Vite 配置和全局入口

**Files:**
- Modify: `apps/client/vite.config.ts`
- Modify: `apps/client/src/main.ts`
- Modify: `apps/client/src/App.vue`

- [ ] **Step 1: 修改 vite.config.ts**

将 `TDesignResolver` 替换为 `AntDesignVueResolver`：

```typescript
// 替换 import
// 旧: import { TDesignResolver } from 'unplugin-vue-components/resolvers'
// 新:
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers'

// 替换 Components 配置中的 resolver
// 旧:
//   TDesignResolver({ library: 'vue-next' })
// 新:
      AntDesignVueResolver({ importStyle: false })
```

- [ ] **Step 2: 修改 main.ts**

```typescript
// 旧: import 'tdesign-vue-next/es/style/index.css'
// 新:
import 'ant-design-vue/dist/reset.css'
```

- [ ] **Step 3: 修改 App.vue**

```vue
<script setup lang="ts">
import Layout from '@/layout/index.vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
</script>

<template>
  <a-config-provider :locale="zhCN">
    <Layout />
  </a-config-provider>
</template>

<style lang="scss" scoped></style>
```

- [ ] **Step 4: 删除旧的 components.d.ts（会自动重新生成）**

```bash
rm -f apps/client/src/types/components.d.ts
```

---

### Task 3: 迁移 layout/header.vue

**Files:**
- Modify: `apps/client/src/layout/header.vue`

- [ ] **Step 1: 替换组件和图标**

TDesign `t-switch` → antd `a-switch`，图标从 `tdesign-icons-vue-next` 换成 `@ant-design/icons-vue`。

完整替换文件内容为：

```vue
<script lang="tsx" setup>
import { useDarkModeStore } from '@/stores'
import { SunOutlined, MoonOutlined } from '@ant-design/icons-vue'
import { RouterLink } from 'vue-router'
import navCom from './nav.vue'
import userInfo from './components/userInfo.vue'

const logoUrl = new URL('@/assets/images/logo.png', import.meta.url).href

const darkModeStore = useDarkModeStore()

const title = import.meta.env.VITE_APP_TITLE
const checked = computed({
  get: () => darkModeStore.isDark,
  set: (val: boolean | undefined) => {
    darkModeStore.toggleDark(val ?? false)
  },
})
</script>

<template>
  <div class="header">
    <RouterLink to="/" class="logo">
      <img class="logoImg" :src="logoUrl" alt="logo" />
      <div class="text">
        {{ title }}
      </div>
    </RouterLink>
    <div class="nav">
      <navCom />
    </div>
    <div class="setting">
      <a-switch v-model:checked="checked" size="small">
        <template #checkedIcon><SunOutlined /></template>
        <template #uncheckedIcon><MoonOutlined /></template>
      </a-switch>
      <userInfo />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.header {
  height: var(--topbar-h);
  display: flex;
  align-items: center;
  padding-left: 12px;
  padding-right: 24px;
  background-color: #0052d9;
  transition: all 0.3s;
  color: #fff;
  .logo {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: bold;
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;
    .text {
      font-size: 20px;
      font-weight: bold;
    }
    .logoImg {
      width: 50px;
    }
  }
  .nav {
    height: 100%;
    padding: 0 12px;
  }
  .setting {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
  }
}
</style>
```

注意：
- antd Switch 用 `v-model:checked` 而非 `v-model`
- antd Switch 通过 `#checkedIcon` / `#uncheckedIcon` 插槽自定义图标
- 移除了 TSX label 渲染函数，改用插槽更简洁
- 移除了 `:deep(.t-switch)` 样式覆盖
- `darkModeStore.isDark` 是 boolean，但 antd 的 checked 绑定可能为 undefined，通过 computed 包装确保类型安全

---

### Task 4: 迁移 layout/components/userInfo.vue

**Files:**
- Modify: `apps/client/src/layout/components/userInfo.vue`

- [ ] **Step 1: 完整替换**

antd 的 Dropdown 用法与 TDesign 不同：TDesign 用 `t-dropdown` + `t-dropdown-menu` + `t-dropdown-item`，antd 用 `a-dropdown` + `a-menu` + `a-menu-item`。

```vue
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
      color: var(--td-brand-color, #1890ff);
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
```

注意：
- `t-popup` → `a-popover`（trigger="click" 保持一致）
- `t-badge :count` → `a-badge :count`（API 一致）
- `t-dropdown` 的菜单放在 `#overlay` 插槽中，用 `a-menu` + `a-menu-item`
- 图标不再需要 `template #icon` 插槽，直接作为子元素放置
- `variant="text"` → `type="text"`，`theme="default"` → 无需指定
- 移除了 `t-button` 的 `shape="square"` 属性（antd 不支持，Badge 内的按钮默认方形）

---

### Task 5: 迁移 layout/nav.vue

**Files:**
- Modify: `apps/client/src/layout/nav.vue`

- [ ] **Step 1: 替换 t-icon 为具体图标组件**

nav.vue 用 `t-icon :name="app"` 等动态图标，antd 不支持这种方式，需要改为具体图标组件。

```vue
<script lang="ts" setup>
import { AppstoreOutlined, UserSwitchOutlined, RobotOutlined } from '@ant-design/icons-vue'

const iconMap: Record<string, ReturnType<typeof AppstoreOutlined>> = {
  app: AppstoreOutlined,
  usergroup: UserSwitchOutlined,
  chat: RobotOutlined,
}

const navList = [
  { name: '示例页面', path: '/index', icon: 'app' },
  { name: '用户管理', path: '/user-manage', icon: 'usergroup' },
  { name: 'AI 助手', path: '/agent', icon: 'chat' },
]

const route = useRoute()
const activePath = computed(() => route.path)
const isPathActive = (path: string) => {
  const rootPath = activePath.value.split('/')[1]
  return `/${rootPath}` === path
}
</script>

<template>
  <div class="nav">
    <RouterLink class="navItem" :class="{ active: isPathActive(item.path) }" v-for="item in navList" :key="item.path" :to="item.path">
      <component :is="iconMap[item.icon]" v-if="item.icon" />
      <div class="text">{{ item.name }}</div>
    </RouterLink>
  </div>
</template>

<style lang="scss" scoped>
.nav {
  width: 100%;
  height: 100%;
  overflow: auto;
  display: flex;
  gap: 12px;
  flex-wrap: nowrap;
  align-items: center;
  .navItem {
    padding: 6px 10px;
    border-radius: 2px;
    transition: all 0.15s ease-in-out;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 4px;
    .text {
      white-space: nowrap;
    }
    &.active {
      background-color: #fff;
      color: #1890ff;
    }
    &:hover {
      background-color: #fff;
      color: #1890ff;
    }
  }
}
</style>
```

注意：
- `t-icon :name="xxx"` → 通过 `iconMap` 映射到具体图标组件，用 `<component :is>` 渲染
- CSS 中 `var(--td-brand-color)` → `#1890ff`（antd 默认主色）
- 保留了 AI 助手导航项（路由注释后点击会 404，但不影响功能，用户要求保留文件）

---

### Task 6: 迁移 components/demoBox.vue

**Files:**
- Modify: `apps/client/src/components/demoBox.vue`

- [ ] **Step 1: 完整替换**

```vue
<script lang="ts" setup>
import viewport_animation from '@/components/viewport_animation.vue'
import { curLang } from '@/i18n'
import { useDarkModeStore } from '@/stores'

const darkModeStore = useDarkModeStore()
const dev = import.meta.env
</script>

<template>
  <div class="demoBox">
    <viewport_animation>
      <h1>{{ $t('proTitle') }}</h1>
    </viewport_animation>
    <div>
      <a-radio-group v-model:value="curLang">
        <a-radio value="zh-cn" size="large">中文</a-radio>
        <a-radio value="en" size="large">English</a-radio>
      </a-radio-group>
    </div>
    <div class="switch flex items-center gap-4">
      <a-switch v-model:checked="darkModeStore.isDark" size="small"></a-switch>
      {{ $t('darkMode') }}
    </div>

    <a-card title="环境变量">
      <div class="flex flex-col gap-[12px] leading-[1.3]">
        <div class="flex w-full items-center" v-for="item of Object.entries(dev)" :key="item[0]">
          <label class="w-[200px] text-[13px]">{{ item[0] }}：</label>
          <div class="text-[18px]">{{ item[1] }}</div>
        </div>
      </div>
    </a-card>
  </div>
</template>

<style lang="scss" scoped>
.demoBox {
  height: 100%;
  background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAQAAABLCVATAAAAAXNSR0IArs4c6QAAAWlJREFUeNqlloFtwzAMBFU0PxF34k5eoUtktBZVnBysixEEUWBD+idpUnrTGXNkhPvt18awXZjKyE5BE5ix8sw6IEQHfKA1kZoMF5ZNnndqy1k2vae+wTAjMBPIp+sY3QJP1JADaXtvFjv4LR1TFKA5GD4suFSQcGEhjPWRn2+zKpRLT0hBwSo3lRerdpScpbMQCgZS2cH4tHQwerJVPIQjUVBH9wFTPOMgxnRwObhWLLkKlpaJA8TnpDxBwEv1r8Uo+ImegDVX4DBXKKWt3mQnZRRMlxZ7vfxDra6j0vD8vKUtKvJ79Pt1X9W6XxZNTvphhYxcGEjneWncGVH3pM2kAs6Qlq4XDIus4x2qDKieYEsz0nTAYd96MelYZEEgElZxnJtEa4mefZpr7hHGsLLmS2uDVgPGEUadgBxwrn3zwRwGhkU2NVqy6fUEbRs1CruoCM5zlPaIIL6/biLs0edft/d7IfjhT9gfL6wnSxDYPyIAAAAASUVORK5CYII=);
  background-attachment: scroll;
  background-color: var(--background-gray-50);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 24px;
  color: var(--el-text-color-primary);

  h1 {
    font-size: 40px;
    font-weight: bold;
  }
  .switch {
    color: inherit;
  }
}
</style>
```

注意：
- `t-radio-group v-model` → `a-radio-group v-model:value`
- `t-radio :value` → `a-radio value`（prop 名不同）
- `t-switch v-model` → `a-switch v-model:checked`
- `t-card :header` → `a-card title`
- 移除了 CSS 中 `var(--td-text-color-primary)` 引用，改为 `inherit`

---

### Task 7: 迁移 views/login/index.vue

**Files:**
- Modify: `apps/client/src/views/login/index.vue`

- [ ] **Step 1: 完整替换**

```vue
<script lang="ts" setup>
import { useUserStore } from '@/stores/useUserStore'
import { isDev } from '@/utils/isDev'
import { message } from 'ant-design-vue'
import type { FormInstance } from 'ant-design-vue'

const title = import.meta.env.VITE_APP_TITLE

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

interface LoginForm {
  username: string
  password: string
}

const formData = ref<LoginForm>({
  username: '',
  password: '',
})

const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const formRef = ref<FormInstance | null>(null)

const isLoading = ref(false)
const loginFn = async () => {
  isLoading.value = true
  if (!formRef.value) return
  try {
    await formRef.value.validate()
    await userStore.login(formData.value.username, formData.value.password)
    message.success('登录成功')
    const redirect = route.query.redirect as string
    const toUrl = redirect ? decodeURIComponent(redirect) : '/'
    router.replace(toUrl)
  } catch (error) {
    void error
  } finally {
    isLoading.value = false
  }
}

if (isDev) {
  formData.value.username = 'admin'
  formData.value.password = 'admin123'
}
</script>

<template>
  <div class="login">
    <div class="formbox">
      <div class="title">{{ title }}</div>
      <div class="form">
        <a-form ref="formRef" :model="formData" :rules="rules" layout="vertical">
          <a-form-item :label="$t('account')" name="username">
            <a-input size="large" v-model:value="formData.username" />
          </a-form-item>
          <a-form-item :label="$t('password')" name="password">
            <a-input-password size="large" v-model:value="formData.password" />
          </a-form-item>
        </a-form>
      </div>
      <div class="btn">
        <a-button block size="large" type="primary" :loading="isLoading" @click="loginFn">{{ $t('login') }}</a-button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.login {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-size: cover;
  background-image: url(../../assets/images/login-bg.png);
  background-position: center center;

  .formbox {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    border-radius: 8px;
    box-shadow: 0 0 32.9px 11px rgba(0, 0, 0, 0.11);
    padding: 24px;
    padding-top: 36px;
    min-width: 450px;
    background: rgba(0, 66, 108, 0.6);
    box-shadow:
      0 0 32.9px 11px rgba(0, 0, 0, 0.28),
      -1px 0 22.8px 4px rgba(0, 127, 181, 0.4) inset;
    margin-bottom: 10%;
    border-radius: 10px;
    .title {
      font-size: 36px;
      color: #fff;
      font-weight: bold;
    }
    .form {
      width: 100%;
      :deep(.ant-form-item-label > label) {
        color: #fff;
        font-size: 14px;
      }
    }
    .btn {
      width: 100%;
    }
  }
}
</style>
```

注意：
- `FormInstanceFunctions` → `FormInstance`
- `MessagePlugin.success()` → `message.success()`
- `t-form :data` → `a-form :model`，`labelAlign="top"` → `layout="vertical"`
- `t-form-item :label` → `a-form-item :label`（一致）
- `t-input v-model` → `a-input v-model:value`
- `t-input type="password"` → `a-input-password`（antd 专用密码输入组件）
- `formRef.value.validate()` 返回 Promise，antd 版不需要 `res1 !== true` 判断
- `t-button theme="primary"` → `a-button type="primary"`
- CSS 选择器从 `.t-form__label` 改为 `.ant-form-item-label > label`

---

### Task 8: 迁移 views/userManage/index.vue

**Files:**
- Modify: `apps/client/src/views/userManage/index.vue`

这是最复杂的文件，涉及 Table、Dialog、Form、MessagePlugin、DialogPlugin。

- [ ] **Step 1: 完整替换**

```vue
<script lang="ts" setup>
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import type { components } from '@/api/users/users'
import { getUserList, updateUser, deleteUser } from '@/api/users'
import { register } from '@/api/auth'
import dayjs from 'dayjs'

type User = components['schemas']['User']

const loading = ref(false)
const userList = ref<User[]>([])
const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
})

const columns = [
  { dataIndex: 'username', title: '用户名' },
  { dataIndex: 'createdAt', title: '注册时间' },
  { dataIndex: 'op', title: '操作' },
]

const formatTime = (iso: string) => dayjs(iso).format('YYYY-MM-DD HH:mm:ss')

const fetchData = async () => {
  loading.value = true
  try {
    const { data: res, error } = await getUserList({
      page: pagination.current,
      size: pagination.pageSize,
    })
    if (error) return
    userList.value = res!.data.items
    pagination.total = res!.data.total
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: { current: number; pageSize: number }) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

/* ===================新增用户===================== */
const addDialogVisible = ref(false)
const addForm = ref({ username: '', password: '', confirmPassword: '' })
const addLoading = ref(false)

const handleAdd = () => {
  addForm.value = { username: '', password: '', confirmPassword: '' }
  addDialogVisible.value = true
}

const handleAddSubmit = async () => {
  addLoading.value = true
  try {
    const { error } = await register(addForm.value.username, addForm.value.password, addForm.value.confirmPassword)
    if (error) return
    message.success('注册成功')
    addDialogVisible.value = false
    await fetchData()
  } finally {
    addLoading.value = false
  }
}

/* ===================编辑===================== */
const editDialogVisible = ref(false)
const editForm = ref({ id: '', username: '' })
const editLoading = ref(false)

const handleEdit = (row: User) => {
  editForm.value = { id: row.id, username: row.username }
  editDialogVisible.value = true
}

const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const { error } = await updateUser(editForm.value.id, {
      username: editForm.value.username,
    })
    if (error) return
    message.success('更新成功')
    editDialogVisible.value = false
    await fetchData()
  } finally {
    editLoading.value = false
  }
}

/* ===================删除===================== */
const handleDelete = (row: User) => {
  Modal.confirm({
    title: '确认删除',
    content: '确定要删除该用户吗？此操作不可恢复。',
    okType: 'danger',
    okText: '确定',
    cancelText: '取消',
    onOk: async () => {
      const { error } = await deleteUser(row.id)
      if (error) return
      message.success('删除成功')
      await fetchData()
    },
  })
}

onMounted(() => fetchData())
</script>

<template>
  <div class="user-manage-page">
    <a-card title="用户管理">
      <template #extra>
        <a-button type="primary" @click="handleAdd">
          <PlusOutlined />
          新增用户
        </a-button>
        <a-button @click="fetchData">
          <ReloadOutlined />
          刷新
        </a-button>
      </template>

      <a-table :data-source="userList" :loading="loading" :columns="columns" row-key="id" :pagination="pagination" @change="handleTableChange">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'createdAt'">
            {{ formatTime(record.createdAt) }}
          </template>
          <template v-if="column.dataIndex === 'op'">
            <a-button type="link" @click="handleEdit(record)">
              <EditOutlined />编辑
            </a-button>
            <a-button type="link" danger @click="handleDelete(record)">
              <DeleteOutlined />删除
            </a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新增用户弹窗 -->
    <a-modal v-model:open="addDialogVisible" title="新增用户" :confirm-loading="addLoading" @ok="handleAddSubmit">
      <a-form label-col style="label-col: { span: 4 }">
        <a-form-item label="用户名">
          <a-input v-model:value="addForm.username" autocomplete="username" />
        </a-form-item>
        <a-form-item label="密码">
          <a-input-password v-model:value="addForm.password" autocomplete="new-password" />
        </a-form-item>
        <a-form-item label="确认密码">
          <a-input-password v-model:value="addForm.confirmPassword" autocomplete="new-password" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 编辑弹窗 -->
    <a-modal v-model:open="editDialogVisible" title="编辑用户" :confirm-loading="editLoading" @ok="handleEditSubmit">
      <a-form>
        <a-form-item label="用户名">
          <a-input v-model:value="editForm.username" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style lang="scss" scoped>
.user-manage-page {
  padding: 16px;
  height: 100%;
  box-sizing: border-box;
}
</style>
```

注意：
- `MessagePlugin` → `message`，`DialogPlugin.confirm()` → `Modal.confirm()`
- `t-table` 用 `#op="{ row }"` 渲染列 → `a-table` 用 `#bodyCell="{ column, record }"` 统一插槽，需判断 `column.dataIndex`
- `columns` 的 `colKey` → `dataIndex`
- `t-table :data` → `a-table :data-source`
- `t-table @page-change` → `a-table @change`（参数结构不同）
- `t-card #actions` → `a-card #extra`
- `t-button theme="primary"` → `a-button type="primary"`
- `t-button variant="text" theme="primary"` → `a-button type="link"`
- `t-dialog v-model:visible` → `a-modal v-model:open`
- `t-dialog header` → `a-modal title`
- `t-dialog :confirm-btn="{ loading }"` → `a-modal :confirm-loading`
- `t-dialog @confirm` → `a-modal @ok`
- 图标从 `t-icon name="add"` 改为具体图标组件
- 移除了 `:deep(.t-card)` 样式

---

### Task 9: 迁移 agent 组件 (SessionList + PermissionCard)

**Files:**
- Modify: `apps/client/src/views/agent/components/SessionList.vue`
- Modify: `apps/client/src/views/agent/components/PermissionCard.vue`

虽然 agent 路由被注释，但这两个文件仍需替换 TDesign 组件以避免编译错误。

- [ ] **Step 1: 替换 SessionList.vue**

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAgentStore } from '@/stores/useAgentStore'
import { DeleteOutlined } from '@ant-design/icons-vue'

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
      <a-button type="primary" size="small" @click="handleCreate">新建</a-button>
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
        <a-popconfirm title="确定删除此会话？" @confirm="handleDelete(session.id)">
          <a-button v-show="hoverId === session.id || currentSessionId === session.id" danger type="text" size="small" @click.stop>
            <DeleteOutlined />
          </a-button>
        </a-popconfirm>
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
```

- [ ] **Step 2: 替换 PermissionCard.vue**

```vue
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
```

注意：
- `t-tabs v-model` → `a-tabs v-model:activeKey`
- `t-tab-panel :value :label` → `a-tab-pane :key :tab`
- `t-button variant="base"` → `a-button type="primary"`，`variant="outline"` → `type="default"`
- `t-button theme="danger"` → `a-button danger`
- `t-input v-model` → `a-input v-model:value`
- 移除 `var(--td-text-color-secondary)` → `opacity: 0.65`

---

### Task 10: 注释 agent 路由

**Files:**
- Modify: `apps/client/src/router/index.ts`

- [ ] **Step 1: 注释掉 /agent 路由**

在 `/agent` 路由定义前后加上注释：

```typescript
import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: '/',
    redirect: '/index',
  },
  {
    path: '/index',
    name: 'index',
    meta: { title: 'Taco' },
    component: () => import('@/views/index/index.vue'),
  },
  {
    path: '/user-manage',
    name: 'userManage',
    meta: { title: '用户管理' },
    component: () => import('@/views/userManage/index.vue'),
  },
  // {
  //   path: '/agent',
  //   name: 'agent',
  //   meta: { title: 'AI 助手' },
  //   component: () => import('@/views/agent/index.vue'),
  // },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    meta: { title: '404' },
    component: () => import('@/views/error/404View.vue'),
  },
  {
    path: '/login',
    name: 'login',
    meta: { title: '登录', showHeader: false },
    component: () => import('@/views/login/index.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
```

---

### Task 11: 更新文档

**Files:**
- Modify: `CLAUDE.md`
- Modify: `apps/client/CLAUDE.md`

- [ ] **Step 1: 更新根 CLAUDE.md 技术栈表格**

将第 28 行：
```
| client | Vue 3 + TDesign + Pinia | Vite 8 | — | Oxlint + Oxfmt |
```
改为：
```
| client | Vue 3 + Ant Design Vue + Pinia | Vite 8 | — | Oxlint + Oxfmt |
```

- [ ] **Step 2: 更新 apps/client/CLAUDE.md 第 6 节 UI 组件**

将整个第 6 节替换为：

```markdown
### 6. UI 组件选择

**Ant Design Vue 4** 为唯一 UI 框架，`a-` 前缀组件自动导入，无需 import。

```vue
<a-button type="primary">按钮</a-button>
<a-input v-model:value="value" />
```

```typescript
// 需要类型或 API 时手动导入
import { message, Modal } from 'ant-design-vue'
import type { FormInstance } from 'ant-design-vue'
// 图标
import { SunOutlined, UserOutlined } from '@ant-design/icons-vue'
```

`src/types/components.d.ts` 和 `auto-imports.d.ts` 为自动生成，禁止手动编辑。
```

- [ ] **Step 3: 更新 apps/client/CLAUDE.md 第 9 节中的 MessagePlugin 引用**

将第 9 节示例代码中的 `MessagePlugin.success('成功')` 替换为 `message.success('成功')`，同时将 `import { MessagePlugin } from 'tdesign-vue-next'` 替换为 `import { message } from 'ant-design-vue'`。

- [ ] **Step 4: 更新 apps/client/CLAUDE.md 第 11 节自动导入说明**

将 `TDesign: <t-button>, <t-input> 等 t- 前缀组件` 改为 `Ant Design Vue: <a-button>, <a-input> 等 a- 前缀组件`。

---

### Task 12: 构建验证

- [ ] **Step 1: 安装依赖**

```bash
cd d:/coding/bidReviewr
pnpm install
```

- [ ] **Step 2: 启动开发服务器验证**

```bash
pnpm --filter @repo/client dev
```

检查：
- 控制台无编译错误
- 页面正常渲染
- 登录页面表单可用
- 用户管理页表格显示正常

- [ ] **Step 3: 构建验证**

```bash
pnpm --filter @repo/client build
```

Expected: 构建成功，无 TypeScript 错误。

---

## Self-Review

**1. Spec coverage:** Design doc 中所有组件映射都有对应 Task。路由注释 → Task 10。文档更新 → Task 11。✅

**2. Placeholder scan:** 无 TBD/TODO/模糊描述。✅

**3. Type consistency:** 所有文件中 antd 组件 API 保持一致（`v-model:value`/`v-model:checked`/`v-model:open`/`type="primary"` 等）。✅
