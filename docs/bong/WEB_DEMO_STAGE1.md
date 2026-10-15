# BÔNG Web Demo — Giai đoạn 1

## Mục tiêu
Sử dụng trực tiếp ứng dụng trình duyệt hiện có tại `apps/stage-web` của fork BÔNG, thay vì sao chép giao diện Electron hay dựng một giao diện giả. Bản web chạy độc lập với ứng dụng Windows.

## Tình trạng kiểm chứng
- Đã xác định source Vue/Vite ở `apps/stage-web`, có `src/App.vue`, pages, components, composables, stores, assets và workers.
- Nhánh `bong-web-demo` được tách từ nhánh mã nguồn đang thử nghiệm trong PR #5, không từ `main` cũ.
- Workflow `BONG web demo build (manual)` tạo bản build tĩnh và tải lên GitHub Actions Artifact; **không** deploy công khai, không tạo Release, không sửa ứng dụng Windows.
- Build web, hình ảnh gốc nhân vật, cấu hình tiếng Việt và khả năng gọi mô hình AI **chưa được xác nhận thành công** cho đến khi CI chạy đạt và kiểm tra trực tiếp trên browser.

## Ranh giới web/desktop
Web có thể dùng UI Vue, các thành phần sân khấu nhân vật, chat và API trình duyệt. Không giả lập Electron IPC, điều khiển Windows, đọc màn hình nền hoặc truy cập tệp PC. Những tính năng riêng Windows phải có adapter tương ứng hoặc bị vô hiệu hóa rõ ràng trên web.

## Giai đoạn tiếp theo
1. Xem kết quả Actions của workflow build web, xử lý lỗi phiên bản bằng từng nhóm nhỏ (không tắt typecheck/test để che lỗi).
2. Kiểm tra logo BÔNG, model 2D được phép phân phối, assets và các trang người dùng trên web.
3. Tạo URL HTTPS thử nghiệm có kiểm soát; không ghi API key hay dữ liệu cá nhân vào repo, bundle hoặc site công khai.
4. Sau khi xác nhận giao diện, mới tích hợp micro, Sherpa, Mai Chi và hội thoại ở giai đoạn 2.

## Chạy/kiểm tra
Từ GitHub: Actions → `BONG web demo build (manual)` → Run workflow → nhánh `bong-web-demo`. Artifact chỉ xuất hiện nếu build thành công. Có thể dùng `pnpm run dev:web` trên môi trường phát triển có Node/pnpm, **không yêu cầu chủ sở hữu chạy CMD trên laptop**.
