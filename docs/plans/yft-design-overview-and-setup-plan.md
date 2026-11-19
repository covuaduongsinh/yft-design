# Kế Hoạch Tìm Hiểu, Giới Thiệu Chi Tiết & Vận Hành yft-design

> **Địa điểm lưu trữ**: `/docs/plans/yft-design-overview-and-setup-plan.md`  
> **Quy ước dự án**: Tất cả kế hoạch nghiên cứu, phát triển và triển khai từ nay sẽ được lưu trữ tại thư mục `/docs/plans/`.

---

## 1. Giới thiệu tổng quan về yft-design

**yft-design** là một công cụ thiết kế đồ họa và chỉnh sửa hình ảnh trực tuyến mã nguồn mở (Open-source Web-based Graphic Design Tool & Poster Editor) được xây dựng dựa trên HTML5 Canvas. Dự án được ví như một phiên bản mã nguồn mở tương tự **Canva** hoặc **Gaoding Design (稿定设计)**.

### 1.1. Mục đích sử dụng
- **Thiết kế ấn phẩm truyền thông & Marketing**: Tạo poster quảng cáo, banner, thiệp mời, brochure, infographic.
- **Thương mại điện tử (E-commerce)**: Thiết kế ảnh sản phẩm, banner khuyến mãi, ảnh danh mục.
- **Nội dung mạng xã hội**: Ảnh bìa Facebook, thumbnail YouTube, bài đăng Instagram, đồ họa blog.
- **Xử lý tài liệu & định dạng chuyên dụng**: Nhập và biên tập lại từ file Photoshop (`.psd`), file `.pdf`, và file vector `.svg`.

### 1.2. Điểm nổi bật & Khác biệt
- **Khả năng phục hồi định dạng PSD / PDF cao cấp**: Có parser chuyên biệt để bóc tách file `.psd` và `.pdf` thành các đối tượng Canvas có thể chỉnh sửa trực tiếp (layers, text, shapes, effects).
- **Xuất file đa dạng**: Hỗ trợ xuất ảnh raster (PNG, JPG), vector (SVG) và tài liệu in ấn (PDF).
- **Hiệu năng Canvas cao**: Sử dụng Fabric.js (phiên bản v6.4+) kết hợp với Web Workers để xử lý tính toán nền mà không làm đơ giao diện người dùng.
- **Giao diện hiện đại & Thân thiện**: Phát triển bằng Vue 3 + TypeScript + Element Plus + TailwindCSS, hỗ trợ đa ngôn ngữ (i18n).

---

## 2. Kiến trúc Công nghệ & Cấu trúc Thư mục

### 2.1. Tech Stack
- **Framework & Ngôn ngữ**: [Vue 3](https://vuejs.org/) (Composition API), [TypeScript 4.9+](https://www.typescriptlang.org/)
- **Build Tool**: [Vite 5](https://vitejs.dev/)
- **Canvas Rendering Engine**: [Fabric.js 6.4+](http://fabricjs.com/)
- **UI Components & Icons**: [Element Plus](https://element-plus.org/), `@icon-park/vue-next`
- **Styling**: [TailwindCSS](https://tailwindcss.com/), Sass, Less
- **State Management**: [Pinia](https://pinia.vuejs.org/)
- **Local Database / Storage**: [Dexie.js](https://dexie.org/) (IndexedDB wrapper)
- **Geometry & Graphics Utilities**:
  - `clipper-lib`: Cắt ghép đa giác (polygon clipping).
  - `delaunator`: Tam giác hóa Delaunay.
  - `opentype.js`: Phân tích và render font chữ vector.
  - `perfect-freehand`: Vẽ tay mượt mà (smooth brush / handwriting).
  - `chroma-js`, `tinycolor2`: Xử lý màu sắc, bảng màu, gradient.
  - `pako`: Nén và giải nén dữ liệu zlib/deflate.

### 2.2. Sơ đồ Cấu trúc Thư mục (`src/`)

```
src/
├── api/             # Các API giao tiếp backend (upload file, tách nền, xuất PDF)
├── app/             # Fabric.js Canvas Core Controllers:
│   ├── fabricCanvas/   # Quản lý vòng đời và instance canvas
│   ├── fabricControls/ # Bounding box, handles, điểm xoay/kéo giãn
│   ├── fabricRuler/    # Thước đo (pixel ruler) ngang & dọc
│   ├── fabricTool/     # Công cụ pan/drag canvas
│   ├── guideLines/     # Hệ thống đường gióng thông minh (smart alignment guidelines)
│   ├── hoverBorders/   # Viền hover preview khi rê chuột qua element
│   └── wheelScroll/    # Xử lý zoom/cuộn chuột mượt mà
├── assets/          # Tài nguyên tĩnh (styles, online fonts, logo)
├── components/      # UI components dùng chung (ColorPicker, Dropdown, Modal, v.v.)
├── configs/         # Cấu hình tĩnh (bảng màu, danh sách font chữ, hotkeys)
├── extension/       # Mở rộng Fabric.js Object:
│   ├── controls/    # Custom controllers cho crop ảnh, xoay góc
│   ├── mixins/      # Mixin chức năng (filter, cache, text wrapping)
│   └── object/      # Custom Canvas Objects (mã vạch, QR code, custom shape)
├── hooks/           # Vue 3 Composables tái sử dụng logic
├── mocks/           # Dữ liệu giả lập template, sticker, hình nền
├── plugins/         # Plugins Vue & Fabric tự định nghĩa
├── router/          # Cấu hình Vue Router
├── store/           # Pinia Stores (canvas, snapshot/history, user, canvas config)
├── types/           # Khai báo TypeScript types / interfaces
├── utils/           # Hàm tiện ích (tính toán toạ độ, xuất file, export image)
├── views/           # Các màn hình chính:
│   ├── Canvas/      # Wrapper chứa thẻ HTML5 Canvas
│   ├── Editor/      # Màn hình chính của Editor (Header, Sidebar, Content, Panels)
│   └── Home/        # Màn hình trang chủ / template picker
└── worker/          # Web Workers xử lý parse file nặng không block UI
```

---

## 3. Kế hoạch Tìm hiểu & Nghiên cứu Chi tiết

Kế hoạch này được chia thành 5 giai đoạn có thể tiến hành song song hoặc tuần tự:

| Giai đoạn | Nội dung trọng tâm | Mục tiêu đầu ra |
|-----------|--------------------|-----------------|
| **P1: Setup & Trải nghiệm thực tế** | Cài đặt dependencies, chạy dev server, thử nghiệm các tính năng trên giao diện | Chạy thành công ứng dụng trên local, nắm bắt luồng thao tác người dùng |
| **P2: Kiến trúc Canvas Core** | Nghiên cứu `src/app/` và cách `fabric.Canvas` được khởi tạo, quản lý sự kiện và render | Hiểu cơ chế zoom, pan, snap to guide lines, ruler và hover detection |
| **P3: Quản lý Trạng thái & Undo/Redo** | Phân tích `src/store/` và cách lưu lịch sử (Snapshot) khi có thay đổi trên Canvas | Nắm bắt cơ chế snapshot transaction, tối ưu hiệu năng lưu trữ với Dexie |
| **P4: Element System & Custom Extensions** | Khám phá `src/extension/` (Text, Image filters, QR Code, Barcode, Shape) | Biết cách tạo mới một custom element hoặc bổ sung tính năng vào object |
| **P5: Pipeline Nhập/Xuất & Tích hợp** | Tìm hiểu parser PSD/PDF/SVG và bộ xuất hình ảnh/SVG/PDF; các API upload/matting | Khả năng mở rộng API backend tự host hoặc tích hợp AI sinh ảnh/tách nền |

---

## 4. Hướng dẫn Cài đặt & Vận hành

### 4.1. Yêu cầu môi trường
- **Node.js**: Phiên bản 18+ (Dự án được tối ưu với Node 18.19.0).
- **Package Manager**: Khuyến nghị dùng `pnpm` (nhanh và tiết kiệm ổ đĩa) hoặc `npm`.

### 4.2. Các bước cài đặt
```powershell
# Di chuyển vào thư mục dự án
cd D:\code\yft-design

# Cài đặt toàn bộ dependencies
pnpm install
```

### 4.3. Chạy môi trường phát triển (Development)
```powershell
pnpm dev
```
Trình duyệt sẽ mở tại: `http://localhost:5173/` (hoặc cổng hiển thị trên terminal).

### 4.4. Build đóng gói Production
```powershell
pnpm build
```
Kết quả đóng gói nằm trong thư mục `dist/` sẵn sàng deploy lên Nginx, Docker hoặc Cloud.
