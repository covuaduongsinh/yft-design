# Kế hoạch thay tiếng Trung bằng tiếng Việt và đặt tiếng Việt làm mặc định

> **Vị trí tài liệu**: `/docs/plans/vietnamese-localization-plan.md`
> **Ngày khởi tạo**: 19/11/2026 (sửa cùng ngày: chuyển từ "thêm tiếng Việt" sang "thay hẳn tiếng Trung")
> **Trạng thái**: Đã lập kế hoạch, chưa triển khai (chưa sửa dòng code nào)
> **Cách khảo sát**: chỉ đọc mã nguồn, chưa chạy lệnh nào. Các mục ghi "cần kiểm tra" là điều chưa được xác nhận bằng chạy thử.

---

## 1. Mục tiêu

1. Giao diện hiển thị **tiếng Việt** ở mọi màn hình; không còn chữ Hán nào người dùng nhìn thấy.
2. Bỏ hẳn ngôn ngữ `zh`. Còn lại hai ngôn ngữ: `vi` (mặc định) và `en` (phụ, làm dự phòng).
3. Người dùng mở app thấy tiếng Việt, không phụ thuộc ngôn ngữ trình duyệt hay giá trị cũ trong localStorage.

## 2. Hiện trạng (đã đọc trong mã nguồn)

| Hạng mục | Vị trí | Ghi nhận |
|---|---|---|
| Khởi tạo i18n | `src/plugins/i18n/index.ts` | `vue-i18n` 9, `legacy: false`. Tự nạp mọi file trong `./lang/*` bằng `import.meta.glob`, tên file là mã ngôn ngữ. |
| Chọn ngôn ngữ ban đầu | `getLocalLang()` trong file trên | `supportedLangs = ['zh', 'en']`. Chưa có giá trị lưu thì lấy theo `navigator.language`, không khớp thì `en`, rồi **ghi luôn vào localStorage** (khoá `CACHE_LANG`, hằng `LANG` trong `src/configs/key.ts`). |
| File ngôn ngữ | `src/plugins/i18n/lang/en.ts`, `zh.ts` | Khoảng 295 khoá, 5 nhóm: `message`, `default`, `style`, `waterMark`, `gpt`, cộng `el` (locale của Element Plus). |
| Locale Element Plus | `src/App.vue` | `<el-config-provider :locale="locale?.el">`, lấy từ khoá `el` của file ngôn ngữ đang chọn. |
| Menu đổi ngôn ngữ | `src/components/Lang/index.vue` | `LANGMAP` viết cứng `zh`, `en`. |
| Khai báo kiểu | `src/types/modules.d.ts` dòng 358-359 | Khai báo `zh-cn.mjs` và `en.mjs` của Element Plus. |
| Instance i18n thứ hai | `i18nObj()` trong `src/plugins/i18n/index.ts`, dùng ở `src/hooks/useHandleCreate.ts` | Mỗi lần gọi tạo một instance mới, không theo locale đang chọn sau khi người dùng đổi ngôn ngữ. |
| HTML gốc | `index.html` | `<html lang="en">`, dòng chờ tải `正在加载中，请稍等 ...` viết cứng. |

### Phần lớn chữ Hán nằm ngoài file ngôn ngữ

Đa số giao diện **không đi qua i18n** mà viết cứng tiếng Trung trong mã:

- File `.vue`: 497 dòng chứa chữ Hán trong 64 file (con số gồm cả chú thích, số chuỗi hiển thị thật ít hơn). Nặng nhất: `CanvasRight/Backgrounds/ElementFill.vue` (52), `Backgrounds/index.vue` (51), `ElementStylePanel/TextboxStylePanel.vue` (36), `Components/ElementFilter.vue` (28), `ElementStylePanel/GroupStylePanel.vue` (26), `components/LoginDialog/index.vue` (17), toàn bộ `views/Home/*`.
- File `.ts` (không tính `lang/`): khoảng 300 chuỗi trong 25 file. Nặng nhất: `configs/images.ts` (67), `configs/hotkey.ts` (54), `configs/contextMenu.ts` (41), `configs/fonts.ts` (38), `configs/home.ts` (35), `configs/background.ts` (17), `utils/request.ts` (3 thông báo lỗi).
- `server/index.mjs`: 2 dòng.

### Lưu ý về thư mục làm việc

`git status` đầu phiên cho thấy nhiều file **đang sửa dở chưa commit**, trong đó có `src/plugins/i18n/index.ts`, `src/App.vue`, `src/components/LoginDialog/index.vue`, `src/views/Home/index.vue`, `src/views/Editor/CanvasRight/ElementStylePanel/TextboxStylePanel.vue`. Phiên triển khai phải sửa chồng lên, không được hoàn tác hay ghi đè các thay đổi đó.

## 3. Quyết định thiết kế

**QĐ1. Xoá `zh`, thêm `vi`.** Tạo `src/plugins/i18n/lang/vi.ts`, xoá `src/plugins/i18n/lang/zh.ts`. Cơ chế `import.meta.glob` tự nạp theo file, không cần đăng ký thêm.

**QĐ2. Giữ `en` làm ngôn ngữ phụ.** `en.ts` đã có sẵn, giữ lại không tốn công và dùng làm `fallbackLocale`. Menu ngôn ngữ còn hai mục: Tiếng Việt, English.

**QĐ3. Mặc định là `vi`, bỏ dò theo trình duyệt.**

**QĐ4. Xử lý giá trị cũ trong localStorage.** Code hiện tại tự ghi `CACHE_LANG` ngay lần mở đầu tiên, nên máy nào đã từng mở app đều đang có sẵn `en` hoặc `zh` mà người dùng chưa hề chọn. Giá trị `zh` sẽ tự bị loại vì không còn được hỗ trợ, nhưng `en` thì không: chỉ đổi mặc định thì các máy đó vẫn hiện tiếng Anh.

Cách làm: thêm khoá mới `CACHE_LANG_CHOSEN` (hằng `LANG_CHOSEN` trong `src/configs/key.ts`), chỉ ghi khi người dùng bấm chọn trong menu ngôn ngữ. `getLocalLang()` chỉ tin `CACHE_LANG` khi có `CACHE_LANG_CHOSEN`; không có thì trả `vi`. Không tự ghi localStorage khi lấy mặc định.

**QĐ5. `i18nObj()` trả về instance dùng chung** (biến `i18n` đã tạo trong `setupI18n`) thay vì tạo mới, để chữ mặc định khi tạo textbox theo đúng ngôn ngữ đang chọn.

**QĐ6. Chuỗi tiếng Trung viết cứng được thay tại chỗ bằng tiếng Việt**, không tách thành khoá i18n. Lý do: không còn cần giữ bản tiếng Trung nên không phải duy trì ba bản dịch song song; thay tại chỗ sửa ít dòng hơn nhiều và ít rủi ro hơn so với đổi khoảng 800 chuỗi sang `t('...')`.

Hệ quả: khi chọn English, những phần này hiện tiếng Việt. Hiện nay chọn English thì chính những phần đó hiện tiếng Trung, nên bản tiếng Anh không kém đi. Nếu sau này cần bản tiếng Anh đầy đủ thì tách khoá i18n thành việc riêng.

**QĐ7. Không dịch chú thích trong code.** Chú thích tiếng Trung giữ nguyên: người dùng không nhìn thấy, sửa chỉ làm phình diff và dễ đụng vào thay đổi chưa commit.

## 4. Giai đoạn 1: ngôn ngữ `vi` thay `zh`, đặt mặc định

| # | Việc | File |
|---|---|---|
| 1.1 | Tạo `vi.ts`, đủ **mọi khoá** của `en.ts`, cùng cấu trúc; `el` lấy từ `element-plus/dist/locale/vi.mjs`. Dịch dựa trên nghĩa của `zh.ts` (bản gốc), đối chiếu `en.ts` | `src/plugins/i18n/lang/vi.ts` (mới) |
| 1.2 | Xoá `zh.ts` **sau khi** 1.1 xong | `src/plugins/i18n/lang/zh.ts` (xoá) |
| 1.3 | Thay khai báo `zh-cn.mjs` bằng `vi.mjs` | `src/types/modules.d.ts` |
| 1.4 | Thêm hằng `LANG_CHOSEN = 'CACHE_LANG_CHOSEN'` | `src/configs/key.ts` |
| 1.5 | Viết lại `getLocalLang()` theo QĐ3 và QĐ4; `supportedLangs = ['vi', 'en']`; thêm `fallbackLocale: 'en'`; sửa `i18nObj()` theo QĐ5; bỏ `console.log(options)` | `src/plugins/i18n/index.ts` |
| 1.6 | `LANGMAP` còn `vi: 'Tiếng Việt'`, `en: 'English'`; khi chọn thì ghi thêm `LANG_CHOSEN`; bỏ `console.log` | `src/components/Lang/index.vue` |
| 1.7 | `<html lang="vi">`; dòng chờ tải đổi thành `Đang tải, vui lòng chờ...` | `index.html` |
| 1.8 | Đồng bộ thuộc tính `lang` của `<html>` khi đổi ngôn ngữ | `setI18nLanguage()` trong `src/plugins/i18n/index.ts` |
| 1.9 | Tìm mọi chỗ còn tham chiếu `'zh'`, `zh-cn`, `zh.ts` trong `src/`, `build/`, `vite.config.mts` và gỡ | toàn repo |

**Cần kiểm tra khi triển khai:**
- File `node_modules/element-plus/dist/locale/vi.mjs` có tồn tại với bản `element-plus` ^2.7.6 đang cài.
- `getLocal` / `setLocal` trong `src/utils/local.ts` lưu dạng gì (chuỗi thô hay JSON) trước khi viết logic đọc `LANG_CHOSEN`.
- `useHandleCreate.ts` gọi `i18nObj()` vào lúc nào; nếu gọi trước `setupI18n` thì phải giữ đường dự phòng tạo instance.

**Quy ước dịch (dùng cho cả hai giai đoạn):**
- Thuật ngữ thiết kế dùng từ quen với người làm đồ hoạ Việt: Layer → "Lớp", Stroke → "Viền", Fill → "Tô màu", Opacity → "Độ mờ", Bleed → "Tràn lề", Safe line → "Đường an toàn", Template → "Mẫu", Group/Ungroup → "Nhóm"/"Bỏ nhóm", Undo/Redo → "Hoàn tác"/"Làm lại".
- Giữ nguyên: PDF, PSD, SVG, JSON, GPT, QR, Github, tên bộ lọc riêng (Kodachrome, Polaroid, Technicolor, Brownie, Sepia).
- Bản `en.ts` có chỗ dịch sai (ví dụ `showBloodsLine` thực chất là đường tràn lề); lấy nghĩa theo tiếng Trung gốc.
- Nhãn trong bảng thuộc tính bên phải cần ngắn; tiếng Việt dài hơn tiếng Trung nhiều nên phải soát tràn chữ.

## 5. Giai đoạn 2: thay chuỗi tiếng Trung viết cứng bằng tiếng Việt

Thay tại chỗ theo QĐ6. Chỉ đổi chuỗi hiển thị cho người dùng (chữ trong template, `label`, `placeholder`, `title`, `text`, nội dung `ElMessage` / `ElMessageBox`...). Không đụng chú thích.

Thứ tự theo mức người dùng nhìn thấy:

| Cụm | Phạm vi |
|---|---|
| 2.1 | Trang chủ: `src/views/Home/**`, `src/configs/home.ts` |
| 2.2 | Đăng nhập và lỗi: `src/components/LoginDialog/index.vue`, `src/utils/request.ts`, `server/index.mjs` |
| 2.3 | Bảng thuộc tính phải: `src/views/Editor/CanvasRight/**` |
| 2.4 | Cột trái và thumbnail: `src/views/Editor/CanvasLeft/**` |
| 2.5 | Menu chuột phải và phím tắt: `src/configs/contextMenu.ts`, `src/configs/hotkey.ts` |
| 2.6 | Còn lại: xuất file (`components/FileExport`, `CanvasFooter/components`), tách nền (`ImageMatting`), `ImageFillColor.vue`, `ColorPicker`, `CanvasTour`, trang lỗi 401/404, `src/configs/background.ts`, `images.ts`, `shape.ts`, `lines.ts`, `codeStyles.ts`, các hook, store, `utils/clipboard.ts` |

**Những chuỗi chữ Hán KHÔNG được dịch vì là dữ liệu, không phải nhãn:**
- `src/configs/fonts.ts`: trường `value` là tên font thật (`仓耳小丸子`, `得意黑`...), template đã lưu tham chiếu tới. Giữ nguyên `value`. Với `SYS_FONTS` đổi `label` sang tên Latin (`Microsoft YaHei`, `SimSun`...); với `WEB_FONTS` giữ nguyên cả `label` vì đó là tên riêng của font.
- Chuỗi dùng làm khoá so sánh, khoá tra cứu, tham số gửi lên API hoặc tên file tài nguyên. Trước khi đổi một chuỗi trong file `.ts`, tìm xem nó có được so sánh hay dùng làm khoá ở nơi khác không; nếu có thì để nguyên và ghi vào báo cáo.
- `src/mocks/templates.ts` và nội dung template tải từ máy chủ.
- `src/configs/key.ts`: 2 dòng có chữ Hán cần đọc để phân loại (nhiều khả năng là chú thích cuối dòng).

## 6. Giai đoạn 3 (tuỳ chọn): font hiển thị được tiếng Việt

Chưa xác nhận, cần chạy thử: 12 web font trong `WEB_FONTS` đều là font tiếng Trung, nhiều khả năng thiếu bộ dấu tiếng Việt, khi gõ "Thiết kế" sẽ rơi về font dự phòng và chữ không đều. Nếu chạy thử thấy đúng vậy thì bổ sung nhóm font hỗ trợ tiếng Việt (Roboto, Be Vietnam Pro, Montserrat, Playfair Display...) và đổi font mặc định của textbox. Việc này tách thành kế hoạch riêng vì đụng tới cơ chế nạp font và xuất PDF.

## 7. Kiểm chứng

**Sau giai đoạn 1:**
1. So khoá: `vi.ts` có đúng tập khoá như `en.ts` (script tạm duyệt đệ quy hai object, in ra khoá thiếu và thừa; kết quả phải rỗng).
2. Tìm `zh` trong `src/`, `build/`, `vite.config.mts`: không còn tham chiếu nào tới ngôn ngữ đã xoá.
3. `pnpm build` chạy qua (không có script `type-check` hay `test` trong `package.json`).
4. Chạy `pnpm dev`, kiểm trên trình duyệt:
   - Xoá localStorage rồi mở app: giao diện tiếng Việt, `<html lang="vi">`.
   - Đặt tay `CACHE_LANG = en` mà không có `CACHE_LANG_CHOSEN` rồi tải lại: vẫn tiếng Việt (ca máy cũ).
   - Đặt tay `CACHE_LANG = zh` rồi tải lại: tiếng Việt, không lỗi console.
   - Chọn English trong menu, tải lại: giữ English. Chọn lại Tiếng Việt, tải lại: giữ tiếng Việt.
   - Thành phần Element Plus (date picker, phân trang, hộp xác nhận) hiện tiếng Việt.
   - Tạo textbox mới: chữ mặc định là tiếng Việt.

**Sau mỗi cụm của giai đoạn 2:**
1. Tìm chữ Hán (`[\u4e00-\u9fff]`) trong phạm vi cụm: mọi kết quả còn lại phải là chú thích hoặc thuộc danh sách "không dịch" ở mục 5, liệt kê rõ trong báo cáo.
2. `pnpm build` chạy qua.
3. Mở màn hình tương ứng trên trình duyệt: không còn chữ Hán, không tràn chữ, chức năng liên quan vẫn chạy (đặc biệt menu chuột phải, phím tắt, chọn font, bộ lọc ảnh).

**Sau cùng:** tìm chữ Hán trên toàn `src/`, `index.html`, `server/`; phần còn lại chỉ gồm chú thích và dữ liệu thuộc danh sách "không dịch".

## 8. Rủi ro

| Rủi ro | Cách xử lý |
|---|---|
| Ghi đè thay đổi chưa commit của chủ dự án | Đọc file trước khi sửa, chỉ sửa đúng đoạn cần; không `git checkout`, `git restore`, `git stash`, `git reset` |
| Dịch nhầm một chuỗi vốn là khoá hoặc dữ liệu, làm hỏng chức năng | Quy tắc tra chéo ở mục 5; kiểm chức năng sau mỗi cụm |
| Xoá `zh.ts` trước khi dịch xong làm mất bản gốc để đối chiếu | Xoá sau cùng trong giai đoạn 1; bản gốc vẫn còn trong git (file đã được commit từ trước) |
| Nhãn tiếng Việt dài làm vỡ bố cục | Ưu tiên từ ngắn; soát trực tiếp trên trình duyệt |
| Bản English hiện lẫn tiếng Việt | Đã chấp nhận ở QĐ6 |
| Khó nhận cập nhật từ repo gốc về sau | Chấp nhận: thay tại chỗ sẽ gây xung đột khi merge từ upstream ở các dòng có chuỗi hiển thị |

## 9. Prompt giao cho phiên triển khai

```text
Triển khai kế hoạch trong docs/plans/vietnamese-localization-plan.md của repo D:\code\yft-design (Vue 3 + vue-i18n 9 + Element Plus, quản lý gói bằng pnpm). Đọc toàn bộ file kế hoạch trước khi làm; mọi quyết định thiết kế (QĐ1 đến QĐ7) đã chốt, không bàn lại.

Mục tiêu: thay hẳn tiếng Trung bằng tiếng Việt. Xoá ngôn ngữ `zh`, thêm `vi` làm mặc định, giữ `en` làm ngôn ngữ phụ; mọi chuỗi tiếng Trung viết cứng mà người dùng nhìn thấy được thay tại chỗ bằng tiếng Việt. Tôi không dùng tiếng Trung nên không cần giữ lại bản nào.

Phạm vi phiên này: làm trọn Giai đoạn 1 (mục 4) và kiểm chứng theo mục 7, báo cáo ngắn, rồi làm tiếp Giai đoạn 2 (mục 5) theo thứ tự cụm 2.1 đến 2.6, kiểm chứng xong cụm nào mới sang cụm sau. Giai đoạn 3 không làm.

Ràng buộc:
- Thư mục làm việc đang có nhiều thay đổi chưa commit của tôi, gồm cả src/plugins/i18n/index.ts, src/App.vue, src/components/LoginDialog/index.vue, src/views/Home/index.vue, src/views/Editor/CanvasRight/ElementStylePanel/TextboxStylePanel.vue. Đọc nội dung hiện tại của từng file trước khi sửa và sửa chồng lên. Không chạy git checkout, git restore, git stash, git reset. Không commit, không push trừ khi tôi bảo.
- vi.ts phải có đúng tập khoá của en.ts. Dịch theo quy ước thuật ngữ ở mục 4, lấy nghĩa theo zh.ts vì en.ts có chỗ dịch sai. Chỉ xoá zh.ts sau khi vi.ts đã xong.
- Ba điểm kế hoạch ghi "cần kiểm tra" ở mục 4 phải được xác nhận bằng đọc code hoặc chạy thử trước khi viết phần liên quan. Nếu thực tế khác kế hoạch (ví dụ Element Plus không có vi.mjs), dừng lại báo tôi kèm phương án.
- Ở Giai đoạn 2 chỉ đổi chuỗi hiển thị cho người dùng. Không dịch chú thích code. Không đổi chuỗi chữ Hán là dữ liệu: `value` trong src/configs/fonts.ts, tên web font, chuỗi dùng làm khoá so sánh hay tham số API, src/mocks/templates.ts. Trước khi đổi một chuỗi trong file .ts, tìm xem nó có được so sánh hoặc dùng làm khoá ở nơi khác không; nếu có thì để nguyên và ghi vào báo cáo.

Kiểm chứng bắt buộc: script so khoá giữa vi.ts và en.ts cho kết quả rỗng; không còn tham chiếu tới `zh`; `pnpm build` chạy qua sau Giai đoạn 1 và sau mỗi cụm; chạy `pnpm dev` và kiểm trên trình duyệt đủ các ca trong mục 7; sau mỗi cụm tìm chữ Hán trong phạm vi cụm và giải thích từng kết quả còn lại. Ca nào không kiểm được thì nói rõ là chưa kiểm, đừng ghi là đạt.

Báo cáo cuối bằng tiếng Việt: danh sách file đã sửa, kết quả từng bước kiểm chứng kèm đầu ra thật, danh sách chuỗi chữ Hán cố ý giữ lại và lý do, những chỗ lệch so với kế hoạch. Cập nhật dòng "Trạng thái" ở đầu file kế hoạch cho đúng tiến độ.
```
