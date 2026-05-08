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

const handleTableChange = (pag: { current?: number; pageSize?: number }) => {
  pagination.current = pag.current ?? 1
  pagination.pageSize = pag.pageSize ?? 10
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
          <template #icon><PlusOutlined /></template>
          新增用户
        </a-button>
        <a-button @click="fetchData">
          <template #icon><ReloadOutlined /></template>
          刷新
        </a-button>
      </template>

      <a-table :data-source="userList" :loading="loading" :columns="columns" row-key="id" :pagination="pagination" @change="handleTableChange">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'createdAt'">
            {{ formatTime(record.createdAt) }}
          </template>
          <template v-if="column.dataIndex === 'op'">
            <a-button type="link" @click="handleEdit(record as User)"
              ><template #icon><EditOutlined /></template>编辑</a-button
            >
            <a-button type="link" danger @click="handleDelete(record as User)"
              ><template #icon><DeleteOutlined /></template>删除</a-button
            >
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新增用户弹窗 -->
    <a-modal v-model:open="addDialogVisible" title="新增用户" :confirm-loading="addLoading" @ok="handleAddSubmit">
      <a-form>
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
