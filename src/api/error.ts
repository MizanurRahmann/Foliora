// Rejections from Rust arrive as { code, message, details? } (see src-tauri/src/error.rs).
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (typeof err === "object" && err !== null) {
    const { code, message, details } = err as Record<string, unknown>;
    if (typeof code === "string" && typeof message === "string") {
      return new AppError(code, message, details);
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  return new AppError("UNKNOWN", message);
}
