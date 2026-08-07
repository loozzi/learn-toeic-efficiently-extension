# IMEN

Tiện ích mở rộng Chrome hỗ trợ luyện TOEIC bằng AI.

> Bản tiếng Anh: [README.md](README.md)

## Cài đặt

Yêu cầu Chrome 116 trở lên (dùng sidePanel API).

1. Vào trang [Releases](https://github.com/loozzi/learn-toeic-efficiently-extension/releases)
   và tải file `.zip` ở bản phát hành mới nhất.
2. Giải nén file vừa tải vào một thư mục riêng (ví dụ `imen-ext`).
3. Mở `chrome://extensions` trên Chrome.
4. Bật **Developer mode** (chế độ nhà phát triển) ở góc trên bên phải.
5. Bấm **Load unpacked** và chọn thư mục vừa giải nén ở bước 2.
6. IMEN sẽ xuất hiện trong danh sách tiện ích và trên thanh công cụ.

Để cập nhật, tải bản phát hành mới, giải nén đè lên thư mục cũ (hoặc vào một
thư mục mới), sau đó bấm biểu tượng refresh trên thẻ IMEN tại
`chrome://extensions`.

## Tính năng

**Đã hoàn thành**

- **Bắt văn bản khi bôi đen (selection capture)** — bôi đen một khối câu hỏi
  TOEIC trên bất kỳ trang luyện tập nào, một nút nổi sẽ xuất hiện; bấm vào đó
  sẽ mở side panel với nội dung đã được bắt sẵn.
- **Chụp ảnh** — chụp/cắt ảnh gần vùng bôi đen (quét DOM, dự phòng bằng
  `captureVisibleTab`), cùng công cụ "Snip region" cho phép kéo chọn vùng thủ
  công dành cho các trang render bằng canvas hoặc PDF.
- **Luồng dán thủ công (Paste)** — tab "Paste" trong side panel cho phép dán
  trực tiếp văn bản hoặc ảnh từ clipboard, dùng cho các trang mà content
  script không chạy được.
- **Pipeline AI 3 bước** — phân tích cấu trúc câu hỏi → chấm và giải thích
  đáp án đã chọn → chẩn đoán tâm lý sai (theo yêu cầu) cho câu trả lời sai,
  có streaming và theo dõi số token sử dụng.
- **Hỗ trợ nhà cung cấp tương thích OpenAI và Gemini**, kể cả Base URL tùy
  chỉnh (OpenRouter, Groq, LM Studio chạy local, ...), có nút "Test
  connection" để kiểm tra kết nối.
- **Bảng điều khiển Lịch sử & Thống kê** — danh sách câu hỏi có thể lọc, tìm
  kiếm, làm lại miễn phí, xem độ chính xác theo Part TOEIC/chủ đề/lý do sai,
  và tóm tắt điểm yếu do AI tạo ra.
- **Xuất/nhập JSON** lịch sử câu hỏi (nhập theo kiểu cộng dồn, không bao giờ
  chứa API key).
- **Giao diện tiếng Việt** kèm chuyển đổi theme sáng/tối; ngôn ngữ giải thích
  có thể cấu hình (Tiếng Việt / Tiếng Anh / song ngữ).

**Đang phát triển / chưa hoàn thành**

- Các vòng kiểm thử thủ công trên trình duyệt thật cho các luồng trên vẫn
  còn tồn đọng — test tự động và build đều pass, nhưng danh sách checklist
  trong `docs/superpowers/plans/plan-*-acceptance.md` chưa được chạy và ghi
  nhận đầy đủ.
- Nằm ngoài phạm vi hiện tại: học theo phương pháp lặp lại ngắt quãng (SRS),
  đồng bộ đám mây / nhiều thiết bị, âm thanh Part 1–4, tự động nhận diện đáp
  án người dùng đã chọn trên trang, tài khoản người dùng, và hỗ trợ Firefox.

## Phát triển

    npm install
    npm test          # Vitest
    npm run build     # xuất ra thư mục dist/

Load thư mục `dist/` qua chrome://extensions → Developer mode → Load
unpacked. Yêu cầu Chrome 116 trở lên (sidePanel API).

## Cấu hình

Mở trang options của tiện ích và thiết lập nhà cung cấp (provider), API key
và model. Để trống Base URL để dùng endpoint mặc định của nhà cung cấp; điền
vào nếu muốn trỏ tới OpenRouter, Groq hoặc một server LM Studio chạy local.

API key được lưu **không mã hóa** trong chrome.storage.local. Bất kỳ ai có
quyền truy cập vào profile Chrome của bạn đều có thể đọc được key này.

## Bảng điều khiển (Dashboard)

Trang options có ba tab: History (Lịch sử), Stats (Thống kê) và Settings
(Cài đặt).

Thống kê mặc định chỉ tính lần trả lời đầu tiên, để việc làm lại một câu đã
biết đáp án không làm tăng ảo độ chính xác. Bật "Include retries" để xem cả
hai.

Export tạo ra một bản sao lưu JSON cho lịch sử câu hỏi. File này không bao
giờ chứa API key. Import theo kiểu cộng dồn — import lại cùng một file sẽ
không thay đổi gì.

## Kiến trúc

Xem `docs/superpowers/specs/2026-08-07-imen-ext-design.md`.
API key chỉ tồn tại trong service worker; không có ngữ cảnh nào khác được
phép gọi trực tiếp tới nhà cung cấp AI.
