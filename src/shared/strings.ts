import type { ErrorTag } from './types';

export const ERROR_TAG_ORDER: ErrorTag[] = ['no_grammar', 'no_structure', 'no_vocab', 'misclick', 'misread', 'time_pressure', 'trap_similar'];

export const S = {
  appName: 'IMEN',
  onboarding: { title: 'Chưa sẵn sàng', body: 'Cần cấu hình AI provider trước khi dùng.', openSettings: 'Mở Cài đặt' },
  paste: { tab: 'Dán đề', placeholder: 'Dán câu hỏi và các lựa chọn vào đây…', submit: 'Tách câu hỏi', parsing: 'Đang tách câu hỏi…', empty: 'Chưa có nội dung nào để tách.', imageCount: (count: number) => `Đã đính kèm ${count} ảnh` },
  review: { title: 'Bạn đã chọn đáp án nào?', hint: 'Chọn đúng đáp án bạn đã khoanh lúc làm bài. Chưa có đáp án đúng ở đây.', visionSkipped: 'Model hiện tại không nhận ảnh. Ảnh đã được bỏ qua.', notAttempted: 'Chưa làm', skip: 'Bỏ qua câu này', analyzeButton: 'Phân tích', analyzing: 'Đang phân tích…', counter: (done: number, total: number) => `Đã chọn ${done}/${total} câu` },
  result: { correct: 'Đúng', wrong: 'Sai', youChose: 'Bạn chọn', correctAnswer: 'Đáp án đúng', explanation: 'Giải thích', strategy: 'Mẹo nhận biết', distractors: 'Vì sao các đáp án khác sai', analyzeMistake: 'Phân tích lỗi sai', backToPaste: 'Phân tích cụm khác' },
  errorPanel: { title: 'Vì sao bạn chọn sai?', hint: 'Chọn một hoặc nhiều lý do, thêm ghi chú nếu muốn.', notePlaceholder: 'Ghi chú thêm (không bắt buộc)…', submit: 'Gửi', thinking: 'Đang phân tích…', diagnosis: 'Chẩn đoán', fixAdvice: 'Cách sửa' },
  errorTag: { no_grammar: 'Không biết ngữ pháp', no_structure: 'Không biết cấu trúc', no_vocab: 'Không biết từ vựng', misclick: 'Bấm nhầm', misread: 'Đọc lướt hiểu sai', time_pressure: 'Hết giờ đoán bừa', trap_similar: 'Bị bẫy đáp án gần giống' } satisfies Record<ErrorTag, string>,
  settings: { title: 'Cài đặt', provider: 'Provider', baseUrl: 'Base URL', baseUrlHint: 'Để trống để dùng endpoint mặc định của provider.', apiKey: 'API key', apiKeyWarning: 'API key được lưu không mã hoá trong bộ nhớ của Chrome. Ai truy cập được profile Chrome của bạn đều đọc được nó.', model: 'Model', supportsVision: 'Model này nhận được ảnh', explanationLanguage: 'Ngôn ngữ giải thích', langVi: 'Tiếng Việt', langEn: 'Tiếng Anh', langBilingual: 'Song ngữ', captureImages: 'Bắt ảnh trong câu hỏi', minSelectionChars: 'Số ký tự tối thiểu để hiện nút', testConnection: 'Kiểm tra kết nối', testing: 'Đang kiểm tra…', testOk: 'Kết nối thành công.', save: 'Lưu', saved: 'Đã lưu.', required: 'Bắt buộc' },
  common: { retry: 'Thử lại', rawOutput: 'Xem dữ liệu thô AI trả về', cancel: 'Huỷ' },
} as const;
