<template>
  <el-dialog v-model="dialogVisible" title="" :width="dialogWidth" class="login-dialog" :before-close="closeLogin">
    <el-row>
      <el-row class="text-[20px] text-[#222529] font-semibold leading-snug justify-center">
        {{ isLogin ? 'Đăng nhập tài khoản' : 'Đăng ký tài khoản' }}
      </el-row>
      <el-row class="text-[12px] mt-[10px] justify-center">
        Chỉ dùng để xác định danh tính, yft-design sẽ không thu thập bất kỳ thông tin riêng tư nào của bạn~
      </el-row>
      <el-row class="content-center">
        <el-row class="mx-auto mt-[20px] content-center">
          <el-form ref="loginFormRef" :model="ruleForm" :rules="rules" class="w-[235px]" @submit.prevent="handleVerify">
            <el-form-item prop="email">
              <el-input type="email" autocomplete="username" placeholder="Email" :prefix-icon="Message" v-model="ruleForm.email" />
            </el-form-item>
            <el-form-item prop="password">
              <el-input
                type="password"
                :autocomplete="isLogin ? 'current-password' : 'new-password'"
                :placeholder="isLogin ? 'Mật khẩu' : `Mật khẩu (ít nhất ${passwordMinLength} ký tự)`"
                :prefix-icon="Lock"
                v-model="ruleForm.password"
                show-password
                @keyup.enter="handleVerify"
              />
            </el-form-item>
            <el-form-item v-if="useEmailOtp" prop="captcha" class="captcha">
              <el-input style="width: 120px;" placeholder="Mã email" v-model="ruleForm.captcha" @keyup.enter="handleVerify" />
              <el-button :disabled="otpCountdown > 0" @click="getEmailCaptcha">
                {{ otpCountdown > 0 ? `Gửi lại (${otpCountdown}s)` : 'Lấy mã xác thực' }}
              </el-button>
            </el-form-item>
            <el-form-item v-else-if="captchaEnabled" prop="captcha" class="captcha">
              <el-input style="width: 120px;" placeholder="Mã xác thực" v-model="ruleForm.captcha" @keyup.enter="handleVerify" />
              <div class="w-[90px] h-full captcha-image" title="Bấm để đổi mã khác" @click="getOauthCaptcha">
                <img :src="loginCaptchaImage" alt="" v-loading="loginCaptchaLoading">
              </div>
            </el-form-item>
          </el-form>
        </el-row>
        <el-row class="content-center">
          <el-button class="w-[230px]" type="primary" :loading="submitting" @click="handleVerify">
            {{ isLogin ? 'Đăng nhập' : 'Đăng ký' }}
          </el-button>
        </el-row>
        <el-row v-if="registrationOpen" class="content-center mt-[5px] text-[12px]">
          <span v-if="isLogin">Chưa có tài khoản? Nhấp <a href="javascript:;" class="text-[#1e2ad7] font-[800]" @click="changeCheckType(2)">Đăng ký tài khoản</a></span>
          <span v-else>Đã có tài khoản! <a href="javascript:;" class="text-[#1e2ad7] font-[800]" @click="changeCheckType(1)">Đăng nhập ngay</a></span>
        </el-row>
      </el-row>
    </el-row>
    <template #footer>
      <el-row class="justify-center text-[12px] text-[#9da3ac]">
        Đăng nhập đồng nghĩa với việc bạn đồng ý <strong><a href="" class="hover:text-blue-700">Điều khoản dịch vụ</a></strong>
      </el-row>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { isMobile } from '@/utils/common'
import { useUserStore } from '@/store'
import { Lock, Message } from '@element-plus/icons-vue'
import { OauthVerifyData } from '@/api/oauth/types'
import { imageCaptcha, emailCaptcha, oauthRegister, oauthLogin } from '@/api/oauth'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { ApiError } from '@/utils/request'
import useAuth from '@/hooks/useAuth'

const dialogVisible = ref(false)
const dialogWidth = computed(() => isMobile() ? '75%' : '35%')
const checkType = ref(1)
const loginFormRef = ref<FormInstance>()
const loginCaptchaImage = ref('')
const loginCaptchaLoading = ref(false)
const submitting = ref(false)
const otpCountdown = ref(0)
let otpTimer: number | undefined

const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
})

const emit = defineEmits<{
  (event: 'close', payload: boolean): void
}>()

const userStore = useUserStore()
const { appConfig, loadAppConfig } = useAuth()

const isLogin = computed(() => checkType.value === 1)
const registrationOpen = computed(() => appConfig.value?.registration_open ?? true)
const captchaEnabled = computed(() => appConfig.value?.captcha_enabled ?? true)
const passwordMinLength = computed(() => appConfig.value?.password_min_length ?? 8)
// Khi server bắt buộc xác minh email, form đăng ký dùng mã gửi qua email thay cho captcha ảnh.
const useEmailOtp = computed(() => !isLogin.value && !!appConfig.value?.email_otp_required)

const ruleForm = reactive<OauthVerifyData>({
  email: '',
  password: '',
  captcha: '',
  captcha_id: '',
})

const rules = reactive<FormRules<OauthVerifyData>>({
  email: [
    { required: true, message: 'Vui lòng nhập email', trigger: 'blur' },
    { type: 'email', message: 'Email không hợp lệ', trigger: 'blur' },
  ],
  password: [
    { required: true, message: 'Vui lòng nhập mật khẩu', trigger: 'blur' },
  ],
  captcha: [
    { required: true, message: 'Vui lòng nhập mã xác thực', trigger: 'blur' },
  ],
})

const getOauthCaptcha = async () => {
  if (!captchaEnabled.value || useEmailOtp.value) return
  loginCaptchaLoading.value = true
  ruleForm.captcha = ''
  try {
    const result = await imageCaptcha()
    ruleForm.captcha_id = result.data.data.captcha_id
    loginCaptchaImage.value = 'data:image/png;base64,' + result.data.data.image
  } catch (_) {
    // request.ts đã hiện thông báo lỗi
  } finally {
    loginCaptchaLoading.value = false
  }
}

watch(() => props.visible, async (val) => {
  dialogVisible.value = val
  if (val) {
    await loadAppConfig()
    getOauthCaptcha()
  }
})

const closeLogin = () => {
  emit('close', false)
}

const changeCheckType = (val: number) => {
  checkType.value = val
  ruleForm.captcha = ''
  loginFormRef.value?.clearValidate()
  getOauthCaptcha()
}

const getEmailCaptcha = async () => {
  if (!ruleForm.email) {
    ElMessage.warning('Vui lòng nhập email trước')
    return
  }
  try {
    const result = await emailCaptcha({ email: ruleForm.email })
    ElMessage.success(result.data.data.msg)
    otpCountdown.value = 60
    otpTimer = window.setInterval(() => {
      otpCountdown.value -= 1
      if (otpCountdown.value <= 0) window.clearInterval(otpTimer)
    }, 1000)
  } catch (_) {
    // request.ts đã hiện thông báo lỗi
  }
}

const handleVerify = async () => {
  if (submitting.value) return
  const valid = await loginFormRef.value?.validate().catch(() => false)
  if (!valid) return
  if (!isLogin.value && ruleForm.password.length < passwordMinLength.value) {
    ElMessage.error(`Mật khẩu phải có ít nhất ${passwordMinLength.value} ký tự`)
    return
  }

  submitting.value = true
  try {
    const send = isLogin.value ? oauthLogin : oauthRegister
    const result = await send({ ...ruleForm })
    userStore.applySession(result.data.data)
    userStore.clearLoginRequired()
    ruleForm.password = ''
    ruleForm.captcha = ''
    emit('close', false)
    ElMessage.success(isLogin.value ? 'Đăng nhập thành công' : 'Đăng ký thành công')
  } catch (error) {
    const fallback = isLogin.value ? 'Đăng nhập thất bại' : 'Đăng ký thất bại'
    ElMessage.error(error instanceof ApiError ? error.message : fallback)
    // Mỗi captcha chỉ dùng được một lần nên luôn phải lấy mã mới sau khi thất bại.
    getOauthCaptcha()
  } finally {
    submitting.value = false
  }
}

onBeforeUnmount(() => window.clearInterval(otpTimer))
</script>

<style lang="scss" scoped>
.h-full {
  height: 100%;
}
.content-center {
  justify-content: center
}
.captcha-image {
  cursor: pointer;
  outline: 1px solid $borderColor
}
</style>
<style>
.login-dialog .el-dialog__header {
  text-align: left
}
.login-dialog .el-upload__tip {
  text-align: left;
}
.login-dialog .el-upload-list__item-name {
  padding: 0;
}
.login-dialog .el-upload-list__item-info {
  width: 100%;
  margin-left: 0;
}
.captcha .el-form-item__content {
  justify-content: space-between;
}
</style>
