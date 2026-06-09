const PREFIX = "[quillby:storage-fs]";

export function logWarn(message: string, context?: Record<string, unknown>): void {
  console.error(`${PREFIX} ${message}`, context ? JSON.stringify(context) : "");
}
