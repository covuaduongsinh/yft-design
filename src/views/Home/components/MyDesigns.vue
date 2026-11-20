<template>
  <div class="my-designs">
    <el-row class="mt-[30px] items-center justify-between">
      <b class="text-[20px]">{{ trashed ? 'Thùng rác' : 'Thiết kế của tôi' }}</b>
      <div v-if="userStore.loginStatus" class="flex items-center gap-2">
        <el-input v-model="query.q" placeholder="Tìm theo tên" clearable style="width: 220px" @keyup.enter="search" @clear="search" />
        <el-checkbox v-if="!trashed" v-model="starredOnly" @change="search">Chỉ gắn sao</el-checkbox>
        <el-button v-if="trashed" type="danger" plain :disabled="total === 0" @click="emptyTrash">Dọn thùng rác</el-button>
        <el-button v-else type="primary" @click="createNew">Tạo thiết kế mới</el-button>
      </div>
    </el-row>

    <div v-if="!userStore.loginStatus" class="empty">
      <p>Đăng nhập để lưu và xem lại các thiết kế của bạn.</p>
      <el-button type="primary" @click="userStore.requireLogin()">Đăng nhập / Đăng ký</el-button>
    </div>

    <template v-else>
      <div v-if="trashed" class="text-[12px] text-[#9da3ac] mt-[6px]">
        Thiết kế trong thùng rác sẽ tự bị xoá hẳn sau một thời gian. Khôi phục để tiếp tục chỉnh sửa.
      </div>
      <div v-loading="loading" class="design-grid">
        <div v-for="item in designs" :key="item.id" class="design-card">
          <div class="thumb" @click="open(item)">
            <img v-if="item.thumbnail" :src="item.thumbnail" alt="" loading="lazy">
            <div v-else class="thumb-empty">Chưa có ảnh xem trước</div>
            <span v-if="item.starred" class="star" title="Đã gắn sao">★</span>
          </div>
          <div class="meta">
            <div class="title ellipsis" :title="item.title">{{ item.title }}</div>
            <div class="sub">
              <span>{{ formatTime(trashed ? (item.trashed_at || item.updated_at) : item.updated_at) }} · {{ item.page_count }} trang</span>
              <el-dropdown trigger="click" @command="(command: string) => handle(command, item)">
                <span class="more" title="Thao tác">⋯</span>
                <template #dropdown>
                  <el-dropdown-menu v-if="trashed">
                    <el-dropdown-item command="restore">Khôi phục</el-dropdown-item>
                    <el-dropdown-item command="purge" divided>Xoá hẳn</el-dropdown-item>
                  </el-dropdown-menu>
                  <el-dropdown-menu v-else>
                    <el-dropdown-item command="open">Mở</el-dropdown-item>
                    <el-dropdown-item command="rename">Đổi tên</el-dropdown-item>
                    <el-dropdown-item command="duplicate">Nhân bản</el-dropdown-item>
                    <el-dropdown-item command="star">{{ item.starred ? 'Bỏ gắn sao' : 'Gắn sao' }}</el-dropdown-item>
                    <el-dropdown-item command="trash" divided>Chuyển vào thùng rác</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>
      </div>
      <div v-if="!loading && designs.length === 0" class="empty">
        <p>{{ trashed ? 'Thùng rác đang trống.' : (query.q || starredOnly ? 'Không tìm thấy thiết kế phù hợp.' : 'Bạn chưa lưu thiết kế nào. Mở trình chỉnh sửa và bấm "Lưu" để bắt đầu.') }}</p>
      </div>
      <el-pagination
        v-if="total > query.size"
        class="mt-[10px] justify-center"
        layout="prev, pager, next"
        :total="total"
        :page-size="query.size"
        v-model:current-page="query.page"
        @current-change="reload"
      />
    </template>
  </div>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/store'
import {
  deleteDesignPermanently,
  duplicateDesign,
  emptyDesignTrash,
  listDesigns,
  restoreDesign,
  trashDesign,
  updateDesign,
} from '@/api/design'
import type { DesignSummary } from '@/api/design/types'

const props = defineProps({
  /** true = hiển thị thùng rác thay cho danh sách thiết kế. */
  trashed: {
    type: Boolean,
    default: false,
  },
})

const router = useRouter()
const userStore = useUserStore()
const designs = ref<DesignSummary[]>([])
const total = ref(0)
const loading = ref(false)
const starredOnly = ref(false)
const query = reactive({ q: '', page: 1, size: 24 })

const formatTime = (ms: number) => new Date(ms).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })

const reload = async () => {
  if (!userStore.loginStatus) {
    designs.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const result = await listDesigns({
      q: query.q || undefined,
      page: query.page,
      size: query.size,
      trashed: props.trashed ? 1 : 0,
      starred: !props.trashed && starredOnly.value ? 1 : undefined,
    })
    designs.value = result.data.data.items
    total.value = result.data.data.total
    // Xoá hết mục ở trang cuối thì lùi về trang trước.
    if (designs.value.length === 0 && query.page > 1) {
      query.page -= 1
      await reload()
    }
  } catch (_) {
    // request.ts đã hiện thông báo lỗi
  } finally {
    loading.value = false
  }
}

const search = () => {
  query.page = 1
  reload()
}

const editorUrl = (designId?: string) => router.resolve({ path: '/', query: designId ? { design: designId } : {} }).href

const open = (item: DesignSummary) => {
  if (props.trashed) {
    ElMessage.info('Hãy khôi phục thiết kế trước khi mở')
    return
  }
  window.open(editorUrl(item.id), '_blank')
}

const createNew = () => window.open(editorUrl(), '_blank')

const handle = async (command: string, item: DesignSummary) => {
  try {
    if (command === 'open') return open(item)
    if (command === 'rename') {
      const { value } = await ElMessageBox.prompt('Tên thiết kế', 'Đổi tên', {
        confirmButtonText: 'Lưu',
        cancelButtonText: 'Huỷ',
        inputValue: item.title,
        inputValidator: (input: string) => (!!input && input.trim().length > 0) || 'Tên không được để trống',
      })
      const result = await updateDesign(item.id, { title: value }, false)
      item.title = result.data.data.title
      return
    }
    if (command === 'star') {
      const result = await updateDesign(item.id, { starred: !item.starred }, false)
      item.starred = result.data.data.starred
      if (starredOnly.value) reload()
      return
    }
    if (command === 'duplicate') {
      await duplicateDesign(item.id)
      ElMessage.success('Đã nhân bản thiết kế')
    }
    else if (command === 'trash') {
      await trashDesign(item.id)
      ElMessage.success('Đã chuyển vào thùng rác')
    }
    else if (command === 'restore') {
      await restoreDesign(item.id)
      ElMessage.success('Đã khôi phục thiết kế')
    }
    else if (command === 'purge') {
      await ElMessageBox.confirm(`Xoá hẳn "${item.title}"? Thao tác này không hoàn tác được.`, 'Xoá hẳn thiết kế', {
        confirmButtonText: 'Xoá hẳn',
        cancelButtonText: 'Huỷ',
        type: 'warning',
      })
      await deleteDesignPermanently(item.id)
      ElMessage.success('Đã xoá hẳn thiết kế')
    }
    reload()
  } catch (_) {
    // Người dùng bấm huỷ, hoặc lỗi đã được thông báo.
  }
}

const emptyTrash = async () => {
  try {
    await ElMessageBox.confirm('Xoá hẳn mọi thiết kế trong thùng rác? Thao tác này không hoàn tác được.', 'Dọn thùng rác', {
      confirmButtonText: 'Xoá hẳn tất cả',
      cancelButtonText: 'Huỷ',
      type: 'warning',
    })
    await emptyDesignTrash()
    ElMessage.success('Đã dọn thùng rác')
    reload()
  } catch (_) {
    // Người dùng bấm huỷ, hoặc lỗi đã được thông báo.
  }
}

watch(() => [props.trashed, userStore.loginStatus], () => {
  query.page = 1
  query.q = ''
  reload()
})

// Quay lại tab này sau khi sửa ở tab trình chỉnh sửa: cập nhật ảnh xem trước và thời gian.
const onVisible = () => { if (!document.hidden) reload() }
onMounted(() => {
  reload()
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))
</script>

<style lang="scss" scoped>
.design-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
  padding: 20px 0;
  min-height: 120px;
}
.design-card {
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 0 12px rgba(0, 0, 0, .12);
  .thumb {
    position: relative;
    height: 150px;
    background: #f5f6f8;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .thumb-empty {
      font-size: 12px;
      color: #9da3ac;
    }
    .star {
      position: absolute;
      top: 6px;
      right: 8px;
      color: #f5a623;
      font-size: 18px;
    }
  }
  .meta {
    padding: 10px 12px;
  }
  .title {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: #9da3ac;
    margin-top: 4px;
  }
  .more {
    cursor: pointer;
    font-size: 18px;
    padding: 0 6px;
    color: #606266;
    &:hover {
      color: $themeColor;
    }
  }
}
.empty {
  text-align: center;
  color: #9da3ac;
  padding: 50px 0;
  p {
    margin-bottom: 14px;
  }
}
</style>
