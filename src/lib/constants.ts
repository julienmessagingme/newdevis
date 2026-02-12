export const FILE_VALIDATION = {
  MAX_SIZE_BYTES: 10 * 1024 * 1024,
  HEADER_READ_SIZE: 1024,
  ALLOWED_EXTENSIONS: ["pdf", "jpg", "jpeg", "png", "heic"],
  ALLOWED_MIME_TYPES: ["application/pdf", "image/jpeg", "image/png", "image/heic"],
} as const;

export const UPLOAD = {
  MAX_RETRIES: 3,
  RETRY_BACKOFF_MS: 800,
  CACHE_CONTROL_SECONDS: "3600",
} as const;

export const ANALYSIS = {
  FUNCTION_TIMEOUT_MS: 120_000,
  POLL_INTERVAL_MS: 5_000,
} as const;

export const SCORE_VALUES = {
  VERT: "VERT",
  ORANGE: "ORANGE",
  ROUGE: "ROUGE",
} as const;

export const STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  ERROR: "error",
  FAILED: "failed",
} as const;
