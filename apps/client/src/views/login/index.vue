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
