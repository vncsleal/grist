import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type http from "node:http";
import type { Socket } from "node:net";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.QUILLBY_IP_RATE_LIMIT = "60";
  process.env.QUILLBY_IP_RATE_LIMIT_WINDOW_MS = "60000";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

type MockRes = http.ServerResponse & {
  _body: string;
  _status: number;
  _headers: Record<string, string>;
};

function mockReq(overrides: Partial<http.IncomingMessage> = {}): http.IncomingMessage {
  return {
    method: "GET",
    headers: {},
    socket: {} as Socket,
    ...overrides,
  } as unknown as http.IncomingMessage;
}

function mockRes(): MockRes {
  const headers: Record<string, string> = {};
  let status = 200;
  let body = "";
  let sent = false;
  const self: MockRes = {
    _body: "",
    _status: 200,
    _headers: headers,
    setHeader(k: string, v: string | number | readonly string[]) { headers[k] = String(v); return self; },
    getHeader(k: string) { return headers[k]; },
    get headersSent() { return sent; },
    writeHead(s: number, h?: Record<string, string | number | readonly string[]>) {
      status = s;
      if (h) {
        for (const [k, v] of Object.entries(h)) {
          headers[k] = String(v);
        }
      }
      return self;
    },
    end(b?: string) { body = b ?? ""; sent = true; return self; },
  } as unknown as MockRes;
  Object.defineProperty(self, "_body", { get: () => body });
  Object.defineProperty(self, "_status", { get: () => status });
  Object.defineProperty(self, "_headers", { get: () => headers });
  return self;
}

// ---------------------------------------------------------------------------
// checkRateLimit
// ---------------------------------------------------------------------------
describe("checkRateLimit", () => {
  it("allows first request and reports remaining as MAX-1", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const result = mod.checkRateLimit(`first-${Date.now()}`);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);
    expect(result.resetMs).toBe(0);
  });

  it("decrements remaining on consecutive requests", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const ip = `decrement-${Date.now()}`;
    expect(mod.checkRateLimit(ip).remaining).toBe(59);
    expect(mod.checkRateLimit(ip).remaining).toBe(58);
    expect(mod.checkRateLimit(ip).remaining).toBe(57);
  });

  it("different IPs have independent counters", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const ipA = `indep-A-${Date.now()}`;
    const ipB = `indep-B-${Date.now()}`;
    expect(mod.checkRateLimit(ipA).allowed).toBe(true);
    expect(mod.checkRateLimit(ipB).allowed).toBe(true);
  });

  it("denies requests that exceed MAX and reports resetMs", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const ip = `exceed-${Date.now()}`;
    for (let i = 0; i < 60; i++) {
      mod.checkRateLimit(ip);
    }
    const last = mod.checkRateLimit(ip);
    expect(last.allowed).toBe(false);
    expect(last.remaining).toBe(0);
    expect(last.resetMs).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// validateMethod
// ---------------------------------------------------------------------------
describe("validateMethod", () => {
  it("allows GET", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    expect(mod.validateMethod(mockReq({ method: "GET" }))).toBeNull();
  });

  it("allows POST", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    expect(mod.validateMethod(mockReq({ method: "POST" }))).toBeNull();
  });

  it("allows PUT", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    expect(mod.validateMethod(mockReq({ method: "PUT" }))).toBeNull();
  });

  it("allows DELETE", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    expect(mod.validateMethod(mockReq({ method: "DELETE" }))).toBeNull();
  });

  it("allows OPTIONS", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    expect(mod.validateMethod(mockReq({ method: "OPTIONS" }))).toBeNull();
  });

  it("rejects PATCH", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    expect(mod.validateMethod(mockReq({ method: "PATCH" }))).toBe("Method PATCH not allowed");
  });

  it("rejects unknown method", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    expect(mod.validateMethod(mockReq({ method: "CONNECT" }))).toBe("Method CONNECT not allowed");
  });

  it("rejects missing method", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    expect(mod.validateMethod(mockReq({ method: undefined }))).toBe("Method undefined not allowed");
  });
});

// ---------------------------------------------------------------------------
// validateContentType
// ---------------------------------------------------------------------------
describe("validateContentType", () => {
  it("passes POST with application/json", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const req = mockReq({ method: "POST", headers: { "content-type": "application/json" } });
    expect(mod.validateContentType(req)).toBeNull();
  });

  it("passes POST with application/json; charset=utf-8", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const req = mockReq({ method: "POST", headers: { "content-type": "application/json; charset=utf-8" } });
    expect(mod.validateContentType(req)).toBeNull();
  });

  it("passes POST with multipart/form-data", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const req = mockReq({ method: "POST", headers: { "content-type": "multipart/form-data; boundary=abc123" } });
    expect(mod.validateContentType(req)).toBeNull();
  });

  it("rejects POST with text/plain", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const req = mockReq({ method: "POST", headers: { "content-type": "text/plain" } });
    expect(mod.validateContentType(req)).toBe(
      "Unsupported Content-Type: expected application/json or multipart/form-data",
    );
  });

  it("rejects POST with application/xml", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const req = mockReq({ method: "POST", headers: { "content-type": "application/xml" } });
    expect(mod.validateContentType(req)).toBe(
      "Unsupported Content-Type: expected application/json or multipart/form-data",
    );
  });

  it("rejects POST with no Content-Type header", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const req = mockReq({ method: "POST", headers: {} });
    expect(mod.validateContentType(req)).toBe(
      "Unsupported Content-Type: expected application/json or multipart/form-data",
    );
  });

  it("passes GET regardless of Content-Type", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const req = mockReq({ method: "GET", headers: { "content-type": "text/plain" } });
    expect(mod.validateContentType(req)).toBeNull();
  });

  it("passes DELETE regardless of Content-Type", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const req = mockReq({ method: "DELETE", headers: { "content-type": "text/plain" } });
    expect(mod.validateContentType(req)).toBeNull();
  });

  it("rejects PUT with text/plain", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const req = mockReq({ method: "PUT", headers: { "content-type": "text/plain" } });
    expect(mod.validateContentType(req)).toBe(
      "Unsupported Content-Type: expected application/json or multipart/form-data",
    );
  });

  it("passes PUT with application/json", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const req = mockReq({ method: "PUT", headers: { "content-type": "application/json" } });
    expect(mod.validateContentType(req)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applySecurityHeaders
// ---------------------------------------------------------------------------
describe("applySecurityHeaders", () => {
  it("sets X-Content-Type-Options to nosniff", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const res = mockRes();
    mod.applySecurityHeaders(res);
    expect(res._headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("sets X-Frame-Options to DENY", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const res = mockRes();
    mod.applySecurityHeaders(res);
    expect(res._headers["X-Frame-Options"]).toBe("DENY");
  });

  it("sets Referrer-Policy", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const res = mockRes();
    mod.applySecurityHeaders(res);
    expect(res._headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("sets X-XSS-Protection to 0", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const res = mockRes();
    mod.applySecurityHeaders(res);
    expect(res._headers["X-XSS-Protection"]).toBe("0");
  });

  it("does not set HSTS when baseUrl is http", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const res = mockRes();
    mod.applySecurityHeaders(res, "http://localhost:3000");
    expect(res._headers["Strict-Transport-Security"]).toBeUndefined();
  });

  it("sets HSTS when baseUrl is https", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const res = mockRes();
    mod.applySecurityHeaders(res, "https://quillby.example.com");
    expect(res._headers["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
  });

  it("does not set HSTS when baseUrl is omitted", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const res = mockRes();
    mod.applySecurityHeaders(res);
    expect(res._headers["Strict-Transport-Security"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// sendJsonError
// ---------------------------------------------------------------------------
describe("sendJsonError", () => {
  it("writes error as JSON with correct status", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const res = mockRes();
    mod.sendJsonError(res, 429, "Too many requests");
    expect(JSON.parse(res._body as string)).toEqual({ error: "Too many requests" });
  });

  it("includes extra fields when provided", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const res = mockRes();
    mod.sendJsonError(res, 400, "Bad request", { field: "name" });
    expect(JSON.parse(res._body as string)).toEqual({ error: "Bad request", field: "name" });
  });

  it("sets Content-Type header to application/json", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const res = mockRes();
    mod.sendJsonError(res, 400, "Bad request");
    expect(res._headers["Content-Type"]).toBe("application/json");
  });

  it("is a no-op if headers already sent", async () => {
    const mod = await import("../../src/mcp/middleware.js");
    const res = mockRes();
    Object.defineProperty(res, "headersSent", { value: true });
    const before = res._body;
    mod.sendJsonError(res, 500, "fail");
    expect(res._body).toBe(before);
  });
});
