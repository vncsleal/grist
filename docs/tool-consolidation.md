# Tool Consolidation: 60 → 12

## Recommendation

Consolidate Quillby's MCP tools from **60 → 12 domain-grouped tools** using
`z.discriminatedUnion` before v1.0 release, combined with low-effort token
optimizations (shorten descriptions, drop `outputSchema`, deduplicate `workspaceId`).
Estimated token savings: **~65-75%** per conversation turn. No features removed.

**Vote:** Approve / Defer / Reject

---

## Problem

Quillby registers **60 MCP tools** with the AI client. Every tool definition (name,
description, input schema) is loaded into the AI's context window on every conversation
turn. This wastes tokens, degrades response quality, and increases AI confusion about
which tool to use.

Current token cost of `tools/list`: **~30KB** (estimated 300-800 bytes per tool).

## Root Cause

Each domain operation was extracted as its own tool (one per CRUD verb). This
created 60 flat entries with no hierarchy. The AI must scan all 60 on every
message to decide which one fits.

## Solution: Domain-Grouped Polymorphic Tools

Replace 60 single-operation tools with **12 domain-grouped tools**, each accepting an
`action` parameter to differentiate operations. Each tool uses `z.discriminatedUnion`
for action branching (see Implementation Guidance below).

### Immediate token optimizations (do regardless of consolidation)

- **Shorten descriptions.** Some tool descriptions are 3-4 lines when one line
  suffices. Trim to the essential: what it does, when to use it. No examples, no
  edge-case commentary.
- **Drop `outputSchema`.** No MCP client reads `outputSchema` for decision-making.
  It adds ~100 bytes per tool (6KB total) with zero value.
- **Deduplicate `workspaceId`.** Currently repeated in every tool definition
  (~200 bytes × 60 = 12KB). Move it to the connection/configuration layer, or
  infer from context. If a persistent param is unavoidable, add it once at the
  transport level instead of every tool.

These three changes alone cut **~50%** of tool-definition tokens with zero
structural risk. They are independent of consolidation and should ship first.

| # | Tool | Replaces | AI-facing Actions |
|---|------|----------|-------------------|
| 1 | `workspace` | 6 tools | list, create, select, get, set_profile, get_profile, setup_identity, clone_voice, delete_clone |
| 2 | `feeds` | 4 tools | discover, add, list, read |
| 3 | `briefing` | 2 tools | generate, get |
| 4 | `cards` | 4 tools | save, list, get, curate |
| 5 | `drafts` | 2 tools | save, list |
| 6 | `memory` | 2 tools | save, get |
| 7 | `post` | 1 tool | *(standalone — generate_post)* |
| 8 | `campaign` | 10 tools | create, start, pause, get, list, create_blueprint, list_blueprints, complete_stage, fail_stage, retry_stage |
| 9 | `generate` | 6 tools | image, audio, video, get_job, list_jobs, get_providers, set_provider, clear_provider |
| 10 | `planning` | 6 tools | create_plan, list_plans, create_task, move_task, delete_task, get_tasks, get_calendar |
| 11 | `session` | 3 tools | start, get, close |
| 12 | `server` | 4 tools | info, onboard, get_plan, get_pricing, manage_billing |

**Total: 60 → 12 tools (80% reduction).**

## Estimated Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Tool definitions sent | 60 | 12 | **80%** |
| Token cost per turn | ~30KB | ~10KB | **~65%** |
| AI decision surface | 60 options | 12 options | **80% narrower** |
| Schema complexity | Simple per-tool | Moderate per-action | Acceptable |

## Risk

- **Breaking change for existing MCP clients.** Client configs reference tool names
  like `generate_image`. After migration, they reference `generate` with
  `action: "image"`. Mitigation: ship this as a v1.0 breaking change with migration
  notes.
- **`z.discriminatedUnion` generates `oneOf` in JSON Schema, and some MCP clients
  have limited or broken `oneOf` rendering.** Claude Desktop, for example, may show
  a flat merged schema where every param from every branch appears optional — which
  is **worse** than having 60 separate tools because the model gets no guidance on
  what's required for which action.

  **Mitigation:** Validate the generated `inputSchema` on the target MCP client(s)
  before shipping. If `oneOf` rendering is broken, fall back to a flat schema with
  per-action docs and rely on strict server-side validation.

- **Schema complexity is a risk, but not from `oneOf`.** Even with a flat schema,
  a naive union of optional fields (`action + name? + id? + url?`) produces a JSON
  schema with every parameter listed as optional — the model has no guidance on
  which fields are required for which action. This can actually **increase** token
  waste because the description has to explain action-dependent constraints, and the
  model still guesses wrong.

  **Recommendation:** use `z.discriminatedUnion` for type safety on the server;
  validate client `oneOf` support separately. If the client handles `oneOf` well
  (e.g., Cursor, Continue.dev), the model benefits. If not (Claude Desktop), the
  server still validates correctly — the model just sees a more ambiguous schema.
  This is equivalent to the flat-union case and not worse than the status quo.

## Implementation Guidance

### Use `z.discriminatedUnion` for tool schemas

A naive optional-union schema is both verbose and ambiguous:

```ts
// ❌ Bad: all fields optional, no structure
const WorkspaceSchema = z.object({
  action: z.enum(["list", "create", "select", "get"]),
  name: z.string().optional(),
  id: z.string().optional(),
});

// Model sees: what do I pass for "list"? Everything is optional.
// Generated JSON schema includes all 3 fields unconditionally.
```

Use a **discriminated union** so each branch only declares its own params:

```ts
// ✅ Good: each action describes exactly what it needs
import { z } from "zod";

const WorkspaceSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("create"), name: z.string() }),
  z.object({ action: z.literal("select"), id: z.string() }),
  z.object({ action: z.literal("get") }),
]);

type WorkspaceAction = z.infer<typeof WorkspaceSchema>;
```

Benefits:
- **Tighter JSON schema.** Each branch generates a standalone `oneOf` entry with only
  its own fields. No optional noise.
- **Clear to the model.** `action: "list"` has no extra params. `action: "create"`
  requires `name`. Zero ambiguity.
- **Type-safe.** TypeScript narrows the union on `action` — handlers get precise types
  without runtime checks.
- **Zod-native.** `z.discriminatedUnion` is built into Zod and maps cleanly to OpenAPI
  discriminated unions. No custom logic.

### How the JSON schema looks to the model

For `WorkspaceSchema` above, the generated `inputSchema` is roughly:

```json
{
  "oneOf": [
    { "properties": { "action": { "const": "list" } }, "required": ["action"] },
    { "properties": { "action": { "const": "create" }, "name": { "type": "string" } }, "required": ["action", "name"] },
    { "properties": { "action": { "const": "select" }, "id": { "type": "string" } }, "required": ["action", "id"] },
    { "properties": { "action": { "const": "get" } }, "required": ["action"] }
  ]
}
```

Compact, unambiguous, and the model can pick the right branch at a glance.

### Validation pattern in handlers

```ts
import { z } from "zod";

const WorkspaceSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("create"), name: z.string() }),
  z.object({ action: z.literal("select"), id: z.string() }),
  z.object({ action: z.literal("get") }),
]);

function handleWorkspace(raw: unknown) {
  const { action, ...rest } = WorkspaceSchema.parse(raw);

  switch (action) {
    case "list":
      return listWorkspaces();        // `rest` is `{}` — no extra fields
    case "create":
      return createWorkspace(rest.name);  // `rest` is `{ name: string }`
    case "select":
      return selectWorkspace(rest.id);    // `rest` is `{ id: string }`
    case "get":
      return getCurrentWorkspace();
  }
}
```

TypeScript narrows `rest` automatically via the discriminated union — no type casts,
no `as` assertions.

## Pre-work (do in parallel with normal development)

- [ ] Shorten all tool descriptions to max 2 lines
- [ ] Remove `outputSchema` from all tool definitions
- [ ] Deduplicate or remove `workspaceId` from tool params

## Timeline

- Day 1: Rewrite tool schemas with `z.discriminatedUnion` + update handlers
- Day 2: Verify `oneOf` rendering on target MCP clients (Claude Desktop, Cursor,
  Continue.dev). If broken, document the fallback behavior (server validates;
  model sees flat schema).
- Day 3: Update tests + verify
- Day 4: Update docs + client config examples
- Day 5: Release v1.0

Add an extra day for client compatibility testing. If `oneOf` is confirmed broken
on primary clients, revert to flat schemas for those tools — the pre-work token
savings still make it worthwhile.

## Decision

Proceed with consolidation to 12 tools before v1.0 release. All tool schemas **must**
use `z.discriminatedUnion` — no flat optional-union schemas.
