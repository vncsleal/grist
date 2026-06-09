const PREFIX = "storage-fs";

export function logWarn(message: string, context?: Record<string, unknown>): void {
  try {
    process.stderr.write(
      JSON.stringify({ ts: new Date().toISOString(), level: "warn", logger: PREFIX, msg: message, ...context }) + "\n",
    );
  } catch {
    process.stderr.write(
      JSON.stringify({ ts: new Date().toISOString(), level: "warn", logger: PREFIX, msg: message, _logError: "serialization failed" }) + "\n",
    );
  }
}
