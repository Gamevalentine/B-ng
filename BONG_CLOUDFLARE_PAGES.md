# BÔNG Web – triển khai thử nghiệm trên Cloudflare Pages

Đây là **website BÔNG Web** chạy tách biệt, không phải bản Windows. Giữ nhánh `main`, website hiện có, GitHub Actions và tài khoản AI nguyên trạng. Không cần GitHub Actions, Codespaces, CMD trên máy Windows hay dịch vụ trả phí.

## 1. Tạo dự án Cloudflare Pages riêng

1. Đăng nhập https://dash.cloudflare.com/ và mở **Workers & Pages → Create → Pages → Connect to Git** (cách ghi nút có thể thay đổi theo giao diện).
2. Chỉ cấp quyền truy cập GitHub repository `Gamevalentine/B-ng` nếu có tùy chọn giới hạn.
3. Tạo project Pages mới, ví dụ `bong-web-preview`, không chọn Worker `moeru-ai-airi` hoặc trang web đang dùng.
4. **Production branch:** `bong/web-voice-chat-fix-20261016`. Đây là nhánh riêng của BÔNG; không sử dụng `main`.
5. **Framework preset:** None. **Root directory:** repository root `/` (đừng chọn `apps/stage-web`, vì đây là pnpm monorepo).
6. **Build command:** `pnpm install --frozen-lockfile --ignore-scripts && pnpm run build:bong-cloudflare`
7. **Build output directory:** `apps/stage-web/dist`

## 2. Biến môi trường build

Thêm những biến này vào **Build / Environment variables** (không phải API key):

| Biến | Giá trị |
|---|---|
| `NODE_VERSION` | `22` |
| `PNPM_VERSION` | `11.24.0` |
| `SKIP_DEPENDENCY_INSTALL` | `1` |
| `VITE_BONG_UI_PREVIEW` | `true` |
| `VITE_BONG_PAGES` | `true` |
| `VITE_ENABLE_POSTHOG` | `false` |
| `BONG_PAGES_BASE_PATH` | `/` |

Không nhập API key Gemini vào biến `VITE_*`, tệp .env hoặc repo công khai. Người dùng nhập key của họ trực tiếp vào giao diện ở thời điểm sử dụng; vẫn phải cân nhắc hạn mức.

## 3. Deploy

Chọn **Save and Deploy**. Cloudflare tự checkout GitHub, dùng build và kiểm tra cấu hình được đưa vào repository, sau đó cung cấp địa chỉ `https://<tên-project>.pages.dev`. Chỉ sử dụng đường dẫn mà Cloudflare thực sự cấp, không giả định project name còn trống.

Nếu muốn các lần sửa GitHub không tự build, sau khi triển khai thành công hãy vào **Settings → Builds → Branch control** để tắt auto production deployment. Bật lại khi cần triển khai bản sửa tiếp theo.

## 4. Phạm vi và giới hạn

- Các lệnh chạy trong môi trường **Cloudflare Pages Build**, **không** dùng GitHub Actions/Codespaces hoặc CMD máy người dùng.
- Build script chỉ chấp nhận nhánh `bong/web-voice-chat-fix-20261016` trong Pages, luôn build chế độ BÔNG, tắt analytics và sử dụng đường dẫn `/`.
- Kiểm tra tệp `dist`: có trang HTML, giới hạn 25 MiB/tệp và 20.000 tệp trên gói Free; dọn source map nhưng không tự ý xóa ảnh/Live2D.
- Không bảo đảm giọng Mai Chi, micro, chất lượng Live2D hay mô hình Gemini hoạt động chỉ vì build thành công. Sau deploy cần tự kiểm thử trình duyệt Chrome/iPhone.
- Nếu build không thành công, xem **Deployments → build logs**; không chạy lại liên tục. Gửi đúng dòng lỗi để sửa.

Nguồn tham khảo: https://developers.cloudflare.com/pages/get-started/git-integration/ và https://developers.cloudflare.com/pages/platform/limits/.
