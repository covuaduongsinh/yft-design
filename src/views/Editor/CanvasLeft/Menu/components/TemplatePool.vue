<template>
  <div>
    <el-row class="layout-search">
      <el-input
        :prefix-icon="Search"
        :placeholder="$t('message.searchTemp')"
      ></el-input>
    </el-row>
    <el-tabs v-model="activeTemplate" class="layout-tabs">
      <el-tab-pane :label="$t('message.recommendTemp')" name="data">
        <div class="layout-templates" @scroll="handleScroll" ref="templateRef">
          <div v-for="(item, index) in templateItems" :key="item.id" class="thumbnail">
            <img :src="item.preview" :alt="item.title" :title="item.title" :ref="(e: any) => setItemStyle(e, index)" @click="handleChangeTemplate(item)"/>
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane :label="$t('message.myTemp')" name="self">
        <el-radio-group v-model="activeSelfTemplate" size="large" class="full-ratio">
          <el-radio-button value="buy" :label="$t('message.myPurchases')" />
          <el-radio-button value="collect" :label="$t('message.myFavorites')" />
        </el-radio-group>
      </el-tab-pane>
      <el-tab-pane :label="$t('message.teamTemp')" name="team">{{ $t("message.teamTemp") }}</el-tab-pane>
    </el-tabs>
  </div>
</template>

<script lang="ts" setup>
import { Search } from "@element-plus/icons-vue"
import { onMounted, ref } from "vue"
import { getTemplateDetailPages, getTemplateData } from '@/api/template'
import { TemplateItem } from '@/api/template/types'
import { useDesignStore, useTemplatesStore } from '@/store'
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus'
import { unzip } from "@/utils/crypto"
import { PageSize } from "@/configs/size"
import { throttle, debounce } from 'lodash-es'
import { useRouter } from 'vue-router'
import useDesign from '@/hooks/useDesign'

const router = useRouter()
const templatesStore = useTemplatesStore()
const designStore = useDesignStore()
const { checkpoint } = useDesign()
const templateItems = ref<TemplateItem[]>([])
const activeTemplate = ref("data");
const activeSelfTemplate = ref("buy");
// const images = ref<string[]>([])
const page = ref(1)
const totalPage = ref(1)
const templateRef = ref<HTMLElement | undefined>()

const setItemStyle = (img: HTMLImageElement, index: number) => {
  if (!img) return;
  const update = () => {
    const item = img.parentElement;
    if (!item) return;
    const gapRows = index >= 2 ? 2 : 0;
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

const handleScroll = debounce(async () => {
  const mainElement = templateRef.value as HTMLElement
  const scrollHeight = mainElement.scrollHeight, scrollTop = mainElement.scrollTop, clientHeight = mainElement.clientHeight
  if (scrollHeight - (scrollTop + clientHeight) <= 200) {
    if (page.value < totalPage.value) {
      page.value += 1
      await getTemplateItems()
    }
  }
}, 300)

const loadTemplateImage = () => {
  templateItems.value.forEach(item => {
    const itemImages = item.images
    if (itemImages && JSON.parse(itemImages)) {
      const images = JSON.parse(itemImages) as string[]
      images.forEach(ele => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = ele
        img.onerror = function() {
          img.src = new URL(`/src/assets/images/loading.gif`, import.meta.url).href;
        };
      })
    }
  })
}

const getTemplateItems = async () => {
  const pageParams = { page: page.value, size: PageSize }
  const result = await getTemplateDetailPages(pageParams)
  if (result.data && result.data.code === 200) {
    page.value = result.data.data.page
    totalPage.value = result.data.data.total_pages
    templateItems.value = templateItems.value.concat(result.data.data.items)
    // loadTemplateImage()
  }
}

const handleChangeTemplate = (item: TemplateItem) => {
  ElMessageBox.confirm(
    'Bạn có chắc muốn đổi mẫu không?',
    {
      confirmButtonText: 'OK',
      cancelButtonText: 'Cancel',
      type: 'warning',
    }
  )
    .then(async () => {
      const loadingInstance = ElLoading.service({ fullscreen: true, background: 'rgba(122, 122, 122, 0.5)' })
      try {
        // Danh sách chỉ có ảnh xem trước; tài liệu của template được tải khi người dùng chọn.
        const result = await getTemplateData(item.id)
        const data = unzip(result.data.data.data)
        const pages = Array.isArray(data) ? data : (Array.isArray(data.pages) ? data.pages : [data])
        if (designStore.bound) {
          // Đang sửa một thiết kế đã lưu: template sẽ thay toàn bộ nội dung của nó, nên lưu lại
          // trạng thái hiện tại thành một phiên bản trước để còn quay về được.
          await checkpoint('Trước khi đổi mẫu')
        }
        else {
          router.push(`${router.currentRoute.value.path}?template=${item.id}`)
        }
        await templatesStore.changeTemplate(pages)
        ElMessage({
          type: 'success',
          message: 'Đổi mẫu thành công',
        })
      }
      catch (_) {
        ElMessage({
          type: 'error',
          message: 'Tải mẫu thất bại, vui lòng liên hệ quản trị viên',
        })
      }
      finally {
        nextTick(() => loadingInstance.close())
      }
    })
    .catch(() => undefined) // người dùng bấm huỷ
}

onMounted(async () => {
  await getTemplateItems()
})
</script>

<style lang="scss" scoped>
:deep(.el-tabs__item) {
  padding: 0;
}
.layout-search {
  margin: 0 auto;
  width: 68%;
  padding: 20px 10px 10px;
}
.layout-tabs {
  width: 90%;
  margin: 0 auto;
}
.layout-templates {
  overflow: scroll;
  height: 100vh;
  flex-wrap: wrap;
  padding: 2px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-gap: 2px 0;
  padding-bottom: 20px;
  align-items: start;
  .thumbnail {
    padding: 2px 0;
  }
  .thumbnail img {
    outline: 1px solid $borderColor;
    width: 124px;
    margin: 0 5px;
    cursor: pointer;
    &:hover {
      outline-color: $themeColor;
    }
  }
}
.full-ratio {
  display: flex;
  flex: 1;
  .el-radio-button {
    width: 50%;
  }
  .el-radio-button__inner {
    width: 100%;
  }
}
:deep(.full-ratio .el-radio-button__inner) {
  width: 100%;
}
</style>
<style>
.el-tabs .el-tabs__nav {
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-around;
  width: 100%;
}
</style>