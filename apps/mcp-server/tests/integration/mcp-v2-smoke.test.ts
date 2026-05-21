import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const SERVER_BIN = path.join(ROOT, "dist/mcp/server.js");

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

class McpTestClient {
  private proc: ChildProcess;
  private buf = "";
  private pending = new Map<number, (res: JsonRpcResponse) => void>();

  constructor(dataDir: string) {
    this.proc = spawn("node", [SERVER_BIN], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: ROOT,
      env: { ...process.env, QUILLBY_HOME: dataDir, QUILLBY_TRANSPORT: "stdio", QUILLBY_AUTH_DB_URL: `file:${dataDir}/auth.db` },
    });
    this.proc.stderr?.on("data", () => {});
    this.proc.stdout?.on("data", (chunk: Buffer) => {
      this.buf += chunk.toString();
      const lines = this.buf.split("\n");
      this.buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as JsonRpcResponse;
          const resolve = this.pending.get(obj.id);
          if (resolve) {
            this.pending.delete(obj.id);
            resolve(obj);
          }
        } catch {
          // skip malformed lines
        }
      }
    });
  }

  request(msg: { id: number; [key: string]: unknown }): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(msg.id);
        reject(new Error(`Timeout waiting for response to id=${msg.id}`));
      }, 15000);
      this.pending.set(msg.id, (res) => {
        clearTimeout(timeout);
        resolve(res);
      });
      this.proc.stdin!.write(JSON.stringify(msg) + "\n");
    });
  }

  close() {
    this.proc.kill();
  }
}

let client: McpTestClient;
let tempDir: string;

beforeAll(() => {
  if (!fs.existsSync(SERVER_BIN)) {
    throw new Error(`Built server not found at ${SERVER_BIN}.\nRun 'pnpm --filter @vncsleal/quillby build' first.`);
  }
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-v2-smoke-"));
  client = new McpTestClient(tempDir);
});

afterAll(() => {
  client?.close();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

// One-time MCP handshake — must happen before any other request
let initialized = false;
async function ensureInitialized() {
  if (initialized) return;
  const res = await client.request({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "vitest-v2", version: "0.0.1" },
    },
  });
  expect(res.error).toBeUndefined();
  const info = (res.result as { serverInfo: { version: string } }).serverInfo;
  expect(info.version).toBe("2.0.0");
  initialized = true;
}

describe("v2 server info", () => {
  it("reports version 2.0.0", async () => {
    await ensureInitialized();
  });
});

describe("v2 generation tools", () => {
  let toolNames: string[];

  beforeAll(async () => {
    await ensureInitialized();
    const res = await client.request({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    const tools = (res.result as { tools: { name: string }[] }).tools;
    toolNames = tools.map((t) => t.name);
  });

  it("lists quillby_get_providers", () => expect(toolNames).toContain("quillby_get_providers"));
  it("lists quillby_generate_image", () => expect(toolNames).toContain("quillby_generate_image"));
  it("lists quillby_generate_audio", () => expect(toolNames).toContain("quillby_generate_audio"));
  it("lists quillby_generate_video", () => expect(toolNames).toContain("quillby_generate_video"));
  it("lists quillby_get_job", () => expect(toolNames).toContain("quillby_get_job"));
  it("lists quillby_list_jobs", () => expect(toolNames).toContain("quillby_list_jobs"));
  it("lists quillby_set_provider", () => expect(toolNames).toContain("quillby_set_provider"));
  it("lists quillby_clear_provider", () => expect(toolNames).toContain("quillby_clear_provider"));
  it("lists quillby_set_clone_identity", () => expect(toolNames).toContain("quillby_set_clone_identity"));
  it("lists quillby_clone_voice", () => expect(toolNames).toContain("quillby_clone_voice"));
  it("lists quillby_delete_voice_clone", () => expect(toolNames).toContain("quillby_delete_voice_clone"));
  it("total tool count >= 32 (11 v2 + 21+ pre-existing)", () => {
    expect(toolNames.length).toBeGreaterThanOrEqual(32);
  });
});

describe("quillby_get_providers tool call", () => {
  it("returns provider policy report without error", async () => {
    const res = await client.request({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "quillby_get_providers", arguments: {} },
    });
    expect(res.error).toBeUndefined();
    const content = (res.result as { content: { type: string; text: string }[] }).content;
    expect(content.length).toBeGreaterThan(0);
    const parsed = JSON.parse(content[0].text);
    expect(parsed).toHaveProperty("deploymentMode");
    expect(parsed).toHaveProperty("capabilities");
  });
});

describe("quillby_get_job with non-existent ID", () => {
  it("returns error for missing job", async () => {
    const res = await client.request({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "quillby_get_job", arguments: { jobId: "00000000-0000-0000-0000-000000000000" } },
    });
    expect(res.error).toBeUndefined();
    const content = (res.result as { content: { type: string; text: string }[] }).content;
    expect(content[0].text).toContain("not found");
  });
});

describe("v2 resources", () => {
  let resourceUris: string[];

  beforeAll(async () => {
    const res = await client.request({
      jsonrpc: "2.0",
      id: 5,
      method: "resources/list",
      params: {},
    });
    const resources = (res.result as { resources: { uri: string }[] }).resources;
    resourceUris = resources.map((r) => r.uri);
  });

  it("lists quillby://jobs", () => expect(resourceUris).toContain("quillby://jobs"));
  it("lists quillby://assets/latest", () => expect(resourceUris).toContain("quillby://assets/latest"));
});
