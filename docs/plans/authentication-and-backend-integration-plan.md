# Kế Hoạch & Hướng Dẫn Tích Hợp Đăng Nhập, Quản Lý Tài Khoản & Phân Quyền Cho yft-design

> **Địa điểm lưu trữ**: `/docs/plans/authentication-and-backend-integration-plan.md`  
> **Quy ước dự án**: Tất cả kế hoạch nghiên cứu, phát triển và triển khai luôn được lưu trữ tại thư mục `/docs/plans/`.

---

## 1. Hiện trạng tính năng trong kho mã nguồn yft-design

### 1.1. Core Editor (Trình chỉnh sửa Canvas) - ĐÃ CÀI ĐẶT 100%
Kho mã nguồn hiện tại đã cài đặt và chạy hoàn chỉnh **100% tính năng cốt lõi của Editor**:
- Toàn bộ Canvas Engine (Fabric.js 6.4+).
- Hệ thống công cụ vẽ, văn bản (Text, Curved Text, Vertical Text), hình khối (Shapes), sticker, icon.
- Bộ bóc tách & phục hồi định dạng chuyên sâu: Import file Photoshop (`.psd`), tài liệu `.pdf`, vector `.svg`.
- Công cụ cắt ghép ảnh (crop), bộ lọc (filters), tạo mã QR (`beautify-qrcode`) và mã vạch (`jsbarcode`).
- Xuất file đa dạng: PNG, JPG, SVG, JSON và PDF.
- Lưu trữ cục bộ không cần server: Toàn bộ bản vẽ và lịch sử Undo/Redo được quản lý trực tiếp trên trình duyệt qua IndexedDB (`Dexie.js`).

### 1.2. Tính năng Đăng nhập, Tài khoản & Phân quyền (Auth & RBAC)
- **Phía Frontend (ĐÃ CÓ SẴN)**:
  - Trang chủ quản lý: `http://localhost:5174/home` có nút **Đăng nhập / Đăng ký** ở góc trên bên phải.
  - Hộp thoại đăng nhập (`src/components/LoginDialog/index.vue`): Hỗ trợ đăng nhập Email + Mật khẩu + Captcha, đăng nhập qua Github OAuth, WeChat.
  - Quản lý trạng thái (`src/store/modules/user.ts`): Pinia Store `useUserStore` đã khai báo sẵn model UserState:
    ```typescript
    export interface UserState {
      id: number;
      uuid: string;
      username: string;
      nickname: string;
      phone: string;
      avatar: string;
      deptId: number;
      email: string;
      isStaff: boolean;        // Nhân viên
      isSuperuser: boolean;    // Quản trị viên cao cấp
      loginStatus: boolean;
      token: string;           // JWT Token
    }
    ```
- **Phía Backend (CHƯA CÓ TRONG KHO NGUỒN NÀY)**:
  - Dự án nguồn mở này chỉ là **Frontend SPA**. Tác giả không public mã nguồn server backend (cơ sở dữ liệu người dùng, RBAC).
  - Tác giả vận hành theo mô hình Freemium: Bản mã nguồn mở là Standalone Canvas Editor, còn bản Pro thương mại (`https://yft.design`) sở hữu backend đám mây quản lý tài khoản và lưu trữ template.

---

## 2. Hướng Dẫn Trải Nghiệm & Tự Dựng Backend

### 2.1. Trải nghiệm giao diện Đăng nhập có sẵn
1. Truy cập vào trang chủ:
   👉 **[http://localhost:5174/home](http://localhost:5174/home)**
2. Nhấn vào nút xanh **登陆/注册** (Đăng nhập / Đăng ký) ở góc trên bên phải màn hình.
3. Hộp thoại `LoginDialog` sẽ mở ra với các tùy chọn đăng nhập qua Email, mật khẩu, captcha hoặc liên kết tài khoản mạng xã hội.

### 2.2. Hướng dẫn xây dựng Backend riêng (Custom Backend Integration)
Nếu bạn muốn triển khai hệ thống nội bộ có đầy đủ Quản lý tài khoản, Phân quyền (Admin / Staff / User) và lưu bản vẽ lên Cloud, bạn chỉ cần xây dựng một server API đáp ứng các endpoint đã được định nghĩa tại `src/api/oauth/index.ts`:

#### Danh sách Endpoint cần hiện thực:
| Method | Endpoint | Mô tả | Dữ liệu trả về |
|--------|----------|-------|----------------|
| `GET` | `/api/oauth/captcha/image` | Lấy mã captcha hình ảnh | `{ code: 200, data: { img: base64, key: string } }` |
| `POST` | `/api/oauth/login` | Xác thực đăng nhập email/mật khẩu | `{ code: 200, data: { token: string, user: UserInfo } }` |
| `POST` | `/api/oauth/register` | Đăng ký tài khoản người dùng mới | `{ code: 200, data: { msg: "success" } }` |
| `GET` | `/api/oauth/github/token` | Lấy access token qua Github OAuth | `{ code: 200, data: { token: string } }` |

#### Kết nối Frontend với Backend của bạn:
Trong file `vite.config.mts`, trỏ proxy `/api` về địa chỉ backend của bạn:
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:8000', // Địa chỉ Backend của bạn (Node.js, Python, Java, v.v.)
    changeOrigin: true,
  }
}
```
Sau đó khởi động lại dev server bằng lệnh:
```powershell
pnpm dev
```
