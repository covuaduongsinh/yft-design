<template>
  <el-dialog v-model="dialogVisible" title="" :width="dialogWidth" class="login-dialog" :before-close="closeLogin">
    <el-row>
      <el-row class="text-[20px] text-[#222529] font-semibold leading-snug justify-center">
        Đăng nhập bằng {{loginInfo}}
      </el-row>
      <el-row class="text-[12px] mt-[10px] justify-center">
        Chỉ dùng để xác định danh tính, yft-design sẽ không thu thập bất kỳ thông tin riêng tư nào của bạn~
      </el-row>
      <el-row v-if="loginType === 1">
        <div class="overflow-hidden relative mt-[20px] mx-auto p-[10px] border border-solid border-[rgba(0, 0, 0, .08)] rounded-[8px] justify-center">
          <div class="w-[150px] h-[150px] ">
            <el-image :src="qrcode" v-loading="!qrcode" class="w-full h-full"></el-image>
          </div>
        </div>
      </el-row>
      <el-row v-if="loginType === 2" class="content-center">
        <el-row class="h-[170px] mx-auto mt-[20px] content-center">
          <el-form ref="loginFormRef" :model="ruleForm" :rules="rules" class="w-[235px]">
            <el-form-item prop="email">
              <el-input type="email" autocomplete="off" :prefix-icon="Message" v-model="ruleForm.email" />
            </el-form-item>
            <el-form-item prop="password">
              <el-input type="password" autocomplete="off" :prefix-icon="Lock" v-model="ruleForm.password" show-password />
            </el-form-item>
            <el-form-item v-if="checkType === 1" class="captcha">
              <el-input style="width: 120px;" v-model="ruleForm.captcha"/>
              <div class="w-[90px] h-full captcha-image" @click="getOauthCaptcha">
                <img :src="loginCaptchaImage" alt="" v-loading="loginCaptchaLoading">
              </div>
            </el-form-item>
            <el-form-item v-if="checkType === 2" class="captcha">
              <el-input style="width: 120px;" v-model="ruleForm.captcha"/>
              <el-button @click="getEmailCaptcha">Lấy mã xác thực</el-button>
            </el-form-item>
          </el-form>
        </el-row>
        <el-row class="content-center">
          <el-button class="w-[230px]" type="primary" @click="handleVerify">{{ checkType === 1 ? 'Đăng nhập' : 'Đăng ký' }}</el-button>
        </el-row>
        <el-row class="content-center mt-[5px] text-[12px]">
          <span v-if="checkType === 1">Chưa có tài khoản? Nhấp <a href="javascript:;" class="text-[#1e2ad7] font-[800]" @click="changeCheckType(2)">Đăng ký tài khoản</a></span>
          <span v-if="checkType === 2">Đã có tài khoản! <a href="javascript:;" class="text-[#1e2ad7] font-[800]" @click="changeCheckType(1)">Đăng nhập ngay</a></span>
        </el-row>
      </el-row>
      <el-row class="mt-[28px] justify-center">
        <div class="w-[170px] h-[45px]">
          <el-row class="h-full">
            <el-col :span="8" class="flex justify-center">
              <el-button class="h-full" @click="loginGithub"><IconGithub class="text-[20px]" /></el-button>
            </el-col>
            <el-col :span="8" class="flex justify-center">
              <el-button class="h-full" @click="loginQQ"><IconTencentQq class="text-[20px]" /></el-button>
            </el-col>
            <el-col :span="8" class="flex justify-center">
              <el-button class="h-full" @click="loginEmail"><IconMail class="text-[20px]" /></el-button>
            </el-col>
          </el-row>
        </div>
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
import { computed, ref, watch } from 'vue'
import { oauthWechat, oauthTokenGithub } from '@/api/oauth'
import { UserResult } from '@/api/oauth/types'
import { isMobile } from '@/utils/common'
import { storeToRefs } from 'pinia';
import { useUserStore } from '@/store';
import { localStorage } from '@/utils/storage';
import { Lock, User, Message } from '@element-plus/icons-vue'
import { OauthVerifyData } from '@/api/oauth/types';
import { imageCaptcha, emailCaptcha, oauthRegister, oauthLogin } from '@/api/oauth';
import { ElMessage, type FormRules } from 'element-plus'

const dialogVisible = ref(false)
const dialogWidth = computed(() => isMobile() ? '75%' : '35%')
const qrcode = ref('')
const checkType = ref(1)
const loginType = ref(2)
const loginInfo = ref('tài khoản')
const loginCaptchaImage = ref('')
const loginCaptchaLoading = ref(false)
const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
})

const ruleForm = reactive<OauthVerifyData>({
  email: '',
  password: '',
  captcha: '',
})

const rules = reactive<FormRules<OauthVerifyData>>({
  email: [
    {
      required: true,
      message: 'Vui lòng nhập email',
      trigger: 'blur',
    },
  ],
  password: [
    {
      required: true,
      message: 'Vui lòng nhập mật khẩu',
      trigger: 'blur',
    },
  ],
  captcha: [
    {
      required: true,
      message: 'Vui lòng nhập mã xác thực',
      trigger: 'blur',
    },
  ],
})

const emit = defineEmits<{
  (event: 'close', payload: boolean): void
}>()

watch(() => props.visible, (val) => {
  dialogVisible.value = val
  if (val) {
    getOauthCaptcha()
  }
})

const closeLogin = () => {
  emit('close', false)
  qrcode.value = ''
}

const changeCheckType = (val: number) => {
  checkType.value = val
}

const getOauthWechat = async () => {
  const result = await oauthWechat()
  if (result.data.code === 200) {
    qrcode.value = result.data.data.img
  }
}

const getOauthCaptcha = async () => {
  loginCaptchaLoading.value = true
  const result = await imageCaptcha()
  if (result.data.code === 200) {
    loginCaptchaImage.value = 'data:image/png;base64,' + result.data.data.image
    loginCaptchaLoading.value = false
  }
}

const getEmailCaptcha = async () => {
  if (!ruleForm.email) return
  const result = await emailCaptcha({email: ruleForm.email})
  if (result && result.data) {
    ElMessage.success(result.data.data.msg)
  }
}

const handleVerify = () => {
  if (checkType.value === 1) {
    handleLogin()
  } 
  else {
    handleRegister()
  }
}

const userStore = useUserStore()
const { loginStatus, username } = storeToRefs(userStore)

const handleRegister = async () => {
  const result = await oauthRegister(ruleForm)
  if (result.data.code === 200 && result.data.data.code) {
    ElMessage.success('Đăng ký thành công')
    const code = result.data.data.code
    await handleLogin(code)
  } else {
    ElMessage.error(result.data.msg || 'Đăng ký thất bại')
    getOauthCaptcha()
  }
}

const handleLogin = async (code?: string) => {
  if (code) ruleForm.captcha = code
  const result = await oauthLogin(ruleForm)
  if (result.data.code === 200) {
    loginStatus.value = true
    const userResult = result.data.data
    localStorage.set('access_token', userResult.access_token)
    localStorage.set('user_info', userResult.user)
    userStore.setUserInfo({
      id: userResult.user.id,
      uuid: userResult.user.uuid,
      username: userResult.user.username,
      nickname: userResult.user.nickname,
      phone: userResult.user.phone || '',
      avatar: userResult.user.avatar || '',
      deptId: userResult.user.dept_id || 0,
      email: userResult.user.email,
      isMultiLogin: userResult.user.is_multi_login,
      isStaff: userResult.user.is_staff,
      isSuperuser: userResult.user.is_superuser,
      joinTime: userResult.user.join_time,
      lastLoginTime: userResult.user.last_login_time,
      loginStatus: true,
      token: userResult.access_token
    })
    username.value = userResult.user.username
    emit('close', false)
    ElMessage.success('Đăng nhập thành công')
  } else {
    ElMessage.error(result.data.msg || 'Đăng nhập thất bại')
    getOauthCaptcha()
  }
}

const loginGithub = async () => {
  const res = await oauthTokenGithub()
  if (res.data && res.data.code === 200) {
    const oauthWindow = window.open(res.data.data, '_blank', 'width=600,height=400,menubar=no,toolbar=no,location=no')
    window.addEventListener('message', (event: any) => {
      if (event.origin === window.location.origin) {
        loginStatus.value = true
        const userResult = event.data as UserResult
        localStorage.set('access_token', userResult.access_token)
        username.value = userResult.user.username
        oauthWindow?.close()
        emit('close', false)
      }
    });
  }
}

const loginQQ = () => {
  loginType.value = 1
  loginInfo.value = 'WeChat'
}

const loginEmail = () => {
  loginType.value = 2
  loginInfo.value = 'tài khoản'
  getOauthCaptcha()
}

// onMounted(() => {
//   getOauthCaptcha()
// })

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