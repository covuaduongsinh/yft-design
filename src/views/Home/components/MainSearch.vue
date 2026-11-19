<template>
  <el-row :gutter="20" class="h-[100px] flex items-center row-home">
    <el-col :span="10" :offset="7">
      <el-input class="h-[40px]" :prefix-icon="Search" placeholder="Tìm kiếm mẫu thiết kế">
        <template #append>
          <el-select v-model="searchSelect" placeholder="Select">
            <el-option label="Mẫu chọn lọc" value="1" />
            <el-option label="Không gian của tôi" value="2" />
          </el-select>
        </template>
      </el-input>
    </el-col>
  </el-row>
</template>

<script setup lang="ts">
import { Search } from '@element-plus/icons-vue';
const searchSelect = ref<string>('1')
</script>