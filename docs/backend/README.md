# Backend yft-design

Backend tự chủ của yft-design: xác thực, lưu thiết kế, ảnh tải lên, template, font, kho ảnh và
tách nền. Kiến trúc tham khảo [Doory](./dac-ta-doory.md) (chỉ tham khảo ý tưởng, không sao chép mã).

- Mã nguồn: `server/` (package riêng, có lockfile riêng, tách khỏi frontend).
- Công nghệ: Node.js ≥ 22, [Hono](https://hono.dev), SQLite (`better-sqlite3`), `sharp`, `zod`.
- Một tiến trình duy nhất phục vụ API (`/api/*`), file người dùng (`/media/*`) và — khi triển khai —
  cả bản build của frontend.

## Chạy trên máy

```bash
cd server
pnpm install          # lần đầu; better-sqlite3 có thể phải biên dịch, mất vài phút
pnpm start            # http://127.0.0.1:8788
pnpm test             # toàn bộ test (node --test)
```

Ở thư mục gốc: `pnpm server` chạy backend, `pnpm dev` chạy frontend (Vite chuyển `/api` và `/media`
sang cổng 8788). `start-all.bat` chạy cả hai.

Dữ liệu nằm trong `server/data/` (đã bị git bỏ qua): `yft.db` (CSDL), `media/` (ảnh, font, thumbnail),
`backups/`. Cấu hình bằng biến môi trường hoặc file `server/.env`; mọi biến và giá trị mặc định
được liệt kê trong [`.env.example`](../../.env.example).

### Lệnh quản trị

| Lệnh (chạy trong `server/`) | Tác dụng |
|---|---|
| `pnpm create-admin <email> <mật khẩu> [--reset-password]` | Tạo quản trị viên, hoặc nâng quyền một tài khoản có sẵn |
| `pnpm import-users [users.json]` | Nhập tài khoản của server giả lập cũ (băm lại mật khẩu) |
| `pnpm import-template <file.json> "<tên>" ["<mô tả>"]` | Nạp template từ file JSON xuất bằng trình chỉnh sửa |
| `pnpm backup` | Sao lưu CSDL ngay vào `data/backups/` |

## Cấu trúc

```
server/
  migrations/NNN_*.sql      lược đồ CSDL, chạy theo thứ tự số khi khởi động
  src/index.js              điểm vào: nạp cấu hình, mở CSDL, chạy migration, tác vụ định kỳ
  src/app.js                dựng ứng dụng Hono (test gọi thẳng hàm này)
  src/core/                 cấu hình, CSDL, lỗi và vỏ phản hồi, giới hạn tần suất,
                            phục vụ file tĩnh và /media, xử lý ảnh, hạn mức, sao lưu
  src/auth/                 đăng ký, đăng nhập, phiên, captcha, OTP email, quản trị người dùng
  src/designs/              thiết kế của người dùng, phiên bản, thùng rác
  src/assets/               ảnh tải lên
  src/templates/, fonts/    template và font dùng chung do staff quản lý
  src/stock/                kho ảnh nội bộ + Pixabay (tuỳ chọn)
  src/matting/              tách nền qua dịch vụ rembg (tuỳ chọn)
  src/cli/                  các lệnh quản trị
  test/                     test theo từng module
```

## Nguyên tắc thiết kế

1. **Vỏ phản hồi `{ code, msg, data }`.** Thành công là HTTP 200 + `code: 200`. Lỗi dùng mã HTTP thật,
   lặp lại trong `code`, kèm `error` là mã máy đọc được (vd `revision_conflict`).
2. **Dữ liệu luôn lọc theo chủ sở hữu.** Truy cập dữ liệu của người khác trả 404 như thể không tồn tại.
3. **Quyền kiểm tra ở server.** Cờ `is_staff` / `is_superuser` mà trình duyệt giữ chỉ để ẩn/hiện nút.
   Staff quản lý template, font, kho ảnh; superuser quản lý người dùng.
4. **Tính năng gọi dịch vụ ngoài mặc định tắt** (email, Pixabay, tách nền) và chỉ bật khi đặt biến tương ứng.
5. **File người dùng không bao giờ được chạy như trang web.** Token đăng nhập nằm ở `localStorage`,
   nên `/media` gửi kèm `Content-Security-Policy: sandbox` và `nosniff`; SVG không được nhận làm file
   tải lên; mọi ảnh được giải mã và mã hoá lại bằng `sharp`.
6. **Server không tự tải URL do người dùng đưa**, trừ đúng một trường hợp có danh sách cho phép
   (ảnh từ `pixabay.com`).

## Xác thực

- Mật khẩu băm bằng scrypt; kết quả tự mang tham số (`scrypt$N$r$p$salt$hash`).
- Phiên đăng nhập là token ngẫu nhiên 256 bit, CSDL chỉ lưu SHA-256. Hạn 30 ngày, tự gia hạn khi dùng.
  Đăng xuất và đổi mật khẩu thu hồi token ở server.
- Captcha gắn với `captcha_id`, dùng một lần, hết hạn sau 5 phút.
- Sai mật khẩu, email không tồn tại và tài khoản bị khoá trả cùng một lỗi. Sai quá
  `LOGIN_MAX_FAILURES` lần thì cặp email + IP bị khoá `LOGIN_LOCK_MINUTES` phút.

## Thiết kế và ảnh

- Tài liệu là `{ schema: 1, pages: Template[], meta }`, nén gzip, lưu ở bảng `design_documents`.
- **Khoá lạc quan:** lưu tài liệu phải gửi `base_revision`. Nếu thiết kế đã bị sửa ở nơi khác, server
  trả 409 `revision_conflict` và trình duyệt hỏi người dùng: tải lại, hay lưu thành bản sao.
- **Phiên bản:** trước khi ghi đè, bản cũ được chụp lại nếu bản chụp gần nhất đã quá
  `AUTO_VERSION_INTERVAL_MINUTES` phút. Giữ tối đa `MAX_AUTO_VERSIONS` bản tự động (tự tỉa) và
  `MAX_MANUAL_VERSIONS` bản thủ công. Khôi phục một phiên bản luôn chụp lại trạng thái hiện tại trước.
- **Thùng rác:** xoá là xoá mềm; quá `TRASH_RETENTION_DAYS` ngày thì bị xoá hẳn.
- **Tách ảnh khi lưu:** trình duyệt tải mọi ảnh nhúng (data URL) lên `/api/design/assets` rồi thay bằng
  URL `/media/a/...` trong bản gửi đi. Server ghi nhận thiết kế/phiên bản nào dùng ảnh nào; ảnh không
  còn ai dùng sau 24 giờ sẽ tự bị xoá và trả lại hạn mức.
- **Hạn mức** `USER_STORAGE_QUOTA_BYTES` tính gộp tài liệu, phiên bản và ảnh của mỗi người dùng.

## Bảng API

| Nhóm | Endpoint |
|---|---|
| Hệ thống | `GET /api/health`, `GET /api/design/config` |
| Xác thực | `GET /api/oauth/captcha/image`, `POST /api/oauth/captcha/email`, `POST /api/oauth/register`, `POST /api/oauth/login`, `POST /api/oauth/logout`, `GET /api/oauth/me`, `POST /api/oauth/password/change` |
| Quản trị | `GET /api/admin/users`, `PATCH /api/admin/users/:id` |
| Thiết kế | `GET/POST /api/design/designs`, `GET/PATCH/DELETE /api/design/designs/:id`, `POST …/:id/duplicate`, `POST …/:id/restore`, `PUT …/:id/thumbnail`, `GET/POST …/:id/versions`, `GET …/:id/versions/:vid`, `POST …/:id/versions/:vid/restore`, `DELETE /api/design/designs/trash` |
| Ảnh | `GET/POST /api/design/assets`, `GET /api/design/assets/usage`, `DELETE /api/design/assets/:id` |
| Template | `GET /api/design/template/info/pages`, `GET …/detail/pages`, `GET …/data/:id`, `POST /api/design/template`, `PATCH/DELETE …/:id`, `PUT …/:id/preview` |
| Font | `GET /api/design/font/info`, `POST /api/design/font`, `DELETE /api/design/font/:id` |
| Kho ảnh | `GET /api/design/image/{page,category}`, `GET /api/design/illustration/{page,category}`, `POST /api/design/stock`, `DELETE /api/design/stock/:id`, `POST /api/design/stock/import` |
| Tách nền | `POST /api/design/matting/file`, `POST /api/matting/url` |
| File | `GET /media/*` |

## Việc chuyển sang trình duyệt

Xuất PDF (`jsPDF`), xuất/nhập PSD (`ag-psd`) và nhập PDF/AI (`pdf.js`) chạy ngay trong trình duyệt,
không cần server. Giới hạn hiện tại: PDF xuất ra và nhập vào ở dạng ảnh từng trang (chữ không chọn
được); chưa nhập được file CDR.

## Triển khai

Xem [Triển khai bằng Dokploy](./trien-khai-dokploy.md).
