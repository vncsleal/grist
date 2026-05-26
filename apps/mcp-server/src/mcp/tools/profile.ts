import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { validateUrl, ElevenLabsAdapter } from "@quillby/providers";
import { UserContextSchema } from "../../types.js";
import { resolveElevenLabsApiKey } from "../../provider-config.js";
import { SetCloneIdentityArgsSchema, CloneVoiceArgsSchema } from "../schemas.js";
import type { ToolContext } from "./index.js";

export const toolDefinitions: Tool[] = [
  {
    name: "list_workspaces",
    description: "List Quillby workspaces. Use one workspace per Claude Project, client, publication, or campaign.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_workspace",
    description: "Create a workspace with isolated context, memories, feeds, and outputs.",
    annotations: { destructiveHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        workspaceId: { type: "string" },
        description: { type: "string" },
        makeCurrent: { type: "boolean" },
      },
      required: ["name"],
    },
  },
  {
    name: "select_workspace",
    description: "Switch the active Quillby workspace.",
    annotations: { destructiveHint: false, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: { workspaceId: { type: "string" } },
      required: ["workspaceId"],
    },
  },
  {
    name: "get_workspace",
    description: "Inspect the active workspace or a specific workspace.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: { workspaceId: { type: "string" } },
    },
  },
  {
    name: "set_clone_identity",
    description: "Set workspace-level identity clone references (face image URL and voice audio URL) and explicit consent flag. Clone generation will be blocked unless consent is granted.",
    annotations: { destructiveHint: false, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional workspace override without changing global selection." },
        faceReferenceImageUrl: { type: "string", description: "Publicly reachable image URL of the consenting user's face reference." },
        voiceReferenceAudioUrl: { type: "string", description: "Publicly reachable audio URL of the consenting user's voice sample." },
        cloneConsentGranted: { type: "boolean", description: "Must be true before identity clone generation is allowed." },
      },
      required: ["cloneConsentGranted"],
    },
  },
  {
    name: "clone_voice",
    description: "Create a persistent ElevenLabs voice clone from the workspace voice reference audio URL. Uploads the audio to ElevenLabs once and stores the returned voiceId in workspace metadata for all subsequent audio generation calls. Requires clone consent to be granted and an ElevenLabs provider to be configured. Idempotent — if a cloned voice ID is already saved, returns it without re-cloning unless overwrite is true.",
    annotations: { destructiveHint: false, idempotentHint: false },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional workspace override without changing global selection." },
        name: { type: "string", description: "Display name for the cloned voice in ElevenLabs. Defaults to the workspace name." },
        overwrite: { type: "boolean", description: "If true, delete the existing cloned voice and create a fresh one. Defaults to false." },
      },
    },
  },
  {
    name: "delete_voice_clone",
    description: "Delete the persistent ElevenLabs voice clone associated with this workspace. Removes the voice from ElevenLabs and clears the stored voiceId. Consent and reference URL are preserved so you can re-clone later.",
    annotations: { destructiveHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: { workspaceId: { type: "string", description: "Optional workspace override without changing global selection." } },
    },
  },
  {
    name: "set_context",
    description: "Save the user content creator profile after onboarding.",
    annotations: { destructiveHint: false, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string", description: "Optional workspace override without changing global selection." },
        context: {
          type: "object",
          properties: {
            name: { type: "string" },
            role: { type: "string" },
            industry: { type: "string" },
            topics: { type: "array", items: { type: "string" } },
            voice: { type: "string" },
            audienceDescription: { type: "string" },
            contentGoals: { type: "array", items: { type: "string" } },
            excludeTopics: { type: "array", items: { type: "string" } },
            platforms: { type: "array", items: { type: "string" } },
          },
          required: ["role", "industry", "topics", "voice", "audienceDescription", "contentGoals", "platforms"],
        },
      },
      required: ["context"],
    },
  },
  {
    name: "get_context",
    description: "Load the saved user profile.",
    annotations: { readOnlyHint: true, idempotentHint: true },
    outputSchema: { type: "object" as const },
    inputSchema: {
      type: "object",
      properties: { workspaceId: { type: "string", description: "Optional workspace override without changing global selection." } },
    },
  },
];

export function handleProfileTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}> {
  const { storage } = ctx;

  const resolveStorage = async () => {
    const workspaceId = typeof args.workspaceId === "string" ? args.workspaceId : undefined;
    if (!workspaceId) return storage;
    return storage.withWorkspace(workspaceId);
  };

  switch (name) {
    case "list_workspaces": {
      return (async () => {
        const currentWorkspaceId = await storage.getCurrentWorkspaceId();
        const workspaces = (await storage.listWorkspaces()).map((workspace) => ({
          ...workspace,
          current: workspace.id === currentWorkspaceId,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ currentWorkspaceId, workspaces }, null, 2) }],
          structuredContent: { currentWorkspaceId, workspaces },
        };
      })();
    }

    case "create_workspace": {
      return (async () => {
        const { name: workspaceName, workspaceId, description, makeCurrent } = args as {
          name: string;
          workspaceId?: string;
          description?: string;
          makeCurrent?: boolean;
        };
        const workspace = await storage.createWorkspace({
          id: workspaceId,
          name: workspaceName,
          description,
          makeCurrent: makeCurrent ?? true,
        });
        return {
          content: [{ type: "text" as const, text: `Workspace "${workspace.name}" created with id "${workspace.id}".` }],
          structuredContent: workspace,
        };
      })();
    }

    case "select_workspace": {
      return (async () => {
        const { workspaceId } = args as { workspaceId: string };
        const workspace = await storage.setCurrentWorkspace(workspaceId);
        return {
          content: [{ type: "text" as const, text: `Current workspace set to "${workspace.name}" (${workspace.id}).` }],
          structuredContent: workspace,
        };
      })();
    }

    case "get_workspace": {
      return (async () => {
        const activeStorage = await resolveStorage();
        const workspace = await activeStorage.getCurrentWorkspace();
        const [ctxData, mem, sources] = await Promise.all([
          activeStorage.loadContext(),
          activeStorage.loadTypedMemory(),
          activeStorage.loadSources(),
        ]);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ workspace, current: true, context: ctxData, memory: mem, feedCount: sources.length }, null, 2),
          }],
          structuredContent: { workspace, current: true, context: ctxData, memory: mem, feedCount: sources.length },
        };
      })();
    }

    case "set_clone_identity": {
      return (async () => {
        const activeStorage = await resolveStorage();
        const parsedIc = SetCloneIdentityArgsSchema.parse(args);
        const { faceReferenceImageUrl, voiceReferenceAudioUrl, cloneConsentGranted } = parsedIc;

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
          content: [{ type: "text" as const, text: JSON.stringify({
            workspaceId: workspace.id,
            cloneConsentGranted: workspace.cloneConsentGranted,
            faceReferenceImageUrl: workspace.faceReferenceImageUrl,
            voiceReferenceAudioUrl: workspace.voiceReferenceAudioUrl,
            cloneConsentAt: workspace.cloneConsentAt,
          }, null, 2) }],
          structuredContent: {
            workspaceId: workspace.id,
            cloneConsentGranted: workspace.cloneConsentGranted,
            faceReferenceImageUrl: workspace.faceReferenceImageUrl,
            voiceReferenceAudioUrl: workspace.voiceReferenceAudioUrl,
            cloneConsentAt: workspace.cloneConsentAt,
          },
        };
      })();
    }

    case "clone_voice": {
      return (async () => {
        const activeStorage = await resolveStorage();
        const parsedCv = CloneVoiceArgsSchema.parse(args);
        const { name: voiceName, overwrite } = parsedCv;
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
            content: [{ type: "text" as const, text: JSON.stringify({
              workspaceId: workspace.id,
              elevenlabsClonedVoiceId: workspace.elevenlabsClonedVoiceId,
              status: "already_cloned",
            }, null, 2) }],
            structuredContent: {
              workspaceId: workspace.id,
              elevenlabsClonedVoiceId: workspace.elevenlabsClonedVoiceId,
              status: "already_cloned",
            },
          };
        }

        if (workspace.elevenlabsClonedVoiceId && overwrite) {
          await ElevenLabsAdapter.deleteVoiceClone(elevenLabsApiKey, workspace.elevenlabsClonedVoiceId)
            .catch(() => process.stderr.write("[quillby] Non-fatal: could not delete old ElevenLabs voice clone\n"));
        }

        const cloneName = voiceName?.trim() || workspace.name || "Quillby Voice Clone";
        const clonedVoiceId = await ElevenLabsAdapter.createVoiceClone(elevenLabsApiKey, workspace.voiceReferenceAudioUrl, cloneName);
        const updated = await activeStorage.updateWorkspaceMetadata({ elevenlabsClonedVoiceId: clonedVoiceId });

        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            workspaceId: updated.id,
            elevenlabsClonedVoiceId: updated.elevenlabsClonedVoiceId,
            status: "cloned",
          }, null, 2) }],
          structuredContent: {
            workspaceId: updated.id,
            elevenlabsClonedVoiceId: updated.elevenlabsClonedVoiceId,
            status: "cloned",
          },
        };
      })();
    }

    case "delete_voice_clone": {
      return (async () => {
        const activeStorage = await resolveStorage();
        const workspace = await activeStorage.getCurrentWorkspace() as Record<string, unknown> & {
          elevenlabsClonedVoiceId?: string;
          id?: string;
        };

        if (!workspace.elevenlabsClonedVoiceId) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ workspaceId: workspace.id, status: "no_clone" }, null, 2) }],
            structuredContent: { workspaceId: workspace.id, status: "no_clone" },
          };
        }

        const elevenLabsApiKey = resolveElevenLabsApiKey(ctx.deploymentMode);
        if (elevenLabsApiKey) {
          await ElevenLabsAdapter.deleteVoiceClone(elevenLabsApiKey, workspace.elevenlabsClonedVoiceId)
            .catch(() => process.stderr.write("[quillby] Non-fatal: ElevenLabs deleteVoiceClone failed in delete handler\n"));
        }

        await activeStorage.updateWorkspaceMetadata({ elevenlabsClonedVoiceId: "" });

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ workspaceId: workspace.id, status: "deleted" }, null, 2) }],
          structuredContent: { workspaceId: workspace.id, status: "deleted" },
        };
      })();
    }

    case "set_context": {
      return (async () => {
        const activeStorage = await resolveStorage();
        const context = UserContextSchema.parse((args as { context: unknown }).context);
        await activeStorage.saveContext(context);
        const setCtxWs = await activeStorage.getCurrentWorkspace();
        return {
          content: [{ type: "text" as const, text: `Context saved for workspace "${setCtxWs.name}". Role: ${context.role}. Topics: ${context.topics.join(", ")}. Platforms: ${context.platforms.join(", ")}.` }],
          structuredContent: { saved: true, workspaceId: setCtxWs.id, role: context.role, topics: context.topics, platforms: context.platforms },
        };
      })();
    }

    case "get_context": {
      return (async () => {
        const activeStorage = await resolveStorage();
        if (!await activeStorage.contextExists()) {
          return { content: [{ type: "text" as const, text: "No context saved for this workspace yet. Start by setting up Quillby for it." }], structuredContent: { error: "no_context" } };
        }
        const ctxData = (await activeStorage.loadContext()) as Record<string, unknown>;
        const getCtxWs = await activeStorage.getCurrentWorkspace();
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ workspace: getCtxWs, context: ctxData }, null, 2) }],
          structuredContent: { workspace: getCtxWs, context: ctxData },
        };
      })();
    }

    default:
      return Promise.reject(new Error(`Unknown tool: ${name}`));
  }
}
