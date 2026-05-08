# 前端组件库迁移：TDesign → Ant Design Vue

日期：2026-05-08

## 目标

将前端 UI 组件库从 TDesign Vue Next 替换为 Ant Design Vue，保持功能不变，同步更新所有相关文档。

## 约束

- Agent 相关代码：仅注释路由，保留文件不动
- 不改 Tailwind CSS 配置、不改后端
- 不做主题定制，使用 antd-vue 默认主题
- 引入方式：unplugin-vue-components 自动按需引入

## 依赖变更

| 移除 | 新增 |
|------|------|
| `tdesign-vue-next` | `ant-design-vue` |
| `tdesign-icons-vue-next` | `@ant-design/icons-vue` |

保留 `unplugin-vue-components`、`unplugin-auto-import`。

## 配置变更

### vite.config.ts

```typescript
// Before
TDesignResolver({ library: 'vue-next' })

// After
AntDesignVueResolver({ importStyle: false })
```

### main.ts

```typescript
// Before
import 'tdesign-vue-next/es/style/index.css'

// After
import 'ant-design-vue/dist/reset.css'
```

### App.vue

```typescript
// Before
import { zh_CN_Config } from 'tdesign-vue-next/es/locale/zh_CN'
<t-config-provider :global-config="zh_CN_Config">

// After
import zhCN from 'ant-design-vue/es/locale/zh_CN'
<a-config-provider :locale="zhCN">
```

## 组件映射（按文件）

### App.vue
- `t-config-provider` → `a-config-provider`

### layout/header.vue
- `t-switch` → `a-switch`
- Icons: `SunnyIcon` → `SunOutlined`, `MoonIcon` → `MoonOutlined`
- 类型: `SwitchProps` from tdesign → 使用 antd 内联类型

### layout/components/userInfo.vue
- `t-popup` → `a-popover`
- `t-badge` → `a-badge`
- `t-button` → `a-button`
- `t-dropdown` / `t-dropdown-menu` / `t-dropdown-item` → `a-dropdown` + `a-menu` + `a-menu-item`（结构不同，需重写模板）
- Icons: `UserCircleIcon` → `UserOutlined`, `ChevronDownIcon` → `DownOutlined`, `PoweroffIcon` → `PoweroffOutlined`, `MailIcon` → `MailOutlined`

### layout/nav.vue
- `t-icon :name="xxx"` → 直接使用对应 icon 组件

### components/demoBox.vue
- `t-radio-group` / `t-radio` → `a-radio-group` / `a-radio`
- `t-switch` → `a-switch`
- `t-card` → `a-card`

### views/login/index.vue
- `t-form` / `t-form-item` → `a-form` / `a-form-item`
- `t-input` → `a-input`
- `t-button` → `a-button`
- `MessagePlugin` → `message` from antd
- 类型: `FormInstanceFunctions`, `FormProps` → antd 等价类型

### views/userManage/index.vue
- `t-card` → `a-card`
- `t-button` → `a-button`
- `t-icon` → icon 组件
- `t-table` → `a-table`（注意 columns 和 data API 差异）
- `t-dialog` → `a-modal`
- `t-form` / `t-form-item` → `a-form` / `a-form-item`
- `t-input` → `a-input`
- `MessagePlugin` → `message`, `DialogPlugin` → `Modal`

### views/agent/components/SessionList.vue
- `t-button` → `a-button`
- `t-popconfirm` → `a-popconfirm`
- `t-icon` → icon 组件

### views/agent/components/PermissionCard.vue
- `t-card` → `a-card`
- `t-tabs` / `t-tab-panel` → `a-tabs` / `a-tab-pane`
- `t-button` → `a-button`
- `t-input` → `a-input`

## 路由变更

`src/router/index.ts`：注释掉 `/agent` 路由。

## 文档更新

- `apps/client/CLAUDE.md` — 组件库引用、前缀约定、相关开发规范
- `CLAUDE.md`（根目录） — 技术栈速查表格中 TDesign → Ant Design Vue
- `src/types/components.d.ts` — 自动重新生成，无需手动修改

## 风险与注意事项

1. **API 差异**：TDesign 和 antd-vue 的组件 API 并非一一对应，尤其 Dropdown、Table 的 columns 定义、Form 的校验方式有差异，需要逐个适配
2. **样式冲突**：antd-vue 和 Tailwind 可能存在样式冲突，需要关注 reset.css 的加载顺序
3. **agent 页面的 antd 组件**：SessionList.vue 和 PermissionCard.vue 虽然属于 agent 模块，但使用了 TDesign 组件，路由注释后仍需替换组件以避免编译错误
