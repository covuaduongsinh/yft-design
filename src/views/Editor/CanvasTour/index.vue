<template>
  <div>
    <el-tour v-model="open" @close="closeTour()" @finish="closeTour()">
      <el-tour-step target=".left-top-tabs" title="">
        <div>Tạo thiết kế nhanh, tải tệp lên, định vị chính xác bằng đường tham chiếu!</div>
      </el-tour-step>
      <el-tour-step target="#left-tabs-editor" :title="$t('message.edit')" description="Tạo nên câu chuyện hình ảnh và chữ của bạn, chỉnh sửa dễ dàng với giao diện thao tác trực quan để ý tưởng tự do bay bổng!" />
      <el-tour-step target="#left-tabs-template" :title="$t('message.template')" description="Khám phá mẫu đề xuất, gom mẫu của tôi và mẫu của nhóm, mở rộng giới hạn sáng tạo, cùng tạo nên tác phẩm xuất sắc." />
      <el-tour-step target="#left-tabs-material" :title="$t('message.material')" description="Tìm tài nguyên đề xuất, quản lý mục yêu thích, xem lại các mục đã mua, tất cả ở một nơi để ý tưởng không giới hạn." />
      <el-tour-step target="#left-tabs-text" :title="$t('message.text')" description="Kết hợp chữ ngang và dọc, chữ rỗng mới lạ, sáng tạo nghệ thuật dàn trang chữ." />
      <el-tour-step target="#left-tabs-image" :title="$t('message.image')" description="Tải lên ảnh bạn thích, khám phá đề xuất chọn lọc, sắp xếp mục yêu thích, ảnh đẹp nằm gọn trong tầm tay." />
      <el-tour-step target="#left-tabs-toolkit" :title="$t('message.tool')" description="Tạo nhanh mã vạch, mã QR, công nghệ AI tách nền thông minh, nâng cao hiệu suất với lựa chọn thông minh." />
      <el-tour-step target="#left-tabs-layer" :title="$t('message.layer')" description="Kéo thả để sắp xếp, hiện hoặc ẩn phần tử chỉ một nhấp; khoá, mở khoá lớp dễ dàng, xoá tuỳ ý, làm chủ quy trình thiết kế của bạn." />
      <el-tour-step target="#left-tabs-help" :title="$t('message.help')" description="Gặp khó khăn? Hãy vào Trung tâm trợ giúp! Hướng dẫn người mới, hướng dẫn sử dụng, phím tắt giúp bạn làm việc hiệu quả, góp ý được phản hồi ngay, hỗ trợ trực tuyến giải đáp tức thì." />
    </el-tour>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { localStorage } from "@/utils/storage";

const open = ref(localStorage.get("YFT_DESIGN_TOUR") ?? true);
const closeTour = () => {
  open.value = false;
  localStorage.set("YFT_DESIGN_TOUR", false);
};
</script>

<style lang="scss" scoped></style>
