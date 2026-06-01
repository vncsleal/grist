import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import os from "os";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "quillby-test-"));
const outputDir = path.join(tmpDir, "output");
const cacheDir = path.join(tmpDir, "cache");
const latestHarvestPointer = path.join(tmpDir, "latest-harvest.txt");

vi.mock("@quillby/workspace", () => ({
  getCurrentWorkspaceId: () => "test-ws",
  getWorkspacePaths: () => ({
    outputDir,
    cacheDir,
    latestHarvestPointer,
  }),
}));

beforeEach(() => {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

import {
  latestHarvestExists,
  loadLatestHarvest,
  saveDraft,
  listLocalDrafts,
  saveCurationState,
} from "../src/structures.js";

describe("latestHarvestExists", () => {
  it("returns false when no pointer file", () => {
    expect(latestHarvestExists()).toBe(false);
  });

  it("returns false when pointer points to missing file", () => {
    fs.writeFileSync(latestHarvestPointer, "/nonexistent/path.json");
    expect(latestHarvestExists()).toBe(false);
  });

  it("returns true when pointer points to existing file", () => {
    const bundlePath = path.join(outputDir, "structures.json");
    fs.writeFileSync(bundlePath, JSON.stringify({ generatedAt: new Date().toISOString(), dateLabel: "Test", cards: [] }));
    fs.writeFileSync(latestHarvestPointer, bundlePath);
    expect(latestHarvestExists()).toBe(true);
  });
});

describe("loadLatestHarvest", () => {
  it("throws when no harvest exists", () => {
    expect(() => loadLatestHarvest()).toThrow("No harvest found");
  });

  it("throws when pointer is invalid", () => {
    fs.writeFileSync(latestHarvestPointer, "");
    expect(() => loadLatestHarvest()).toThrow("invalid");
  });

  it("loads a valid harvest bundle", () => {
    const bundlePath = path.join(outputDir, "structures.json");
    const bundle = {
      generatedAt: new Date().toISOString(),
      dateLabel: "Jun 1, 2026",
      cards: [{ id: 1, title: "Test", source: "X", link: "https://x.com", thesis: "T", relevanceScore: 5, relevanceReason: "R", keyInsights: [], insightOptions: [], takeOptions: [], angleOptions: [], hookOptions: [], wireframeOptions: [], trendTags: [], references: [] }],
    };
    fs.writeFileSync(bundlePath, JSON.stringify(bundle));
    fs.writeFileSync(latestHarvestPointer, bundlePath);
    const loaded = loadLatestHarvest();
    expect(loaded.cards).toHaveLength(1);
    expect(loaded.cards[0].title).toBe("Test");
  });
});

describe("saveDraft", () => {
  it("saves a draft to the output dir", () => {
    const filePath = saveDraft("Post content", "linkedin");
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("Post content\n");
  });

  it("saves a draft with card ID in filename", () => {
    const filePath = saveDraft("Content", "x", 42);
    expect(filePath).toContain("_card42.md");
  });

  it("saves to harvest output dir when pointer exists", () => {
    const harvestDir = path.join(outputDir, "2026-06-01");
    const bundlePath = path.join(harvestDir, "structures.json");
    fs.mkdirSync(harvestDir, { recursive: true });
    fs.writeFileSync(bundlePath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      dateLabel: "Test",
      cards: [],
    }));
    fs.writeFileSync(latestHarvestPointer, bundlePath);
    const filePath = saveDraft("Draft", "blog");
    expect(filePath).toContain(harvestDir);
  });
});

describe("listLocalDrafts", () => {
  it("returns empty when no drafts exist", () => {
    expect(listLocalDrafts()).toEqual([]);
  });

  it("lists drafts from output dir", () => {
    fs.writeFileSync(path.join(outputDir, "linkedin.md"), "Post text\n");
    const drafts = listLocalDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].platform).toBe("linkedin");
  });

  it("ignores structures.md", () => {
    fs.writeFileSync(path.join(outputDir, "structures.md"), "# Harvest");
    const drafts = listLocalDrafts();
    expect(drafts).toHaveLength(0);
  });

  it("extracts card ID from filename", () => {
    fs.writeFileSync(path.join(outputDir, "x_card5.md"), "Content\n");
    const drafts = listLocalDrafts();
    expect(drafts[0].cardId).toBe(5);
  });

  it("provides preview from first 200 chars", () => {
    const long = "A".repeat(300);
    fs.writeFileSync(path.join(outputDir, "linkedin.md"), long);
    const drafts = listLocalDrafts();
    expect(drafts[0].preview.length).toBeLessThanOrEqual(200);
  });

  it("deduplicates drafts across dirs", () => {
    const draftPath = path.join(outputDir, "linkedin.md");
    fs.writeFileSync(draftPath, "Content\n");
    const harvestDir = path.join(outputDir, "harvest-1");
    fs.mkdirSync(harvestDir, { recursive: true });
    const harvestDraftPath = path.join(harvestDir, "linkedin.md");
    fs.writeFileSync(harvestDraftPath, "Content\n");
    const bundlePath = path.join(harvestDir, "structures.json");
    fs.writeFileSync(bundlePath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      dateLabel: "Test",
      cards: [],
    }));
    fs.writeFileSync(latestHarvestPointer, bundlePath);
    const drafts = listLocalDrafts();
    const uniquePaths = new Set(drafts.map((d) => d.id));
    expect(uniquePaths.size).toBe(drafts.length);
  });

  it("sorts drafts by creation date descending", () => {
    fs.writeFileSync(path.join(outputDir, "old.md"), "Old\n");
    const oldStat = fs.statSync(path.join(outputDir, "old.md"));
    const oldTime = oldStat.mtime.getTime() - 1000;
    fs.utimesSync(path.join(outputDir, "old.md"), oldTime / 1000, oldTime / 1000);

    fs.writeFileSync(path.join(outputDir, "new.md"), "New\n");
    const drafts = listLocalDrafts();
    expect(drafts[0].platform).toBe("new");
  });
});

describe("saveCurationState", () => {
  it("throws when no harvest exists", () => {
    expect(() => saveCurationState({ "1": "shortlisted" })).toThrow("No harvest found");
  });

  it("merges curation state into existing harvest", () => {
    const bundlePath = path.join(outputDir, "structures.json");
    fs.writeFileSync(bundlePath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      dateLabel: "Test",
      cards: [{ id: 1, title: "T", source: "S", link: "https://x.com", thesis: "X", relevanceScore: 5, relevanceReason: "R", keyInsights: [], insightOptions: [], takeOptions: [], angleOptions: [], hookOptions: [], wireframeOptions: [], trendTags: [], references: [] }],
      curationState: { "1": "shortlisted" },
    }));
    fs.writeFileSync(latestHarvestPointer, bundlePath);
    saveCurationState({ "1": "skipped", "2": "shortlisted" });
    const raw = JSON.parse(fs.readFileSync(bundlePath, "utf-8"));
    expect(raw.curationState["1"]).toBe("skipped");
    expect(raw.curationState["2"]).toBe("shortlisted");
  });
});
