export type ErrorCode =
  | "NO_API_KEY"
  | "AUTH"
  | "RATE_LIMIT"
  | "NETWORK"
  | "SCHEMA"
  | "PARSE_EMPTY"
  | "TOO_MANY"
  | "NO_VISION"
  | "CANCELLED"
  | "UNKNOWN";

export interface AppError extends Error {
  readonly isAppError: true;
  code: ErrorCode;
  detail?: string;
  raw?: string;
}

export function appError(
  code: ErrorCode,
  opts: { detail?: string; raw?: string } = {},
): AppError {
  const error = new Error(
    `${code}${opts.detail ? `: ${opts.detail}` : ""}`,
  ) as AppError;
  Object.assign(error, { isAppError: true as const, code, ...opts });
  return error;
}

export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as AppError).isAppError === true
  );
}

const MESSAGES: Record<ErrorCode, string> = {
  NO_API_KEY: "Bạn chưa cấu hình API key. Mở phần Cài đặt để nhập.",
  AUTH: "API key không hợp lệ hoặc đã hết hạn. Kiểm tra lại trong Cài đặt.",
  RATE_LIMIT: "Provider đang giới hạn tốc độ. Chờ một lát rồi thử lại.",
  NETWORK: "Không kết nối được tới provider. Kiểm tra mạng hoặc base URL.",
  SCHEMA: "AI trả về dữ liệu sai định dạng. Bạn có thể thử lại.",
  PARSE_EMPTY: "Không tách được câu hỏi nào từ nội dung này.",
  TOO_MANY: "Vượt quá 20 câu cho một lần phân tích. Hãy bớt bớt lại.",
  NO_VISION: "Model hiện tại không nhận ảnh. Ảnh đã được bỏ qua.",
  CANCELLED: "Yêu cầu đã bị huỷ.",
  UNKNOWN: "Đã có lỗi không xác định. Bạn có thể thử lại.",
};

export function errorMessage(error: unknown): string {
  return MESSAGES[isAppError(error) ? error.code : "UNKNOWN"];
}
export interface SerializedError {
  code: ErrorCode;
  detail?: string;
  raw?: string;
}
export function serializeError(error: unknown): SerializedError {
  return isAppError(error)
    ? { code: error.code, detail: error.detail, raw: error.raw }
    : {
        code: "UNKNOWN",
        detail: error instanceof Error ? error.message : String(error),
      };
}
export function deserializeError(error: SerializedError): AppError {
  return appError(error.code, { detail: error.detail, raw: error.raw });
}
