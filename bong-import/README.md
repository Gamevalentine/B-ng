# Tải gói mã nguồn BÔNG đã kiểm tra

Chỉ sử dụng nhánh `bong/github-actions-migration-20261009` của Pull Request #5.

1. Mở thư mục `bong-import` trên nhánh này.
2. Chọn **Add file → Upload files**.
3. Tải đúng tệp `BONG_stage_tamagotchi_GitHub_SAFE.zip` được cung cấp trong cuộc trò chuyện, không phải ZIP gốc 26 MB.
4. Bấm **Commit changes** vào chính nhánh này, KHÔNG chọn main.
5. GitHub Actions sẽ kiểm tra SHA-256 rồi chỉ trích xuất mã nguồn vào nhánh nháp; ZIP sẽ bị xóa khỏi đầu nhánh sau khi nhập. Bản ZIP từng được tải lên vẫn còn trong lịch sử Git.

Gói này không chứa `packages/stage-ui`, `packages/provider-inference` hay `packages/pipelines-audio`. Vẫn cần bổ sung các thư mục liên quan sau; **không coi PR là bản BÔNG hoàn thiện**.

Không đặt khóa API, dữ liệu hội thoại hoặc thông tin cá nhân vào đây.
