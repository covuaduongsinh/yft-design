# Triển khai bằng Dokploy

Toàn bộ ứng dụng (frontend + backend) chạy trong **một container**, dữ liệu nằm trong **một volume**.
Các file liên quan ở thư mục gốc: `Dockerfile`, `docker-compose.yml`, `.env.example`.

> Các file này chưa được build thử bằng Docker trên máy phát triển (máy không cài Docker). Lần deploy
> đầu tiên chính là lần kiểm chứng: nếu bước build lỗi, hãy xem log build trong Dokploy.

## 1. Tạo ứng dụng

1. Trong Dokploy: **Create Service → Compose**, loại **Docker Compose**.
2. Nguồn: repository của dự án, nhánh muốn deploy, đường dẫn compose `./docker-compose.yml`.

## 2. Biến môi trường

Ở tab **Environment**, nhập tối thiểu:

```
SITE_URL=https://ten-mien-cua-ban
ADMIN_EMAIL=email-quan-tri
ADMIN_PASSWORD=mat-khau-it-nhat-8-ky-tu
TRUST_PROXY_HOPS=1
```

- `ADMIN_EMAIL` / `ADMIN_PASSWORD` chỉ có tác dụng ở lần khởi động đầu, khi hệ thống chưa có quản trị
  viên nào. Sau khi đăng nhập được, nên đổi mật khẩu trong ứng dụng và xoá hai biến này.
- `TRUST_PROXY_HOPS=1` là bắt buộc sau Traefik của Dokploy. Thiếu nó, mọi người dùng bị coi là cùng
  một IP nên giới hạn tần suất và khoá tạm sẽ tính sai.
- Các biến khác (đóng đăng ký, hạn mức, email, Pixabay, sao lưu...) xem `.env.example`.

Dokploy ghi các biến này vào file `.env` cạnh `docker-compose.yml`; service `app` đọc file đó qua `env_file`.

## 3. Domain

Tab **Domains** → thêm domain cho service `app`, cổng container **8788**, bật HTTPS (Let's Encrypt).
Không cần khai báo `ports` hay nhãn Traefik trong compose: Dokploy tự thêm khi deploy.

## 4. Deploy và kiểm tra

Bấm **Deploy**. Khi xong:

- `https://ten-mien/api/health` trả `{"code":200,"status":"ok",...}`.
- Mở trang, đăng nhập bằng tài khoản quản trị, thử lưu một thiết kế.
- Deploy lại một lần và kiểm tra thiết kế vừa lưu vẫn còn — xác nhận volume được giữ.

## Dữ liệu và sao lưu

- Mọi dữ liệu nằm trong volume `yft-data` (gắn vào `/data`): `yft.db`, `media/`, `backups/`.
  Đây là *named volume* nên Dokploy giữ nguyên qua các lần deploy. **Đừng đổi thành đường dẫn tuyệt
  đối trên máy chủ** — Dokploy dọn loại mount đó mỗi lần deploy.
- Đặt `BACKUP_ENABLED=true` để mỗi ngày server tự chép CSDL vào `/data/backups` (giữ `BACKUP_KEEP_DAYS` ngày).
- Bật thêm **Volume Backups** của Dokploy cho `yft-data` để có bản sao nằm ngoài máy chủ; bản đó gồm
  cả ảnh trong `media/`.
- Khôi phục CSDL: dừng service, chép file trong `backups/` đè lên `/data/yft.db`, xoá `yft.db-wal` và
  `yft.db-shm` nếu có, rồi chạy lại.

## Cập nhật phiên bản

Deploy lại là đủ. Migration CSDL tự chạy khi container khởi động. Ở chế độ Compose, Dokploy dừng
container cũ rồi mới chạy container mới, nên có vài giây gián đoạn — đây là điều mong muốn với SQLite
(không bao giờ có hai tiến trình cùng ghi một file CSDL).

Build image tốn RAM và CPU. Nếu VPS nhỏ bị treo lúc build, hãy build image ở nơi khác (vd GitHub
Actions đẩy lên một registry) rồi sửa service `app` dùng `image:` thay cho `build:`.

## Tách nền ảnh (tuỳ chọn)

Mặc định tắt. Để bật, thêm vào Environment rồi deploy lại:

```
COMPOSE_PROFILES=matting
MATTING_URL=http://rembg:7000
```

Service `rembg` cần khoảng 2 GB RAM và tải mô hình ở lần dùng đầu. Nó không có xác thực nên **không
gắn domain** cho nó; chỉ backend gọi tới nó qua mạng nội bộ của compose. Việc Dokploy có áp dụng
`COMPOSE_PROFILES` đúng như Docker Compose chuẩn hay không chưa được kiểm chứng — nếu service không
chạy, hãy xoá dòng `profiles:` của `rembg` trong `docker-compose.yml`.

## Tạo quản trị viên bằng tay

Nếu không dùng `ADMIN_EMAIL`, mở terminal của container `app` trong Dokploy và chạy:

```
node src/cli/create-admin.js email-quan-tri mat-khau
```
