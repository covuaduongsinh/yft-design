# Bàn giao: triển khai backend yft-design

Tài liệu này để một phiên làm việc mới (hoặc người khác) nhận tiếp công việc mà không phải đọc lại
cuộc trò chuyện cũ. Viết ngày 2026-11-20. Đọc kèm [README backend](./README.md) và
[Triển khai bằng Dokploy](./trien-khai-dokploy.md).

## 1. Hiện trạng

Nhánh `feat/backend`, 6 commit cục bộ trên `main` (chưa push). Backend Node.js + SQLite đã thay hoàn
toàn server giả lập cũ, frontend đã nối vào và **không còn gọi `yft.design`**.

| Mốc | Nội dung | Trạng thái |
|---|---|---|
| M0 | Khung `server/` (Hono, better-sqlite3, sharp, zod), Dockerfile, compose, `.env.example` | Xong, `Dockerfile` chưa build thử |
| M1 | Xác thực thật (scrypt, phiên thu hồi được, captcha dùng một lần, khoá tạm, quyền staff/superuser) | Xong, có test |
| M2 | Sửa lỗi editor: chỉnh sửa trên canvas không được ghi về store nên đổi trang là mất | Xong, thử trên trình duyệt |
| M3 | Lưu thiết kế trên server: tự lưu, khoá lạc quan (409), phiên bản, thùng rác, "Thiết kế của tôi" | Xong, thử trên trình duyệt |
| M4 | Ảnh tải lên: tách ảnh khỏi tài liệu khi lưu, hạn mức, tự dọn ảnh không còn ai dùng | Xong, thử trên trình duyệt |
| M5 | Template và font dùng chung do staff quản lý | Xong, thử trên trình duyệt |
| M6 | Tách khỏi yft.design: xuất PDF/PSD, nhập PSD/PDF/AI ngay trong trình duyệt; kho ảnh; tách nền | Xong, thử trên trình duyệt (trừ kho ảnh có dữ liệu thật) |
| M7 | Sao lưu CSDL, tài liệu, rà soát bảo mật | Xong: đã rà soát toàn diện, vá bảo mật, thử production trên trình duyệt |

Test server: `cd server && pnpm test` → **72/72 qua**.

## 2. Việc tiếp theo (làm theo thứ tự)

1. **Rà soát bảo mật & thử bản production:** Đã xong. Đã vá phòng thủ (chặn stream không giới hạn ở Pixabay import, kiểm tra kiểu dữ liệu an toàn ở static resolveInside, chuẩn hoá IP tránh lệch IPv4-mapped, chặn rò rỉ token sang URL ngoài), bổ sung test suite đạt 72/72 test qua, đã build và chạy thử thành công trên Edge headless (render DOM đầy đủ 105 KB, canvas và layout chuẩn xác).
2. **Build Docker lần đầu** (máy phát triển không có Docker). Xem rủi ro ở mục 4.
3. **Deploy lên Dokploy**: theo [trien-khai-dokploy.md](./trien-khai-dokploy.md). Việc tạo ứng dụng,
   gắn domain, nhập biến môi trường do chủ dự án làm.
4. **Đổi mật khẩu các tài khoản cũ** (mục 6).

## 3. Quyết định đã chốt (không bàn lại nếu không có lý do mới)

- Node.js + SQLite; một container, một volume `/data`. Đích triển khai: VPS chạy Dokploy.
- Token phiên là chuỗi ngẫu nhiên, DB chỉ lưu SHA-256 (không dùng JWT); frontend giữ nó ở `localStorage`.
  Vì vậy file người dùng tải lên **tuyệt đối không được chạy như trang web**: `/media` gửi
  `Content-Security-Policy: sandbox` + `nosniff`, SVG bị từ chối, mọi ảnh được mã hoá lại bằng `sharp`.
- Tài liệu thiết kế là `{schema:1, pages, meta}` nén gzip; lưu cần `base_revision`, lệch thì 409.
- Xuất PDF/PSD và nhập PSD/PDF/AI chạy ở trình duyệt (không cần poppler, librsvg hay Chromium ở server).
- Tính năng gọi dịch vụ ngoài (email, Pixabay, tách nền) mặc định tắt.

## 4. Chưa kiểm chứng — đừng coi là đã chạy được

- **`Dockerfile` và `docker-compose.yml` chưa từng được build.** Rủi ro đáng chú ý: tầng build frontend
  dùng `pnpm install --frozen-lockfile` ở thư mục gốc, và `.npmrc` gốc trỏ `disturl` và
  `canvas_binary_host_mirror` sang mirror npmmirror (Trung Quốc) — có thể chậm hoặc lỗi trên VPS;
  `better-sqlite3` có thể phải biên dịch (tầng `server-deps` đã cài sẵn `python3 make g++`).
- **`pnpm build` nguyên bản** chưa chạy được trên máy phát triển (lỗi môi trường esbuild
  "Access is denied", xem memory `pnpm-build-esbuild-windows`). Đã sửa `build.target` thành `es2020`
  (pdf.js/jsPDF/ag-psd dùng cú pháp không hạ cấp được xuống es2015). Bản build kiểm chứng dùng config
  tạm với `target: 'esnext'` và **thành công** — nhưng đó không phải `pnpm build`. Lần build đầu trong
  Docker là lần kiểm chứng thật.
- **`COMPOSE_PROFILES=matting` trong Dokploy**: chưa biết Dokploy có áp dụng profile như Compose chuẩn không.
  Đường dẫn volume mô hình của `rembg` (`/root/.u2net`) cũng chưa kiểm chứng với image hiện hành.
- **Pixabay (khoá API thật), SMTP, rembg thật**: chỉ được kiểm bằng bản `fetch` giả trong test.
- **Frontend không có kiểm tra kiểu**: `vue-tsc --noEmit` hỏng sẵn vì lỗi cấu hình
  (`TS6504 ... CanvasTour/index.vue.js`), không phải do thay đổi này.
- Mở file PSD/PDF **do người dùng tạo bằng Photoshop/Acrobat** chưa thử; chỉ thử vòng lặp xuất rồi nhập
  lại chính file do ứng dụng tạo ra.

## 5. Chạy và kiểm tra trên máy phát triển

```powershell
cd server; pnpm install        # lần đầu: better-sqlite3 biên dịch, ~3 phút
cd ..; pnpm server             # backend, http://127.0.0.1:8788
pnpm dev                       # frontend; cổng 5174 thường bị chiếm → Vite nhảy sang cổng khác
cd server; pnpm test           # 69 test
```

- Cổng 8788/5174/5175 thường bị các tiến trình dev cũ của chủ dự án giữ. Kiểm tra ai giữ cổng trước
  khi kết luận server lỗi (`Get-NetTCPConnection -LocalPort 8788`).
- Lần tải trang đầu của một Vite mới rất chậm (trang trắng hàng chục giây) — cứ chờ.
- Đặt `CAPTCHA_ENABLED=false` khi kiểm thử tự động bằng trình duyệt.
- Ở bản dev, `window.__yftDebug` cho phép script đọc canvas và store (chỉ có khi `import.meta.env.DEV`).
- **Thử bản production:** build kiểm chứng (config tạm ngoài repo import `vite.config.mts`, đặt
  `build.target='esnext'`, `outDir` ra thư mục tạm, `CI=true` để không mở trang thống kê bundle) rồi chạy
  `PORT=8799 DATA_DIR=<thư mục tạm> STATIC_DIR=<outDir> NODE_ENV=production CAPTCHA_ENABLED=false node server/src/index.js`
  và mở `http://127.0.0.1:8799/`. Mất khoảng 2–3 phút để build.
- Tài khoản dev: CSDL `server/data/yft.db` (đã bị git bỏ qua) có 6 tài khoản nhập từ server cũ.
  Tạo quản trị viên: `cd server; pnpm create-admin <email> <mật khẩu>`.

## 6. Bảo mật cần xử lý

- Server giả lập cũ lưu mật khẩu **văn bản thuần** trong `server/data/users.json`, và file này **đã từng
  nằm trong lịch sử git** (các commit trước nhánh `feat/backend`). Hãy coi các mật khẩu đó là đã lộ:
  yêu cầu người dùng thật đổi mật khẩu, và nếu repo công khai thì cân nhắc xoá khỏi lịch sử.
  Trong CSDL mới các mật khẩu đã được băm lại, nhưng giá trị gốc vẫn y nguyên.
- Mọi lần deploy thật phải đặt `TRUST_PROXY_HOPS=1` (sau Traefik của Dokploy), nếu không giới hạn tần suất
  và khoá tạm tính theo IP của proxy.
- `ADMIN_EMAIL`/`ADMIN_PASSWORD` chỉ tạo quản trị viên khi chưa có ai; sau khi đăng nhập được thì xoá hai biến này.

## 7. Giới hạn đã biết (không phải lỗi)

- PDF xuất ra và nhập vào ở dạng **ảnh từng trang** (chữ không chọn được); chưa nhập được CDR.
- Xuất PSD: mỗi đối tượng là một lớp ảnh; chữ không còn là lớp chữ chỉnh được; đối tượng đang ẩn không được xuất.
- Đã gỡ nút đăng nhập GitHub/WeChat và trang `/github` (backend chưa có). Chưa có quên mật khẩu qua email,
  chia sẻ bằng link, thư mục, đồng chỉnh sửa (xem mục "Ngoài phạm vi" trong kế hoạch).
- Kho ảnh nội bộ trống lúc đầu: staff thêm ảnh bằng nút "+ Thêm vào kho" trong từng danh mục; hoặc đặt
  `PIXABAY_API_KEY` để có thêm ảnh trực tuyến (ảnh được tải về máy chủ khi chèn).
- Home chưa có template: staff mở trình chỉnh sửa → "Đăng mẫu", hoặc `pnpm import-template`.
- Nút "Chia sẻ" ở góc phải trình chỉnh sửa vẫn chưa có chức năng (có từ bản gốc).

## 8. Tài liệu tham chiếu

- Kế hoạch đã duyệt: `C:\Users\duongsinh\.claude\plans\t-i-th-y-repo-doory-wiggly-curry.md` (nằm ngoài repo, trên máy này).
- Đặc tả Doory (kiến trúc tham chiếu): [dac-ta-doory.md](./dac-ta-doory.md).
- Môi trường máy phát triển: memory `yft-design-moi-truong-may` và `pnpm-build-esbuild-windows`.
