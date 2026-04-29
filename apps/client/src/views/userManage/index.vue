<script lang="ts" setup>
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import type { components } from '@/api/generated/api'
import { getUserList, updateUser, deleteUser, register } from '@/api/user/user'
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
  { colKey: 'username', title: '用户名' },
  { colKey: 'createdAt', title: '注册时间' },
  { colKey: 'op', title: '操作' },
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

const handlePageChange = (params: { current: number; pageSize: number }) => {
  pagination.current = params.current
  pagination.pageSize = params.pageSize
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
    MessagePlugin.success('注册成功')
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
    MessagePlugin.success('更新成功')
    editDialogVisible.value = false
    await fetchData()
  } finally {
    editLoading.value = false
  }
}

/* ===================删除===================== */
const handleDelete = (row: User) => {
  const confirmDialog = DialogPlugin.confirm({
    header: '确认删除',
    body: '确定要删除该用户吗？此操作不可恢复。',
    theme: 'warning',
    confirmBtn: '确定',
    cancelBtn: '取消',
    onConfirm: async () => {
      confirmDialog.update({ confirmLoading: true })
      const { error } = await deleteUser(row.id)
      confirmDialog.update({ confirmLoading: false })
      if (error) return
      confirmDialog.hide()
      MessagePlugin.success('删除成功')
      await fetchData()
    },
  })
}

onMounted(() => fetchData())
</script>

<template>
  <div class="user-manage-page">
    <t-card title="用户管理">
      <template #actions>
        <t-button theme="primary" @click="handleAdd">
          <template #icon><t-icon name="add" /></template>
          新增用户
        </t-button>
        <t-button theme="default" @click="fetchData">
          <template #icon><t-icon name="refresh" /></template>
          刷新
        </t-button>
      </template>

      <t-table :data="userList" :loading="loading" :columns="columns" row-key="id" :pagination="pagination" @page-change="handlePageChange">
        <template #createdAt="{ row }">
          {{ formatTime(row.createdAt) }}
        </template>
        <template #op="{ row }">
          <t-button variant="text" theme="primary" @click="handleEdit(row)">编辑</t-button>
          <t-button variant="text" theme="danger" @click="handleDelete(row)">删除</t-button>
        </template>
      </t-table>
    </t-card>

    <!-- 新增用户弹窗 -->
    <t-dialog v-model:visible="addDialogVisible" header="新增用户" :confirm-btn="{ loading: addLoading }" @confirm="handleAddSubmit">
      <t-form label-width="80px">
        <t-form-item label="用户名">
          <t-input v-model="addForm.username" autocomplete="username" />
        </t-form-item>
        <t-form-item label="密码">
          <t-input v-model="addForm.password" type="password" autocomplete="new-password" />
        </t-form-item>
        <t-form-item label="确认密码">
          <t-input v-model="addForm.confirmPassword" type="password" autocomplete="new-password" />
        </t-form-item>
      </t-form>
    </t-dialog>

    <!-- 编辑弹窗 -->
    <t-dialog v-model:visible="editDialogVisible" header="编辑用户" :confirm-btn="{ loading: editLoading }" @confirm="handleEditSubmit">
      <t-form label-width="80px">
        <t-form-item label="用户名">
          <t-input v-model="editForm.username" />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<style lang="scss" scoped>
.user-manage-page {
  padding: 16px;
  height: 100%;
  box-sizing: border-box;

  :deep(.t-card) {
    height: 100%;
  }
}
</style>
