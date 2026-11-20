<template>
  <el-dialog v-model="dialogVisible" title="Đăng làm mẫu dùng chung" width="420px" append-to-body @open="reset">
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <el-form-item label="Tên mẫu" prop="title">
        <el-input v-model="form.title" maxlength="200" />
      </el-form-item>
      <el-form-item label="Mô tả ngắn" prop="text">
        <el-input v-model="form.text" type="textarea" :rows="2" maxlength="500" placeholder="Hiện dưới ảnh xem trước ở trang chủ" />
      </el-form-item>
      <el-form-item label="Danh mục" prop="category">
        <el-input v-model="form.category" maxlength="60" placeholder="vd: Poster, Mạng xã hội, Giấy khen" />
      </el-form-item>
    </el-form>
    <div class="text-[12px] text-[#9da3ac]">
      Mọi người dùng sẽ thấy và dùng được mẫu này. Nội dung mẫu là bản chụp tại thời điểm đăng; sửa thiết kế sau đó không làm đổi mẫu.
    </div>
    <template #footer>
      <el-button @click="dialogVisible = false">Huỷ</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">Đăng mẫu</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useDesignStore } from '@/store'
import useDesign from '@/hooks/useDesign'

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

const designStore = useDesignStore()
const { publishTemplate } = useDesign()
const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = reactive({ title: '', text: '', category: '' })
const rules = reactive<FormRules<typeof form>>({
  title: [{ required: true, message: 'Vui lòng nhập tên mẫu', trigger: 'blur' }],
})

const reset = () => {
  form.title = designStore.title || ''
  form.text = ''
  form.category = ''
}

const submit = async () => {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await publishTemplate({ title: form.title, text: form.text, category: form.category })
    ElMessage.success('Đã đăng mẫu. Mẫu sẽ hiện ở trang chủ và trong mục Mẫu của trình chỉnh sửa.')
    dialogVisible.value = false
  } catch (_) {
    // request.ts đã hiện thông báo lỗi
  } finally {
    submitting.value = false
  }
}
</script>
