import { z } from "zod";
import type { ToolContext, ToolResult } from "./index.js";
import { UserContextSchema } from "../../types.js";
import { SetCloneIdentityArgsSchema, CloneVoiceArgsSchema } from "../schemas.js";
import { validateUrl, ElevenLabsAdapter } from "@quillby/providers";
import { resolveElevenLabsApiKey } from "../../provider-config.js";
import { logWarn } from "../../logger.js";

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({
    action: z.literal("create"),
    name: z.string(),
    workspaceId: z.string().optional(),
    description: z.string().optional(),
    makeCurrent: z.boolean().optional(),
  }),
  z.object({ action: z.literal("select"), workspaceId: z.string() }),
  z.object({ action: z.literal("get"), workspaceId: z.string().optional() }),
  z.object({ action: z.literal("set_profile"), workspaceId: z.string().optional(), context: z.unknown() }),
  z.object({ action: z.literal("get_profile"), workspaceId: z.string().optional() }),
  z.object({
    action: z.literal("setup_identity"),
    ...SetCloneIdentityArgsSchema.shape,
  }),
  z.object({
    action: z.literal("clone_voice"),
    ...CloneVoiceArgsSchema.shape,
  }),
  z.object({ action: z.literal("delete_clone"), workspaceId: z.string().optional() }),
]);

export const tool = {
  name: "workspace" as const,
  description: "Manage Quillby workspaces — list, create, select, inspect, update profile and identity clone settings.",
  inputSchema: Schema,
};

async function resolveStorage(parsed: z.infer<typeof Schema>, storage: ToolContext["storage"]): Promise<ToolContext["storage"]> {
  const workspaceId = "workspaceId" in parsed && typeof parsed.workspaceId === "string"
    ? parsed.workspaceId
    : undefined;
  if (!workspaceId) return storage;
  return storage.withWorkspace(workspaceId);
}

export async function handleTool(raw: unknown, ctx: ToolContext): Promise<ToolResult> {
  const parsed = Schema.parse(raw);
  const { storage } = ctx;

  switch (parsed.action) {
    case "list": {
      const currentWorkspaceId = await storage.getCurrentWorkspaceId();
      const workspaces = (await storage.listWorkspaces()).map((workspace) => ({
        ...workspace,
        current: workspace.id === currentWorkspaceId,
      }));
      return {
        content: [{ type: "text" as const, text: `Current workspace: ${currentWorkspaceId}. Available: ${workspaces.map(w => `${w.name}${w.current ? " (current)" : ""}`).join(", ")}.` }],
        structuredContent: { currentWorkspaceId, workspaces },
      };
    }

    case "create": {
      const workspace = await storage.createWorkspace({
        id: parsed.workspaceId,
        name: parsed.name,
        description: parsed.description,
        makeCurrent: parsed.makeCurrent ?? true,
      });
      return {
        content: [{ type: "text" as const, text: `Workspace "${workspace.name}" created with id "${workspace.id}".` }],
        structuredContent: workspace,
      };
    }

    case "select": {
      const workspace = await storage.setCurrentWorkspace(parsed.workspaceId);
      return {
        content: [{ type: "text" as const, text: `Current workspace set to "${workspace.name}" (${workspace.id}).` }],
        structuredContent: workspace,
      };
    }

    case "get": {
      const activeStorage = await resolveStorage(parsed, storage);
      const workspace = await activeStorage.getCurrentWorkspace();
      const [ctxData, mem, sources] = await Promise.all([
        activeStorage.loadContext(),
        activeStorage.loadTypedMemory(),
        activeStorage.loadSources(),
      ]);
      return {
        content: [{ type: "text" as const, text: `Workspace: ${workspace.name} (${workspace.id}). Feeds: ${sources.length}. Memory: ${mem ? `${Object.keys(mem).length} type(s)` : "none"}. Context role: ${(ctxData as Record<string, unknown>)?.role ?? "not set"}, topics: ${((ctxData as Record<string, unknown>)?.topics as string[] ?? []).join(", ")}.` }],
        structuredContent: { workspace, current: true, context: ctxData, memory: mem, feedCount: sources.length },
      };
    }

    case "set_profile": {
      const activeStorage = await resolveStorage(parsed, storage);
      const context = UserContextSchema.parse(parsed.context);
      await activeStorage.saveContext(context);
      const setCtxWs = await activeStorage.getCurrentWorkspace();
      return {
        content: [{ type: "text" as const, text: `Context saved for workspace "${setCtxWs.name}". Role: ${context.role}. Topics: ${context.topics.join(", ")}. Platforms: ${context.platforms.join(", ")}.` }],
        structuredContent: { saved: true, workspaceId: setCtxWs.id, role: context.role, topics: context.topics, platforms: context.platforms },
      };
    }

    case "get_profile": {
      const activeStorage = await resolveStorage(parsed, storage);
      if (!await activeStorage.contextExists()) {
        return { content: [{ type: "text" as const, text: "No context saved for this workspace yet. Start by setting up Quillby for it." }], structuredContent: { error: "no_context" } };
      }
      const ctxData = (await activeStorage.loadContext()) as Record<string, unknown>;
      const getCtxWs = await activeStorage.getCurrentWorkspace();
      return {
        content: [{ type: "text" as const, text: `Profile for workspace "${getCtxWs.name}": role=${(ctxData as Record<string, unknown>).role}, topics=${((ctxData as Record<string, unknown>).topics as string[]).join(", ")}, platforms=${((ctxData as Record<string, unknown>).platforms as string[]).join(", ")}.` }],
        structuredContent: { workspace: getCtxWs, context: ctxData },
      };
    }

    case "setup_identity": {
      const activeStorage = await resolveStorage(parsed, storage);
      const { faceReferenceImageUrl, voiceReferenceAudioUrl, cloneConsentGranted } = parsed;

      if (faceReferenceImageUrl !== undefined) {
        try {
          await validateUrl(faceReferenceImageUrl);
        } catch (err) {
          throw new Error(`faceReferenceImageUrl validation failed: ${err instanceof Error ? err.message : "invalid URL"}`);
        }
      }
      if (voiceReferenceAudioUrl !== undefined) {
        try {
          await validateUrl(voiceReferenceAudioUrl);
        } catch (err) {
          throw new Error(`voiceReferenceAudioUrl validation failed: ${err instanceof Error ? err.message : "invalid URL"}`);
        }
      }

      const workspace = await activeStorage.updateWorkspaceMetadata({
        ...(faceReferenceImageUrl !== undefined && { faceReferenceImageUrl }),
        ...(voiceReferenceAudioUrl !== undefined && { voiceReferenceAudioUrl }),
        cloneConsentGranted,
        cloneConsentAt: cloneConsentGranted ? new Date().toISOString() : undefined,
      });

      return {
        content: [{ type: "text" as const, text: `Identity saved for workspace ${workspace.id}. Clone consent: ${workspace.cloneConsentGranted ? "granted" : "not granted"}.${workspace.faceReferenceImageUrl ? ` Face ref: ${workspace.faceReferenceImageUrl}.` : ""}${workspace.voiceReferenceAudioUrl ? ` Voice ref: ${workspace.voiceReferenceAudioUrl}.` : ""}` }],
        structuredContent: {
          workspaceId: workspace.id,
          cloneConsentGranted: workspace.cloneConsentGranted,
          faceReferenceImageUrl: workspace.faceReferenceImageUrl,
          voiceReferenceAudioUrl: workspace.voiceReferenceAudioUrl,
          cloneConsentAt: workspace.cloneConsentAt,
        },
      };
    }

    case "clone_voice": {
      const activeStorage = await resolveStorage(parsed, storage);
      const { name: voiceName, overwrite } = parsed;
      const workspace = await activeStorage.getCurrentWorkspace() as Record<string, unknown> & {
        cloneConsentGranted?: boolean;
        voiceReferenceAudioUrl?: string;
        elevenlabsClonedVoiceId?: string;
        name?: string;
      };

      if (!workspace.cloneConsentGranted) {
        throw new Error("Clone consent must be granted before creating a voice clone. Call set_clone_identity first.");
      }
      if (!workspace.voiceReferenceAudioUrl) {
        throw new Error("No voiceReferenceAudioUrl set. Call set_clone_identity with a voice sample URL first.");
      }

      const elevenLabsApiKey = resolveElevenLabsApiKey(ctx.deploymentMode);
      if (!elevenLabsApiKey) {
        throw new Error("ElevenLabs is not configured. Set QUILLBY_ELEVENLABS_API_KEY or configure the audio provider via set_provider.");
      }

      if (workspace.elevenlabsClonedVoiceId && !overwrite) {
        return {
          content: [{ type: "text" as const, text: `Workspace ${workspace.id} already has a cloned voice (ID: ${workspace.elevenlabsClonedVoiceId}). Pass overwrite=true to re-clone.` }],
          structuredContent: {
            workspaceId: workspace.id,
            elevenlabsClonedVoiceId: workspace.elevenlabsClonedVoiceId,
            status: "already_cloned",
          },
        };
      }

      if (workspace.elevenlabsClonedVoiceId && overwrite) {
        await ElevenLabsAdapter.deleteVoiceClone(elevenLabsApiKey, workspace.elevenlabsClonedVoiceId)
          .catch(() => logWarn("could not delete old ElevenLabs voice clone"));
      }

      const cloneName = voiceName?.trim() || workspace.name || "Quillby Voice Clone";
      const clonedVoiceId = await ElevenLabsAdapter.createVoiceClone(elevenLabsApiKey, workspace.voiceReferenceAudioUrl, cloneName);
      const updated = await activeStorage.updateWorkspaceMetadata({ elevenlabsClonedVoiceId: clonedVoiceId });

      return {
        content: [{ type: "text" as const, text: `Voice cloned successfully for workspace ${updated.id}. Clone ID: ${updated.elevenlabsClonedVoiceId}.` }],
        structuredContent: {
          workspaceId: updated.id,
          elevenlabsClonedVoiceId: updated.elevenlabsClonedVoiceId,
          status: "cloned",
        },
      };
    }

    case "delete_clone": {
      const activeStorage = await resolveStorage(parsed, storage);
      const workspace = await activeStorage.getCurrentWorkspace() as Record<string, unknown> & {
        elevenlabsClonedVoiceId?: string;
        id?: string;
      };

      if (!workspace.elevenlabsClonedVoiceId) {
        return {
          content: [{ type: "text" as const, text: `Workspace ${workspace.id} has no voice clone to delete.` }],
          structuredContent: { workspaceId: workspace.id, status: "no_clone" },
        };
      }

      const elevenLabsApiKey = resolveElevenLabsApiKey(ctx.deploymentMode);
      if (elevenLabsApiKey) {
        await ElevenLabsAdapter.deleteVoiceClone(elevenLabsApiKey, workspace.elevenlabsClonedVoiceId)
          .catch(() => logWarn("ElevenLabs deleteVoiceClone failed in delete handler"));
      }

      await activeStorage.updateWorkspaceMetadata({ elevenlabsClonedVoiceId: "" });

      return {
        content: [{ type: "text" as const, text: `Voice clone deleted for workspace ${workspace.id}.` }],
        structuredContent: { workspaceId: workspace.id, status: "deleted" },
      };
    }
  }
}
