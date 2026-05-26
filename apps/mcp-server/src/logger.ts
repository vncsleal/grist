export type LogLevel = "info" | "warn" | "error" | "fatal";

export function slog(level: LogLevel, msg: string, extra?: Record<string, unknown>): void {
  process.stderr.write(
    JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }) + "\n",
  );
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
