import * as fs from "fs";
import * as path from "path";
import {
  CampaignSchema,
  BlueprintSchema,
  type Campaign,
  type Blueprint,
  type CampaignStatus,
} from "@quillby/content";
import { getCurrentWorkspaceId, getWorkspacePaths } from "@quillby/workspace";
import { NotFoundError } from "@quillby/core";
import { logWarn } from "./log.js";

function campaignsDir(workspaceId?: string): string {
  const wsId = workspaceId ?? getCurrentWorkspaceId();
  return getWorkspacePaths(wsId).campaignsDir;
}

function campaignFilePath(campaignId: string, workspaceId?: string): string {
  return path.join(campaignsDir(workspaceId), `campaign-${campaignId}.json`);
}

function blueprintFilePath(blueprintId: string, workspaceId?: string): string {
  return path.join(campaignsDir(workspaceId), `blueprint-${blueprintId}.json`);
}

function readCampaigns(workspaceId?: string): Campaign[] {
  const dir = campaignsDir(workspaceId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith("campaign-") && f.endsWith(".json"))
    .map((f) => {
      try {
        return CampaignSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")));
      } catch {
        logWarn("Corrupted campaign file, skipping", { file: f });
        return null;
      }
    })
    .filter((c): c is Campaign => c !== null);
}

function readBlueprints(workspaceId?: string): Blueprint[] {
  const dir = campaignsDir(workspaceId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith("blueprint-") && f.endsWith(".json"))
    .map((f) => {
      try {
        return BlueprintSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")));
      } catch {
        return null;
      }
    })
    .filter((b): b is Blueprint => b !== null);
}

export function createCampaign(campaign: Campaign, workspaceId?: string): void {
  const file = campaignFilePath(campaign.id, workspaceId);
  fs.writeFileSync(file, JSON.stringify(CampaignSchema.parse(campaign), null, 2));
}

export function loadCampaign(campaignId: string, workspaceId?: string): Campaign | null {
  const file = campaignFilePath(campaignId, workspaceId);
  if (!fs.existsSync(file)) return null;
  try {
    return CampaignSchema.parse(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {
    logWarn("Corrupted campaign file, returning null", { campaignId });
    return null;
  }
}

export function listCampaigns(status?: CampaignStatus, workspaceId?: string): Campaign[] {
  const all = readCampaigns(workspaceId);
  return status ? all.filter((c) => c.status === status) : all;
}

export function updateCampaign(campaignId: string, patch: Partial<Campaign>, workspaceId?: string): void {
  const existing = loadCampaign(campaignId, workspaceId);
  if (!existing) throw new NotFoundError(`Campaign "${campaignId}" not found.`, { campaignId });
  const updated = CampaignSchema.parse({
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  createCampaign(updated, workspaceId);
}

export function deleteCampaign(campaignId: string, workspaceId?: string): void {
  const file = campaignFilePath(campaignId, workspaceId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function saveBlueprint(blueprint: Blueprint, workspaceId?: string): void {
  const file = blueprintFilePath(blueprint.id, workspaceId);
  fs.writeFileSync(file, JSON.stringify(BlueprintSchema.parse(blueprint), null, 2));
}

export function loadBlueprint(blueprintId: string, workspaceId?: string): Blueprint | null {
  const file = blueprintFilePath(blueprintId, workspaceId);
  if (!fs.existsSync(file)) return null;
  try {
    return BlueprintSchema.parse(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {
    logWarn("Corrupted blueprint file, returning null", { blueprintId });
    return null;
  }
}

export function listBlueprints(workspaceId?: string): Blueprint[] {
  return readBlueprints(workspaceId);
}

export function deleteBlueprint(blueprintId: string, workspaceId?: string): void {
  const file = blueprintFilePath(blueprintId, workspaceId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
