# Đặc tả backend Doory (tài liệu tham chiếu)

Tài liệu này mô tả backend của [Doory](https://github.com/shaongitbd/doory) — một trình thiết kế mã nguồn mở
tự host được — đọc từ mã nguồn công khai trong thư mục `backend/` của repo (nhánh `main`, bản 0.3.1,
tháng 11/2026). Image `ghcr.io/shaongitbd/doory-backend` chỉ là bản build của thư mục đó, nên không cần
dịch ngược image.

Backend của yft-design **tham khảo kiến trúc** từ đây và được viết mới hoàn toàn; không có mã nào của
Doory được sao chép. Giấy phép của Doory (Attribution Assurance License) chỉ ràng buộc khi phân phối
lại mã hoặc bản build của chính Doory.

## Những gì yft-design đã áp dụng

- Mọi truy vấn lọc theo chủ sở hữu; dữ liệu của người khác trả 404.
- Khoá lạc quan bằng `base_revision`, trả 409 kèm revision hiện tại.
- Cả tài liệu trong một cột; danh sách không tải tài liệu.
- Phiên bản tự động theo khoảng thời gian, có tỉa; khôi phục luôn chụp lại trạng thái hiện tại.
- Xoá mềm vào thùng rác, tự dọn theo số ngày.
- Nhận diện file tải lên theo nội dung, mã hoá lại ảnh, hạn mức theo người dùng.
- Tính năng gọi dịch vụ ngoài mặc định tắt; lỗi đăng nhập đồng nhất; khoá tạm khi sai nhiều lần.

## Những gì khác đi

| Doory | yft-design | Lý do |
|---|---|---|
| Django + PostgreSQL, 3 tiến trình | Node.js + SQLite, 1 tiến trình | Cùng ngôn ngữ với frontend, vận hành đơn giản |
| Session cookie + CSRF | Token phiên trong header `Authorization` | Frontend sẵn có đã dùng Bearer token |
| Chụp bản MỚI sau khi lưu | Chụp bản CŨ trước khi ghi đè | Giữ được trạng thái trước mỗi phiên làm việc |
| Xuất file ở server bằng Chromium | Xuất PDF/PSD ở trình duyệt | Không cần Chromium trên máy chủ |
| Nhận SVG (có làm sạch) | Không nhận SVG làm file tải lên | Token nằm ở localStorage nên tránh hẳn rủi ro |
| Co-edit thời gian thực, chia sẻ link, brand kit, MCP | Chưa có | Ngoài phạm vi đợt đầu |

---


### A1. Tổng thể

- Django 6.1 + DRF + Channels, PostgreSQL 16, một codebase chạy 3 tiến trình: `doory/wsgi.py` (API + admin, gunicorn, `/api/v1/`, `/admin/`), `doory/asgi.py` (WebSocket co-edit, uvicorn, `/ws/`), `doory/mcp_asgi.py` (MCP, `/mcp`).
- Compose: `db`, `api`, `realtime`, `web` (nginx phục vụ SPA + proxy), tuỳ chọn `redis`, `mcp`, `ai-server` (tách nền). Volume: `pgdata`, `media`, `exports`.
- Mọi model kế thừa `BaseModel`: `id` UUID, `created_at` (index), `updated_at`.
- Nguyên tắc: tính năng gọi dịch vụ ngoài hoặc có rủi ro thì **mặc định tắt**; mọi biến môi trường có giá trị mặc định an toàn; dữ liệu luôn lọc theo `owner=request.user`, truy cập của người khác trả 404 (không lộ sự tồn tại).

### A2. 15 app và trách nhiệm

| App | Trách nhiệm | Endpoint chính (`/api/v1/…`) |
|---|---|---|
| `core` | Health, cấu hình site, OpenAPI | `health/`, `config/`, `schema/`, `docs/` |
| `accounts` | Người dùng, đăng ký/đăng nhập, xác minh email, Google, OIDC | `auth/csrf|register|login|logout|me`, `auth/password/change|reset|reset/confirm`, `auth/email/verify|resend`, `auth/google`, `auth/oidc/*` |
| `designs` | Thiết kế, thư mục, thùng rác, lịch sử phiên bản | `designs/`, `designs/{id}/` (+ `restore`, `duplicate`, `thumbnail`, `fields`, `fill`, `bulk-fill`), `designs/bulk`, `designs/trash`, `designs/{id}/versions/…/restore`, `folders/` |
| `assets` | Upload, hạn mức dung lượng, stock ảnh/video/âm thanh | `assets/`, `assets/usage`, `stock/photos|videos|audio…` |
| `gallery` | Template + danh mục | `template-categories/`, `templates/`, `templates/{slug}/`, `templates/{slug}/use/` |
| `fonts` | Danh mục font + font người dùng | `fonts/`, `fonts/weights/`, `fonts/mine/` |
| `elements` | Thư viện hình/icon/minh hoạ | `elements/`, `elements/packs/` |
| `exports` | Xuất PDF/ảnh phía server (Chromium headless), tối ưu ảnh | `exports/pdf/`, `exports/optimize/`, `designs/{id}/export/image/`, `exports/image/{token}/` |
| `sharing` | Link chia sẻ (có mật khẩu), bình luận | `designs/{id}/share-links/`, `designs/{id}/comments/`, `shared/{token}/` |
| `brand` | Brand kit: màu, font, logo | — |
| `presets` | Kích thước mẫu | — |
| `collab` | Co-edit thời gian thực (Yjs/pycrdt, phòng, snapshot, presence) | `/ws/` |
| `apitokens` | Personal access token | — |
| `ai`, `mcp` | Nhà cung cấp AI ảnh; MCP server | `ai/…`, `/mcp` |

### A3. Xác thực (`accounts`)

- **Session cookie của Django + CSRF** (`auth/csrf/` phát cookie, SPA gửi lại `X-CSRFToken`); không dùng JWT cho trình duyệt. PAT (`apitokens`) dành cho MCP.
- `User`: `email` (duy nhất, không phân biệt hoa thường, luôn lowercase), `display_name`, `avatar`, `google_sub`, `is_email_verified`, `is_active`, `is_staff`, `is_superuser`. Không có bảng role riêng.
- Mật khẩu băm bằng hasher của Django. Đăng nhập sai/không tồn tại/bị khoá đều trả cùng lỗi `invalid_credentials`; có khoá tạm sau nhiều lần sai (429) và throttle scope `auth`.
- Quên mật khẩu luôn trả 204 (chống dò email); đổi/đặt lại mật khẩu thu hồi các phiên khác và mọi API token.
- Không cho xoá superuser cuối cùng.

### A4. Thiết kế (`designs`) — phần đáng học nhất

- `Design`: `owner`, `title`, `width`, `height`, `preset`, **`document` (JSON, cả tài liệu trong một cột)**, `page_count`, `thumbnail` (webp 480px), `folder`, `starred`, **`revision`**, **`trashed_at`** (xoá mềm).
- `Folder`: cây theo `parent`, tên duy nhất trong cùng cấp (không phân biệt hoa thường).
- `DesignVersion`: bản chụp `document` + `thumbnail`, `label`, `is_auto`, `created_by`.
- **Khoá lạc quan:** `PATCH designs/{id}/` có `document` thì bắt buộc gửi `base_revision`; lệch với `revision` đang lưu → **409** `revision_conflict` kèm `current:{revision, updated_at}`. Lưu thành công thì `revision += 1`. Đổi tên/gắn sao/chuyển thư mục không cần kiểm tra. Ghi trong transaction + `select_for_update`.
- **Phiên bản tự động:** sau mỗi lần lưu document, nếu bản mới nhất cũ hơn 10 phút thì chụp một bản auto; giữ tối đa 50 bản auto (tự tỉa), 100 bản thủ công. Khôi phục phiên bản luôn chụp bản "Before restore" trước.
- **Thùng rác:** `DELETE` = xoá mềm; `?permanent=1` chỉ cho thiết kế đã ở thùng rác; lệnh `purge_trash` dọn theo số ngày.
- Danh sách không tải `document` (defer); lọc `q`, `folder`, `starred`, `trashed`, `ordering`.
- Giới hạn: `MAX_DESIGNS_PER_USER`, `MAX_DESIGN_DOCUMENT_BYTES`; thumbnail ≤ 2 MiB, ≤ 16 MP.

### A5. Upload (`assets`)

- `Asset`: `owner`, `kind` (image/svg/audio/video), `file`, `thumbnail`, `width`, `height`, `size`, `mime`, `tags`, `meta`, `status`.
- **Nhận diện loại theo nội dung, không tin tên file**; ảnh raster được giải mã và mã hoá lại; SVG được làm sạch (`defusedxml`) và giới hạn 12.000px; tên file lưu trữ = `{asset_id}.{ext}`.
- **Hạn mức theo người dùng:** `USER_STORAGE_QUOTA_BYTES`, kiểm tra trong transaction có khoá dòng user; `MAX_UPLOAD_BYTES` (đọc tối đa limit+1 byte để bắt stream khai sai kích thước); throttle scope `upload`.
- Lưu trữ: đĩa cục bộ (`media/`) hoặc S3-compatible qua `django-storages`.

### A6. Template, font, phần còn lại

- `Template`: `slug`, `title`, `category`, `tags`, `document`, `thumbnail`, `is_published`, `is_featured`, `use_count`; "Dùng template" = tạo `Design` mới từ `document` và tăng `use_count`. Nạp bằng lệnh `seed_templates` / `import_template`.
- `FontFamily` + `FontVariant` (weight/style/subset/unicode_range/file): font hệ thống (`owner` null, đồng bộ từ Fontsource bằng `sync_fonts`) và font người dùng tải lên chung bảng.
- Xuất file phía server bằng Playwright/Chromium render lại trang `render.html` của frontend; link tải theo token.
- Chia sẻ bằng token không đoán được, tuỳ chọn mật khẩu.

---
