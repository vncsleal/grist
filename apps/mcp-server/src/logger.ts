export type LogLevel = "info" | "warn" | "error" | "fatal";

const LEVELS: Record<LogLevel, number> = { info: 0, warn: 1, error: 2, fatal: 3 };
const MIN_LEVEL = (process.env.QUILLBY_LOG_LEVEL ?? "info") as LogLevel;

export function slog(level: LogLevel, msg: string, extra?: Record<string, unknown>): void {
  if ((LEVELS[level] ?? -1) < LEVELS[MIN_LEVEL]) return;
  try {
    process.stderr.write(
      JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }) + "\n",
    );
  } catch {
    process.stderr.write(
      JSON.stringify({ ts: new Date().toISOString(), level, msg, _logError: "serialization failed" }) + "\n",
    );
  }
}

export function logInfo(msg: string, extra?: Record<string, unknown>): void {
  slog("info", msg, extra);
}

export function logWarn(msg: string, extra?: Record<string, unknown>): void {
  slog("warn", msg, extra);
}

export function logError(msg: string, extra?: Record<string, unknown>): void {
  slog("error", msg, extra);
}

export function logFatal(msg: string, extra?: Record<string, unknown>): void {
  slog("fatal", msg, extra);
}
