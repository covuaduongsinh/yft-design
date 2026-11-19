<template>
  <div>
    <div class="right-top">
      <div class="flex items-center px-[8px] gap-2">
        <Lang />
        <div v-if="userStore.username">
          <el-dropdown trigger="click">
            <span class="cursor-pointer select-none">
              <el-tag size="small" :type="userStore.isSuperuser ? 'danger' : (userStore.isStaff ? 'warning' : 'info')" effect="plain">
                {{ userStore.username }}
              </el-tag>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>
                  <span class="text-xs text-gray-500">{{ userStore.email }} ({{ userStore.isSuperuser ? 'Admin' : (userStore.isStaff ? 'Staff' : 'User') }})</span>
                </el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">
                  Đăng xuất
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <div v-else>
          <el-button size="small" text type="primary" @click="loginDialogVisible = true">登录</el-button>
        </div>
      </div>
      <div>
        <el-button text>分享</el-button>
        <el-button type="primary" @click="exportFile">下载</el-button>
        <el-button text href="https://github.com/dromara/yft-design" tag="a" target="_blank" rel="noopener noreferrer">
          <IconGithub class="footer-button"></IconGithub>
        </el-button>
      </div>
    </div>
    <div class="right-bottom">
      <div class="right-tabs">
        <div
          class="tab"
          :class="[ tab.value === rightState && currentTabs.length > 1 ? 'active' : 'no-active' ]"
          v-for="tab in currentTabs"
          :key="tab.value"
          @click="setRightState(tab.value)"
        >
          {{ tab.label }}
        </div>
      </div>
      <div class="right-content">
        <component :is="currentPanelComponent"></component>
      </div>
    </div>
    <FileExport v-model:visible="exportFileDialog" @close="exportFileHide" @save="exportFileHandle" />
    <LoginDialog :visible="loginDialogVisible" @close="loginDialogVisible = false" />
  </div>
</template>
<script lang="ts" setup>
import { computed, watch, ref } from "vue";
import { RightStates, ElementNames } from "@/types/elements";
import { storeToRefs } from "pinia";
import { useMainStore, useUserStore } from "@/store";
import LoginDialog from "@/components/LoginDialog/index.vue";
import Lang from "@/components/Lang/index.vue";
import CanvasStylePanel from "./CanvasStylePanel/index.vue";
import ElemnetStylePanel from "./ElementStylePanel/index.vue";
import EffectStylePanel from "./EffectStylePanel/index.vue";
import LayerStylePanel from "./LayerStylePanel/index.vue";
import useI18n from "@/hooks/useI18n";
const { t } = useI18n();

const mainStore = useMainStore();
const userStore = useUserStore();
const loginDialogVisible = ref(false);
const { canvasObject, rightState } = storeToRefs(mainStore);
const exportFileDialog = ref(false)

const handleLogout = () => {
  userStore.logout();
  ElMessage.success('Đã đăng xuất tài khoản');
}


const exportFileHide = () => {
  exportFileDialog.value = false
}

const exportFileHandle = () => {
  exportFileDialog.value = false
}

const exportFile = () => {
  exportFileDialog.value = true
}

const canvasTabs = [
  { label: t("style.canvas"), value: RightStates.ELEMENT_CANVAS },
  { label: t("style.layer"), value: RightStates.ELEMENT_LAYER },
];
const styleTabs = [
  { label: t("style.style"), value: RightStates.ELEMENT_STYLE },
  { label: t("style.layer"), value: RightStates.ELEMENT_LAYER },
];

const setRightState = (value: RightStates) => {
  mainStore.setRightState(value);
};

const currentTabs = computed(() => {
  if (!canvasObject.value) return canvasTabs;
  if (canvasObject.value.type.toLowerCase() === ElementNames.REFERENCELINE) return canvasTabs;
  return styleTabs;
});

watch(currentTabs, () => {
  const currentTabsValue: RightStates[] = currentTabs.value.map(
    (tab) => tab.value
  );
  if (!currentTabsValue.includes(rightState.value)) {
    mainStore.setRightState(currentTabsValue[0]);
  }
});

const currentPanelComponent = computed(() => {
  const panelMap = {
    [RightStates.ELEMENT_CANVAS]: CanvasStylePanel,
    [RightStates.ELEMENT_STYLE]: ElemnetStylePanel,
    [RightStates.ELEMENT_EFFECT]: EffectStylePanel,
    [RightStates.ELEMENT_LAYER]: LayerStylePanel,
  };
  return panelMap[rightState.value as RightStates.ELEMENT_STYLE];
});
</script>


<style lang="scss" scoped>
.right-top {
  height: 40px;
  width: 100%;
  display: flex;
  align-items: center;
  border-bottom: 1px solid $borderColor;
}
.right-bottom {
  height: calc(100% - 40px);
}
.right-tabs {
  height: 32px;
  font-size: 12px;
  flex-shrink: 0;
  display: flex;
  user-select: none;
}
.tab {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: $lightGray;
  border-bottom: 1px solid $borderColor;
  cursor: pointer;

  &.active {
    background-color: #fff;
    border-bottom-color: #fff;
  }

  & + .tab {
    border-left: 1px solid $borderColor;
  }
}
.right-content {
  padding: 10px 5px 10px 10px;
  font-size: 13px;
  overflow-y: scroll;
  overflow-x: hidden;
  height: 100%;
  // @include overflow-overlay();
}
</style>