import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { validateUrl, safeFetch } from "@quillby/providers";

vi.mock("node:dns/promises", () => ({
  resolve4: vi.fn(),
}));

import { resolve4 } from "node:dns/promises";

const mockResolve4 = resolve4 as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  mockResolve4.mockReset();
  mockResolve4.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("validateUrl()", () => {
  it("rejects non-http/https protocols", async () => {
    await expect(validateUrl("ftp://files.example.com")).rejects.toThrow(
      'SSRF blocked: non-HTTP protocol "ftp:"',
    );
    await expect(validateUrl("file:///etc/passwd")).rejects.toThrow(
      'SSRF blocked: non-HTTP protocol "file:"',
    );
    await expect(validateUrl("data:text/plain,hello")).rejects.toThrow(
      'SSRF blocked: non-HTTP protocol "data:"',
    );
  });

  it("rejects loopback (127.0.0.1)", async () => {
    await expect(validateUrl("http://127.0.0.1:8080/admin")).rejects.toThrow(
      'SSRF blocked: private IP "127.0.0.1"',
    );
    await expect(validateUrl("http://127.0.0.2/")).rejects.toThrow(
      'SSRF blocked: private IP "127.0.0.2"',
    );
  });

  it("rejects private 10.x.x.x", async () => {
    await expect(validateUrl("http://10.0.0.1/")).rejects.toThrow(
      'SSRF blocked: private IP "10.0.0.1"',
    );
    await expect(validateUrl("http://10.255.255.255/")).rejects.toThrow(
      'SSRF blocked: private IP "10.255.255.255"',
    );
  });

  it("rejects private 192.168.x.x", async () => {
    await expect(validateUrl("http://192.168.1.1/")).rejects.toThrow(
      'SSRF blocked: private IP "192.168.1.1"',
    );
    await expect(validateUrl("http://192.168.0.0/")).rejects.toThrow(
      'SSRF blocked: private IP "192.168.0.0"',
    );
  });

  it("rejects private 172.16-31.x.x", async () => {
    await expect(validateUrl("http://172.16.0.1/")).rejects.toThrow(
      'SSRF blocked: private IP "172.16.0.1"',
    );
    await expect(validateUrl("http://172.31.255.255/")).rejects.toThrow(
      'SSRF blocked: private IP "172.31.255.255"',
    );
  });

  it("rejects link-local (169.254.x.x)", async () => {
    await expect(validateUrl("http://169.254.1.1/")).rejects.toThrow(
      'SSRF blocked: private IP "169.254.1.1"',
    );
  });

  it("passes public IPs", async () => {
    mockResolve4.mockResolvedValue([]);

    await expect(validateUrl("http://93.184.216.34/")).resolves.toBeUndefined();
    await expect(validateUrl("http://8.8.8.8/")).resolves.toBeUndefined();
    await expect(validateUrl("http://1.1.1.1/")).resolves.toBeUndefined();
  });

  it("rejects CGNAT range (100.64.x.x)", async () => {
    await expect(validateUrl("http://100.64.0.1/")).rejects.toThrow(
      'SSRF blocked: private IP "100.64.0.1"',
    );
  });

  it("rejects 0.0.0.0", async () => {
    await expect(validateUrl("http://0.0.0.0/")).rejects.toThrow(
      'SSRF blocked: private IP "0.0.0.0"',
    );
  });

  it("resolves DNS and rejects if resolves to private IP", async () => {
    mockResolve4.mockResolvedValue(["10.0.0.5"]);

    await expect(validateUrl("http://internal-service.local/api")).rejects.toThrow(
      'SSRF blocked: DNS resolved to private IP "10.0.0.5" for host "internal-service.local"',
    );
  });

  it("passes DNS that resolves to public IP", async () => {
    mockResolve4.mockResolvedValue(["93.184.216.34"]);

    await expect(validateUrl("http://example.com/")).resolves.toBeUndefined();
  });

  it("rejects IPv6 loopback (::1)", async () => {
    await expect(validateUrl("http://[::1]:8080/")).rejects.toThrow(
      'SSRF blocked: private IP "::1"',
    );
  });

  it("rejects IPv4-mapped IPv6 loopback", async () => {
    await expect(validateUrl("http://[::ffff:127.0.0.1]/")).rejects.toThrow(
      'SSRF blocked: private IP "::ffff:7f00:1"',
    );
  });

  it("rejects IPv6 unique local (fc00::/7)", async () => {
    await expect(validateUrl("http://[fc00::1]/")).rejects.toThrow(
      'SSRF blocked: private IP "fc00::1"',
    );
    await expect(validateUrl("http://[fd00::1]/")).rejects.toThrow(
      'SSRF blocked: private IP "fd00::1"',
    );
  });

  it("rejects IPv6 link-local (fe80::)", async () => {
    await expect(validateUrl("http://[fe80::1]/")).rejects.toThrow(
      'SSRF blocked: private IP "fe80::1"',
    );
  });

  it("rejects benchmark range (198.18.x.x)", async () => {
    await expect(validateUrl("http://198.18.0.1/")).rejects.toThrow(
      'SSRF blocked: private IP "198.18.0.1"',
    );
  });
});

describe("safeFetch()", () => {
  it("throws on private IP", async () => {
    await expect(safeFetch("http://127.0.0.1/")).rejects.toThrow(
      "SSRF blocked",
    );
  });

  it("applies timeout via AbortSignal", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        expect(init?.signal).toBeDefined();
        return new Response("ok", { status: 200 });
      }),
    );

    const res = await safeFetch("http://example.com/", { timeout: 5000, signal: controller.signal });
    expect(res.status).toBe(200);
  });

  it("follows redirects with SSRF check on each", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "http://example.com/redirect" },
        }),
      )
      .mockResolvedValueOnce(new Response("final", { status: 200 }));

    vi.stubGlobal("fetch", mockFetch);

    const res = await safeFetch("http://example.com/start");
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const callUrls = mockFetch.mock.calls.map((c: [string]) => c[0]);
    expect(callUrls).toEqual([
      "http://example.com/start",
      "http://example.com/redirect",
    ]);
  });

  it("blocks redirect to private IP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/secret" },
        }),
      ),
    );

    await expect(safeFetch("http://example.com/start")).rejects.toThrow(
      "SSRF blocked",
    );
  });

  it("enforces max redirect limit", async () => {
    const redirectResponse = () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://example.com/loop" },
      });

    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(redirectResponse()),
    );

    vi.stubGlobal("fetch", mockFetch);

    const res = await safeFetch("http://example.com/start", { maxRedirects: 2 });
    expect(res.status).toBe(302);
    // initial + 1st redirect + 2nd redirect = 3 calls, then maxRedirects=0 stops
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
