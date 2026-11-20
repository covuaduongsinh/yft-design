<template>
  <div>
    <el-container>
      <el-header class="border-b-[1px] items-center flex">
        <el-row class="justify-between items-center">
          <el-col :span="4" class="h-[50px]">
            <img src="@/assets/logo.svg" alt="" class="h-full">
          </el-col>
          <el-col :span="6" class="flex justify-end col-user items-center">
            <UserMenu />
          </el-col>
        </el-row>
      </el-header>
      <el-container>
        <el-aside width="216px">
          <el-menu active-text-color="#000" :default-active="activeMenu" class="pt-[20px] h-lvh" @select="selectMenu">
            <el-menu-item index="1">
              <span class="flex w-[30px] justify-center">
                <IconNavigation/>
              </span>
              <span>Dành cho bạn</span>
            </el-menu-item>
            <el-menu-item index="designs">
              <span class="flex w-[30px] justify-center">
                <IconFolderClose/>
              </span>
              <span>Thiết kế của tôi</span>
            </el-menu-item>
            <el-menu-item index="trash">
              <span class="flex w-[30px] justify-center">
                <IconDelete/>
              </span>
              <span>Thùng rác</span>
            </el-menu-item>
            <el-menu-item index="2">
              <span class="flex w-[30px] justify-center">
                <SvgIcon icon-class="chatgpt" className="svg-size" />
              </span>
              <span>AI thông minh</span>
            </el-menu-item>
            <el-menu-item index="3">
              <span class="flex w-[30px] justify-center">
                <IconViewList/>
              </span>
              <span>Không gian mẫu</span>
            </el-menu-item>
          </el-menu>
        </el-aside>
        <el-main @scroll="handleScroll" class="h-lvh" id="main">
          <MyDesigns v-if="activeMenu === 'designs' || activeMenu === 'trash'" :trashed="activeMenu === 'trash'" />
          <!-- Giữ khối đề xuất trong DOM (v-show) vì bố cục thác nước được đo theo phần tử này. -->
          <div v-show="activeMenu !== 'designs' && activeMenu !== 'trash'">
            <MainSearch />
            <!-- <MainScene />
            <MainTools /> -->
            <el-row class="mt-[40px]">
              <b class="text-[20px]">Đề xuất hôm nay</b>
            </el-row>
            <TransitionGroup :name="resultReactive.move ? 'group' : ''" tag="div" class="waterfall-box" id="homeWaterfall">
              <div class="waterfall-item" v-for="(item, index) in resultReactive.items" :key="item.id">
                <img class="pic" :src="item.preview" alt="" :ref="(e: any) => setItemStyle(e, index)" @click="changeTemplate(item.id)">
                <div class="title">{{ item.title }}</div>
                <div class="content ellipsis_2">{{ item.text }}</div>
                <!-- Quản lý mẫu: chỉ hiện với staff, quyền thật do server kiểm tra. -->
                <div v-if="isStaff" class="staff-actions">
                  <el-tag v-if="item.is_published === false" size="small" type="info">Đang ẩn</el-tag>
                  <span v-else class="text-[12px] text-[#9da3ac]">{{ item.use_count || 0 }} lượt dùng</span>
                  <span>
                    <el-button link size="small" type="primary" @click="togglePublished(item)">{{ item.is_published === false ? 'Hiện' : 'Ẩn' }}</el-button>
                    <el-button link size="small" type="danger" @click="removeTemplate(item)">Xoá</el-button>
                  </span>
                </div>
              </div>
            </TransitionGroup>
          </div>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script lang="ts" setup>
import MainSearch from './components/MainSearch.vue';
import MainScene from './components/MainScene.vue';
import MainTools from './components/MainTools.vue';
import { getTemplateInfoPages, updateTemplate, deleteTemplate } from '@/api/template'
import { useUserStore } from '@/store'
import { ElMessage, ElMessageBox } from 'element-plus'
import { TemplateItem } from '@/api/template/types'
import { throttle } from 'lodash-es'
import { PageSize } from "@/configs/size"
import { useRouter } from 'vue-router'
import UserMenu from '@/components/UserMenu/index.vue'
import MyDesigns from './components/MyDesigns.vue'

const router = useRouter()
// Mục đang chọn ở menu trái; mở /home?tab=designs để vào thẳng "Thiết kế của tôi".
const initialTab = router.currentRoute.value.query.tab
const activeMenu = ref(initialTab === 'designs' || initialTab === 'trash' ? initialTab : '1')
const selectMenu = (index: string) => {
  activeMenu.value = index
}
const resultReactive = reactive({
  loading: false,
  page: 1,
  totalPage: 1,
  column: 6,
  move: true,
  items: [] as TemplateItem[],
});

const handleScroll = throttle(async () => {
  const mainElement = document.getElementById('main') as HTMLElement
  const scrollHeight = mainElement.scrollHeight, scrollTop = mainElement.scrollTop, clientHeight = mainElement.clientHeight
  if (scrollHeight - (scrollTop + clientHeight) <= 200) {
    if (resultReactive.page < resultReactive.totalPage) {
      resultReactive.page += 1
      await getTemplateItems()
    }
  }
}, 300)

const setItemStyle = (img: HTMLImageElement, index: number) => {
  if (!img) return;
  const update = () => {
    const item = img.parentElement;
    if (!item) return;
    const gapRows = index >= resultReactive.column ? 8 : 0;
    const rows = Math.ceil(item.clientHeight / 2) + gapRows;
    item.style.gridRowEnd = `span ${rows}`;
  }
  update();
  img.onload = update;
  img.onerror = function() {
    img.src = new URL(`/src/assets/images/loading.gif`, import.meta.url).href;
    update();
  };
}

const loadTemplateImage = async () => {
  resultReactive.items.forEach(item => {
    const itemImages = item.images
    if (itemImages && JSON.parse(itemImages)) {
      const images = JSON.parse(itemImages) as string[]
      images.forEach(ele => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = ele
      })
    }
  })
}

const userStore = useUserStore()
const isStaff = computed(() => userStore.loginStatus && (userStore.isStaff || userStore.isSuperuser))

const getTemplateItems = async () => {
  // Staff thấy cả mẫu đang ẩn để quản lý.
  const pageParams = { page: resultReactive.page, size: PageSize, all: isStaff.value ? 1 as const : undefined }
  try {
    const result = await getTemplateInfoPages(pageParams)
    resultReactive.page = result.data.data.page
    resultReactive.totalPage = result.data.data.total_pages
    resultReactive.items = resultReactive.items.concat(result.data.data.items)
  } catch (_) {
    // request.ts đã hiện thông báo lỗi
  }
}

const reloadTemplates = async () => {
  resultReactive.page = 1
  resultReactive.items = []
  await getTemplateItems()
}

const togglePublished = async (item: TemplateItem) => {
  try {
    const result = await updateTemplate(item.id, { is_published: item.is_published === false })
    item.is_published = result.data.data.is_published
  } catch (_) {
    // request.ts đã hiện thông báo lỗi
  }
}

const removeTemplate = async (item: TemplateItem) => {
  try {
    await ElMessageBox.confirm(`Xoá mẫu "${item.title}"? Thiết kế đã tạo từ mẫu này không bị ảnh hưởng.`, 'Xoá mẫu', {
      confirmButtonText: 'Xoá',
      cancelButtonText: 'Huỷ',
      type: 'warning',
    })
    await deleteTemplate(item.id)
    resultReactive.items = resultReactive.items.filter((template) => template.id !== item.id)
    ElMessage.success('Đã xoá mẫu')
  } catch (_) {
    // Người dùng bấm huỷ, hoặc lỗi đã được thông báo.
  }
}

// Đăng nhập/đăng xuất làm đổi quyền xem mẫu ẩn: tải lại danh sách.
watch(isStaff, reloadTemplates)

const changeTemplate = (pk: number) => {
  const { href } = router.resolve({
    path: '/',
    query: {
      template: pk
    }
  })
  window.open(href, '_blank')
}

let observer: ResizeObserver;

onMounted(() => {
  // getData(true);
  getTemplateItems()
  const el = document.getElementById('homeWaterfall') as HTMLElement;
  observer = new ResizeObserver((entries) => {
    const rect = entries[0].contentRect;
    if (rect.width > 1200) {
      resultReactive.column = 6;
    } 
    else if (rect.width > 900) {
      resultReactive.column = 5;
    } 
    else if (rect.width > 600) {
      resultReactive.column = 4;
    }
    else if (rect.width > 300) {
      resultReactive.column = 3;
    }
    else if (rect.width > 200) {
      resultReactive.column = 2;
    }
    el.style.setProperty("--column", resultReactive.column.toString());
  });
  observer.observe(el);
});

onUnmounted(() => {
  observer.disconnect();
})

</script>

<style lang="scss" scoped>
.col-user {
  display: flex;
}
.el-aside .el-menu .el-menu-item {
  height: 40px;
  padding-left: 0;
  padding-right: 0;
  margin-left: var(--el-menu-level-padding);
  border-radius: 5px;
  &:hover {
    background-color: #f1f2f4;
  }
}
.el-aside .el-menu .is-active {
  background-color: #f1f2f4;
}
.group-move,
.group-enter-active,
.group-leave-active {
  transition: .8s all;
}

.group-enter-from,
.group-leave-to {
  opacity: 0;
  transform: translate3d(0px, 30px, 0);
}

.group-leave-active {
  position: absolute;
}

.waterfall-box {
  --column: 6;
  display: grid;
  grid-template-columns: repeat(var(--column), 1fr);
  grid-gap: 0 20px;
  padding: 20px 0;
  align-items: end;
  .waterfall-item {
    background-color: #fff;
    margin-bottom: 20px;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0px 0px 12px rgba(0, 0, 0, .12);
    padding: 10px;
    .pic {
      display: block;
      width: 100%;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 14px;
      outline: 1px solid $borderColor;
      cursor: pointer;
      &:hover {
        outline-color: $themeColor;
      }
    }
    .title {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 8px;
    }
    .content {
      font-size: 14px;
      color: #222;
      line-height: 20px;
      height: 40px;
    }
    .staff-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid $borderColor;
    }
  }
}
</style>
<style scoped>
:deep(.row-home .el-input .el-select) {
  width: 115px;
  height: 40px;
}
:deep(.row-home .el-input .el-select__wrapper) {
  width: 115px;
  height: 40px;
}
</style>