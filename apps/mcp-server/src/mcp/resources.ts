import type { Resource } from "@modelcontextprotocol/sdk/types.js";
import type { WorkspaceStorage, JobStorage } from "@quillby/workspace";
import type { GenerationJob } from "@quillby/core";

export const RESOURCES: Resource[] = [
  { uri: "quillby://workspace/current", name: "Active Workspace", mimeType: "application/json" },
  { uri: "quillby://context", name: "User Content Profile", mimeType: "application/json" },
  { uri: "quillby://memory", name: "User Memory", mimeType: "application/json" },
  { uri: "quillby://harvest/latest", name: "Latest Harvest Cards", mimeType: "application/json" },
  { uri: "quillby://feeds", name: "RSS Feed Sources", mimeType: "text/plain" },
  { uri: "quillby://jobs", name: "Generation Jobs", mimeType: "application/json" },
  { uri: "quillby://assets/latest", name: "Latest Assets", mimeType: "application/json" },
  { uri: "quillby://billing/plan", name: "Billing Plan", mimeType: "application/json" },
];

export async function readResource(
  uri: string,
  storage: WorkspaceStorage & JobStorage,
  deps?: { isCloudMode: () => boolean }
): Promise<{ contents: { uri: string; mimeType: string; text: string }[] }> {
  const baseUri = uri.split("?")[0]!;

  const r = (text: string, mimeType = "application/json") => ({
    contents: [{ uri, mimeType, text }],
  });

  switch (baseUri) {
    case "quillby://workspace/current": {
      const workspace = await storage.getCurrentWorkspace();
      return r(JSON.stringify(workspace, null, 2));
    }

    case "quillby://context": {
      if (await storage.contextExists()) {
        const ctx = await storage.loadContext();
        return r(JSON.stringify(ctx, null, 2));
      }
      return r(JSON.stringify({ error: "No content profile saved. Run the onboarding prompt first." }, null, 2));
    }

    case "quillby://memory": {
      const memory = await storage.loadTypedMemory();
      return r(JSON.stringify(memory, null, 2));
    }

    case "quillby://harvest/latest": {
      if (await storage.latestHarvestExists()) {
        const harvest = await storage.loadLatestHarvest();
        return r(JSON.stringify(harvest, null, 2));
      }
      return r(JSON.stringify({ error: "No harvest data yet. Run a harvest first." }, null, 2));
    }

    case "quillby://feeds": {
      const sources = await storage.loadSources();
      return r(sources.join("\n"), "text/plain");
    }

    case "quillby://jobs": {
      const jobs = await storage.listJobs();
      return r(JSON.stringify(jobs, null, 2));
    }

    case "quillby://assets/latest": {
      const all = await storage.listJobs();
      const done = all.filter((j): j is GenerationJob & { outputRef: string } =>
        j.status === "done" && typeof j.outputRef === "string" && j.outputRef.length > 0
      );
      const assets = done.map((j) => ({
        id: j.id,
        modality: j.modality,
        prompt: j.prompt,
        outputRef: j.outputRef,
        cardId: j.cardId,
        meta: j.meta ? JSON.parse(j.meta) : null,
        createdAt: j.createdAt,
      }));
      return r(JSON.stringify(assets, null, 2));
    }

    case "quillby://billing/plan": {
      if (deps?.isCloudMode?.()) {
        const plan = await storage.getPlan();
        return r(JSON.stringify({ plan, mode: "cloud" }, null, 2));
      }
      return r(JSON.stringify({ error: "Billing only available in cloud mode." }, null, 2));
    }

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}
