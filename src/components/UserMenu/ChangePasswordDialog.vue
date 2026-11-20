<template>
  <el-dialog v-model="dialogVisible" title="Đổi mật khẩu" width="360px" append-to-body @closed="reset">
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <el-form-item label="Mật khẩu hiện tại" prop="old_password">
        <el-input v-model="form.old_password" type="password" autocomplete="current-password" show-password />
      </el-form-item>
      <el-form-item label="Mật khẩu mới" prop="new_password">
        <el-input v-model="form.new_password" type="password" autocomplete="new-password" show-password />
      </el-form-item>
      <el-form-item label="Nhập lại mật khẩu mới" prop="confirm">
        <el-input v-model="form.confirm" type="password" autocomplete="new-password" show-password @keyup.enter="submit" />
      </el-form-item>
    </el-form>
    <div class="text-[12px] text-[#9da3ac]">Sau khi đổi, các thiết bị khác đang đăng nhập tài khoản này sẽ bị đăng xuất.</div>
    <template #footer>
      <el-button @click="dialogVisible = false">Huỷ</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">Đổi mật khẩu</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { changePassword } from '@/api/oauth'
import { ApiError } from '@/utils/request'
import useAuth from '@/hooks/useAuth'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
})
const emit = defineEmits<{
  (event: 'update:visible', payload: boolean): void
}>()

const dialogVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
})

const { appConfig } = useAuth()
const minLength = computed(() => appConfig.value?.password_min_length ?? 8)
const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = reactive({ old_password: '', new_password: '', confirm: '' })

const rules = reactive<FormRules<typeof form>>({
  old_password: [{ required: true, message: 'Vui lòng nhập mật khẩu hiện tại', trigger: 'blur' }],
  new_password: [
    { required: true, message: 'Vui lòng nhập mật khẩu mới', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) =>
        value.length < minLength.value ? callback(new Error(`Mật khẩu phải có ít nhất ${minLength.value} ký tự`)) : callback(),
      trigger: 'blur',
    },
  ],
  confirm: [
    {
      validator: (_rule, value: string, callback) =>
        value !== form.new_password ? callback(new Error('Hai lần nhập mật khẩu mới không khớp')) : callback(),
      trigger: 'blur',
    },
  ],
})

const reset = () => {
  form.old_password = ''
  form.new_password = ''
  form.confirm = ''
  formRef.value?.clearValidate()
}

const submit = async () => {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await changePassword({ old_password: form.old_password, new_password: form.new_password })
    ElMessage.success('Đã đổi mật khẩu')
    dialogVisible.value = false
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : 'Đổi mật khẩu thất bại')
  } finally {
    submitting.value = false
  }
}
</script>
