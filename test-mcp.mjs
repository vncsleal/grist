import { spawn } from "node:child_process";

const proc = spawn("node", ["dist/mcp/server.js"], {
  stdio: ["pipe", "pipe", "pipe"],
  cwd: new URL(".", import.meta.url).pathname,
});

const initialize = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-runner", version: "0.0.1" },
  },
});

const toolsList = JSON.stringify({
  jsonrpc: "2.0",
  id: 2,
  method: "tools/list",
  params: {},
});

const promptsList = JSON.stringify({
  jsonrpc: "2.0",
  id: 3,
  method: "prompts/list",
  params: {},
});

const callFeedbackStats = JSON.stringify({
  jsonrpc: "2.0",
  id: 4,
  method: "tools/call",
  params: { name: "grist_feedback_stats", arguments: {} },
});

const callGetContext = JSON.stringify({
  jsonrpc: "2.0",
  id: 5,
  method: "tools/call",
  params: { name: "grist_get_context", arguments: {} },
});

const pending = new Map([
  [1, "initialize"],
  [2, "tools/list"],
  [3, "prompts/list"],
  [4, "grist_feedback_stats"],
  [5, "grist_get_context"],
]);

let buf = "";
let passed = 0;
let failed = 0;

function assert(label, cond, detail = "") {
  if (cond) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ": " + detail : ""}`);
    failed++;
  }
}

proc.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    const label = pending.get(obj.id);
    if (!label) continue;
    pending.delete(obj.id);

    console.log(`\n[${label}]`);

    if (obj.id === 1) {
      assert("no error", !obj.error, JSON.stringify(obj.error));
      assert("server name", obj.result?.serverInfo?.name === "grist-mcp");
      assert("version", obj.result?.serverInfo?.version === "0.4.0");
      proc.stdin.write(toolsList + "\n");
    } else if (obj.id === 2) {
      const tools = obj.result?.tools ?? [];
      assert("tool count is 18", tools.length === 18, `got ${tools.length}`);
      const names = tools.map((t) => t.name);
      for (const expected of [
        "grist_onboard",
        "grist_daily_brief",
        "grist_generate_post",
        "grist_rate_card",
        "grist_rate_post",
        "grist_feedback_stats",
      ]) {
        assert(`tool "${expected}" present`, names.includes(expected));
      }
      const withOutputSchema = tools.filter((t) => t.outputSchema);
      assert(
        "all tools have outputSchema",
        withOutputSchema.length === tools.length,
        `${withOutputSchema.length}/${tools.length}`,
      );
      proc.stdin.write(promptsList + "\n");
    } else if (obj.id === 3) {
      const prompts = obj.result?.prompts ?? [];
      assert("prompts ≥ 2", prompts.length >= 2, `got ${prompts.length}`);
      proc.stdin.write(callFeedbackStats + "\n");
    } else if (obj.id === 4) {
      assert("no error", !obj.error);
      assert("result has content", Array.isArray(obj.result?.content));
      assert(
        "feedback stats returns valid text or empty-state message",
        obj.result?.content?.[0]?.text?.length > 0,
      );
      proc.stdin.write(callGetContext + "\n");
    } else if (obj.id === 5) {
      assert("no error", !obj.error);
      assert("result has content", Array.isArray(obj.result?.content));
      // Context may not exist — both "no_context" and a real context are valid
      const text = obj.result?.content?.[0]?.text ?? "";
      assert(
        "get_context responds",
        text.length > 0,
      );
    }

    if (pending.size === 0) {
      proc.kill();
      console.log(`\n--- ${passed} passed, ${failed} failed ---`);
      process.exit(failed > 0 ? 1 : 0);
    }
  }
});

proc.stderr.on("data", () => {}); // suppress startup logs

proc.on("exit", () => {
  if (pending.size > 0) {
    console.error("\nTimeout — pending:", [...pending.values()]);
    process.exit(1);
  }
});

proc.stdin.write(initialize + "\n");

setTimeout(() => {
  console.error("\nTimeout after 10s");
  proc.kill();
  process.exit(1);
}, 10000);
