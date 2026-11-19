# Kế Hoạch & Triển Khai Xác Thực Người Dùng: Trải Nghiệm Giao Diện (Cách 1) & Tích Hợp Backend Nội Bộ (Cách 2)

> **Vị trí tài liệu**: `/docs/plans/auth-experience-and-custom-backend-implementation-plan.md`  
> **Quy ước dự án**: Tất cả tài liệu kế hoạch nghiên cứu, phân tích và triển khai luôn được lưu trữ tại thư mục `/docs/plans/`.  
> **Ngày khởi tạo**: 19/11/2026  
> **Trạng thái**: Đang triển khai (In Progress)

---

## 1. Tổng quan & Mục tiêu

Dự án `yft-design` là một công cụ thiết kế đồ họa Canvas mã nguồn mở (Vue 3 + Fabric.js). Kho mã nguồn hiện tại là một **Frontend SPA**, có sẵn giao diện đăng nhập/đăng ký và mô hình phân quyền (Pinia Store `useUserStore`), nhưng thiếu một Backend xử lý lưu trữ người dùng và xác thực.

Tài liệu này xác định kế hoạch và hướng dẫn triển khai hoàn chỉnh cho 2 yêu cầu:
1. **Cách 1: Trải nghiệm ngay giao diện Đăng nhập có sẵn** trên frontend.
2. **Cách 2: Tích hợp Backend riêng cho hệ thống nội bộ** (Custom Auth Backend & RBAC) giúp hệ thống đăng nhập, đăng ký, lưu trữ tài khoản và phân quyền hoạt động 100% trên máy nội bộ.

---

## 2. Kế hoạch Chi tiết & Khảo sát Cách 1 (Trải nghiệm giao diện có sẵn)

### 2.1. Vị trí & Cách kích hoạt giao diện
- **Trang chủ (`/home`)**:
  - Truy cập URL: `http://localhost:5174/home`.
  - Trên thanh Header góc trên bên phải có nút **"登录/注册" (Đăng nhập / Đăng ký)**.
  - Khi nhấp vào, biến `loginVisible` được kích hoạt để mở component `LoginDialog`.
- **Trình soạn thảo Editor (`/`)**:
  - Tại góc trên bên trái của thanh công cụ có nút biểu tượng ngôi nhà **Home** (`goHome`), nhấp vào sẽ chuyển hướng về `/home`.
  - Có thể tích hợp thêm nút Đăng nhập / Profile trực tiếp trên thanh công cụ Header của Editor (`CanvasRight/index.vue`).

### 2.2. Phân tích cấu trúc Component `LoginDialog` (`src/components/LoginDialog/index.vue`)
Giao diện `LoginDialog` bao gồm các chức năng:
1. **Chế độ đăng nhập linh hoạt**:
   - Tab 1: Đăng nhập mã QR WeChat/QQ.
   - Tab 2: Đăng nhập Email + Mật khẩu + Mã Captcha hình ảnh.
2. **Chuyển đổi trạng thái Đăng nhập <-> Đăng ký (`checkType`)**:
   - `checkType = 1`: Form Đăng nhập (gọi `oauthLogin`).
   - `checkType = 2`: Form Đăng ký (gọi `oauthRegister` và `emailCaptcha`).
3. **Mã xác thực hình ảnh (Captcha Image)**:
   - Khi mở modal, tự động gọi `imageCaptcha()` để lấy ảnh captcha base64 từ `/api/oauth/captcha/image`.
   - Nhấp vào ảnh để làm mới mã captcha mới.
4. **OAuth bên thứ 3**:
   - Nút đăng nhập GitHub OAuth (`oauthTokenGithub`) mở popup xác thực.

### 2.3. Hạn chế hiện tại & Lý do cần Cách 2
Khi chưa có Backend nội bộ, `vite.config.mts` chuyển tiếp request `/api/oauth/*` ra internet (`https://yft.design`). Máy chủ cloud này không mở public API xác thực, dẫn đến:
- Mã captcha bị quay tròn vô hạn (`v-loading`).
- Nhấn đăng nhập hoặc đăng ký bị lỗi mạng hoặc timeout.
=> **Do đó, triển khai Cách 2 là bước cốt lõi để Cách 1 hoạt động thực sự.**

---

## 3. Kế hoạch Triển khai Cách 2 (Tích hợp Backend riêng cho hệ sinh thái nội bộ)

### 3.1. Lựa chọn kiến trúc & Công nghệ Backend
- **Nền tảng**: Sử dụng Node.js sẵn có trên máy (`v22.15.0 LTS`).
- **Triết lý**: Xây dựng service HTTP độc lập, không phát sinh thêm package phụ thuộc rườm rà, sử dụng các module chuẩn của Node.js (`node:http`, `node:fs`, `node:crypto`, `node:zlib`).
- **Lưu trữ dữ liệu**: Dùng file CSDL JSON `server/data/users.json` để lưu trữ danh sách tài khoản, hồ sơ người dùng và quyền hạn (RBAC), vừa trực quan, dễ quản lý, không đòi hỏi cài đặt MySQL/PostgreSQL phức tạp.

### 3.2. Cấu trúc thư mục Backend đề xuất
```
yft-design/
├── server/
│   ├── index.mjs              # Server HTTP REST API (chạy port 8788)
│   ├── captcha.mjs            # Bộ sinh mã Captcha & render ảnh PNG base64
│   └── data/
│       └── users.json         # Cơ sở dữ liệu người dùng & phân quyền nội bộ
├── start-all.bat              # Script 1-click khởi chạy cả Backend & Frontend
└── docs/plans/                # Thư mục lưu kế hoạch dự án
```

### 3.3. Đặc tả API Endpoints Backend nội bộ
Hợp đồng API chuẩn xác theo `src/api/oauth/types.ts`:

| Method | Endpoint | Nhiệm vụ | Dữ liệu đầu vào | Phản hồi (JSON) |
|---|---|---|---|---|
| `GET` | `/api/oauth/captcha/image` | Cung cấp ảnh Captcha | Không | `{ code: 200, data: { image: "<base64>", image_type: "png" }, msg: "success" }` |
| `POST` | `/api/oauth/login` | Đăng nhập tài khoản | `{ email, password, captcha }` | `{ code: 200, data: { access_token, user: YFTUser }, msg: "登录成功" }` |
| `POST` | `/api/oauth/register` | Đăng ký tài khoản mới | `{ email, password, captcha }` | `{ code: 200, data: { code: captcha }, msg: "注册成功" }` |
| `POST` | `/api/oauth/captcha/email` | Gửi mã OTP qua email | `{ email }` | `{ code: 200, data: { msg: "Mã xác thực đã gửi" } }` |
| `GET` | `/api/oauth/github/token` | Đăng nhập GitHub mock | Không | `{ code: 200, data: "/#mock-github", msg: "success" }` |

### 3.4. Cấu hình Phân quyền người dùng (RBAC Matrix)
Trong `server/data/users.json`, định nghĩa sẵn 3 cấp độ tài khoản mẫu:

1. **Quản trị viên tối cao (Super Admin)**:
   - Email: `admin@yft.design`
   - Mật khẩu: `admin123`
   - Phân quyền: `is_superuser: true`, `is_staff: true`, `dept_id: 1`
2. **Nhân viên / Nhà thiết kế (Staff / Designer)**:
   - Email: `staff@yft.design`
   - Mật khẩu: `staff123`
   - Phân quyền: `is_superuser: false`, `is_staff: true`, `dept_id: 2`
3. **Người dùng thông thường (Standard User)**:
   - Email: `user@yft.design`
   - Mật khẩu: `user123`
   - Phân quyền: `is_superuser: false`, `is_staff: false`, `dept_id: 3`

### 3.5. Kết nối Vite Proxy
Cập nhật file `vite.config.mts`:
- `/api/oauth` -> Trỏ về máy chủ nội bộ `http://127.0.0.1:8788`.
- `/api` (còn lại: templates, static assets) -> Tiếp tục trỏ `https://yft.design` để kế thừa kho tài nguyên mẫu đồ họa phong phú.

---

## 4. Trạng thái Triển khai (Action Items Completed)

- [x] **Bước 1**: Lập kế hoạch chi tiết và lưu tại `/docs/plans/auth-experience-and-custom-backend-implementation-plan.md`.
- [x] **Bước 2**: Viết module tạo ảnh Captcha PNG base64 `server/captcha.mjs`.
- [x] **Bước 3**: Khởi tạo cơ sở dữ liệu mẫu `server/data/users.json`.
- [x] **Bước 4**: Xây dựng máy chủ API `server/index.mjs` đáp ứng toàn bộ các endpoint xác thực (`/api/oauth/*`).
- [x] **Bước 5**: Cấu hình proxy `/api/oauth` và `/api/design/template` trong `vite.config.mts`.
- [x] **Bước 6**: Khởi động server backend và frontend, kiểm thử luồng đăng nhập, đăng ký và phân quyền.
- [x] **Bước 7**: Tạo file tiện ích 1-click `start-all.bat` và chụp ảnh màn hình nghiệm thu kết quả.

---

## 5. Hướng Dẫn Vận Hành & Nghiệm Thu Hệ Thống

### 5.1. Khởi chạy 1-Click
Nhấp đúp chuột vào file:
👉 **`D:\code\yft-design\start-all.bat`**  
*(Script sẽ tự động khởi động máy chủ Auth Backend trên port 8788 và Vite Dev Server trên port 5174).*

### 5.2. Danh sách tài khoản thử nghiệm
| Tài khoản | Email | Mật khẩu | Phân quyền hiển thị |
|-----------|-------|----------|---------------------|
| **Super Admin** | `admin@yft.design` | `admin123` | Tag đỏ: **Admin** (`is_superuser: true`, `is_staff: true`) |
| **Nhân viên / Designer** | `staff@yft.design` | `staff123` | Tag vàng: **Staff** (`is_staff: true`) |
| **Người dùng thường** | `user@yft.design` | `user123` | Tag xám: **User** (`is_staff: false`) |

*(Mã Captcha: Có thể nhập chính xác 4 số màu hiển thị trên ảnh, hoặc sử dụng mã master test `8888` / `1234`).*

### 5.3. Các kịch bản kiểm thử đã nghiệm thu thành công
1. **Trải nghiệm giao diện Đăng nhập (Cách 1)**:
   - Truy cập `http://localhost:5174/home` hoặc mở editor `http://localhost:5174/` nhấp nút **登录/注册**.
   - Hộp thoại đăng nhập mở ra với đầy đủ trường Email, Mật khẩu, ảnh Captcha màu sắc nét sinh ngẫu nhiên từ server.
2. **Đăng nhập và phân quyền RBAC (Cách 2)**:
   - Đăng nhập bằng `admin@yft.design` / `admin123`.
   - Header hiển thị huy hiệu `Admin` cùng tên `Admin Master`. Nhấp vào tên có menu xem email và nút **Đăng xuất**.
3. **Đăng ký tài khoản mới**:
   - Nhấp vào "注册账号", nhập email mới và mật khẩu, hệ thống lưu tự động vào `server/data/users.json` và tự động đăng nhập.

### 5.4. Kết quả nghiệm thu chu trình toàn diện (Tạo tài khoản -> Đăng xuất -> Đăng nhập lại)
Đã thực thi kịch bản kiểm thử tự động toàn diện qua trình duyệt headless Edge CDP ([`scripts/test-login-and-logout.mjs`](file:///D:/code/yft-design/scripts/test-login-and-logout.mjs)):
1. **Tạo tài khoản mới**: Đăng ký tài khoản `user_vietnam_7098@yft.design`, hệ thống trả về HTTP 200, lưu vào database JSON và tự động đăng nhập hiển thị thẻ `[User] user_vietnam_7098`.
   - *Bằng chứng*: `step1_registered_new_user.png`
2. **Đăng xuất thành công**: Nhấp vào menu người dùng và bấm "Đăng xuất", trạng thái pinia store và localStorage được dọn sạch, header trở về nút "登录/注册".
   - *Bằng chứng*: `step2_logged_out_verified.png`
3. **Đăng nhập lại**: Nhập lại email `user_vietnam_7098@yft.design` và mật khẩu vừa tạo, hệ thống xác thực thành công và khôi phục phiên đăng nhập.
   - *Bằng chứng*: `step3_logged_in_verified.png`


