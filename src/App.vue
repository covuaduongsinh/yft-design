<!--
 * @Author: June 1601745371@qq.com
 * @Date: 2024-03-08 09:06:56
 * @LastEditors: June 1601745371@qq.com
 * @LastEditTime: 2024-03-11 12:00:19
 * @FilePath: \github\yft-design\src\App.vue
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
<template>
  <el-config-provider :locale="locale">
    <router-view />
  </el-config-provider>
</template>

<script lang="ts" setup>
import useI18n from '@/hooks/useI18n'

const { messages, locale: currentLocale }= useI18n()
// messages chứa mọi ngôn ngữ ({ vi, en }), phải lấy đúng ngôn ngữ đang chọn rồi mới đọc khoá `el`
const locale = computed(() => messages.value[currentLocale.value])

// 在主入口监听PWA注册事件
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.deferredPrompt = e;
})


</script>

<style lang="scss">
#app {
  height: 100%;
}
</style>
<style scoped>
:deep(#app .el-divider .el-divider--horizontal) {
  margin: 12px 0;
}
</style>