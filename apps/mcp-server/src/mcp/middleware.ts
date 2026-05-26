import type http from "node:http";

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === null) return fallback;
  const value = parseInt(raw, 10);
  if (Number.isNaN(value) || value < 1) return fallback;
  return value;
}

const IP_RATE_LIMIT_MAX = parsePositiveInt(process.env.QUILLBY_IP_RATE_LIMIT, 60);
const IP_RATE_LIMIT_WINDOW_MS = parsePositiveInt(process.env.QUILLBY_IP_RATE_LIMIT_WINDOW_MS, 60_000);

const requestLog = new Map<string, number[]>();

const CLEANUP_INTERVAL = Math.max(IP_RATE_LIMIT_WINDOW_MS, 60_000);
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of requestLog) {
      const recent = timestamps.filter((t) => now - t < IP_RATE_LIMIT_WINDOW_MS);
      if (recent.length === 0) {
        requestLog.delete(ip);
      } else {
        requestLog.set(ip, recent);
      }
    }
  }, CLEANUP_INTERVAL);
  cleanupTimer.unref();
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export function checkRateLimit(ip: string): RateLimitResult {
  ensureCleanupTimer();

  const now = Date.now();
  let timestamps = requestLog.get(ip);
  if (!timestamps) {
    timestamps = [];
    requestLog.set(ip, timestamps);
  }

  const cutoff = now - IP_RATE_LIMIT_WINDOW_MS;
  const recent = timestamps.filter((t) => t > cutoff);
  requestLog.set(ip, recent);

  if (recent.length >= IP_RATE_LIMIT_MAX) {
    const oldest = recent[0]!;
    return {
      allowed: false,
      remaining: 0,
      resetMs: oldest + IP_RATE_LIMIT_WINDOW_MS - now,
    };
  }

  const remaining = IP_RATE_LIMIT_MAX - recent.length - 1;
  recent.push(now);
  return {
    allowed: true,
    remaining,
    resetMs: 0,
  };
}

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "OPTIONS"]);

export function validateMethod(req: http.IncomingMessage): string | null {
  if (!ALLOWED_METHODS.has(req.method ?? "")) {
    return `Method ${req.method} not allowed`;
  }
  return null;
}

export function validateContentType(req: http.IncomingMessage): string | null {
  const method = req.method ?? "";
  if (method === "POST" || method === "PUT") {
    const contentType = req.headers["content-type"] ?? "";
    if (
      !contentType.includes("application/json") &&
      !contentType.includes("multipart/form-data")
    ) {
      return "Unsupported Content-Type: expected application/json or multipart/form-data";
    }
  }
  return null;
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-XSS-Protection": "0",
};

export function applySecurityHeaders(res: http.ServerResponse, baseUrl?: string): void {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }

  if (baseUrl?.startsWith("https://")) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

export function sendJsonError(
  res: http.ServerResponse,
  status: number,
  message: string,
  extra?: Record<string, unknown>,
): void {
  if (res.headersSent) return;
  const body = JSON.stringify({ error: message, ...extra });
  res.writeHead(status, { "Content-Type": "application/json" }).end(body);
}
