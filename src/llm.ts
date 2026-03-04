import OpenAI from "openai";
import { CONFIG } from "./config";
import { recordUsage, type TokenUsage } from "./costs";
import type { Tool, ToolCall } from "./types";

// ─── Provider detection ───────────────────────────────────────────────────────

export type Provider = "openai" | "anthropic" | "groq" | "gemini" | "openrouter" | "mistral" | "xai" | "together" | "azure";

interface ProviderConfig {
  name: Provider;
  apiKey: string;
  baseURL: string;
  defaultHeaders?: Record<string, string>;
  defaultQuery?: Record<string, string>;
  models: {
    fast: string;
    standard: string;
    advanced: string;
    reasoning: string;
  };
}

const PROVIDER_CONFIGS: Record<Provider, Omit<ProviderConfig, "apiKey">> = {
  openai: {
    name: "openai",
    baseURL: "https://api.openai.com/v1",
    models: {
      fast:      "gpt-5-mini",
      standard:  "gpt-5.2",
      advanced:  "gpt-5.2",
      reasoning: "o3",
    },
  },
  anthropic: {
    name: "anthropic",
    baseURL: "https://api.anthropic.com/v1",
    defaultHeaders: { "anthropic-version": "2023-06-01" },
    models: {
      fast:      "claude-haiku-3-5",
      standard:  "claude-sonnet-4-5",
      advanced:  "claude-sonnet-4-5",
      reasoning: "claude-opus-4",
    },
  },
  groq: {
    name: "groq",
    baseURL: "https://api.groq.com/openai/v1",
    models: {
      fast:      "llama-3.1-8b-instant",
      standard:  "llama-3.3-70b-versatile",
      advanced:  "llama-3.3-70b-versatile",
      reasoning: "llama-3.3-70b-versatile",
    },
  },
  gemini: {
    name: "gemini",
    baseURL: "https://generativelanguage.googleapis.com/openai/",
    models: {
      fast:      "gemini-2.0-flash",
      standard:  "gemini-2.0-flash",
      advanced:  "gemini-2.5-pro",
      reasoning: "gemini-2.5-pro",
    },
  },
  openrouter: {
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: { "HTTP-Referer": "https://github.com/vncsleal/grist" },
    models: {
      // OpenRouter users set their own models via LLM_MODEL_* env vars
      fast:      process.env.LLM_MODEL_FAST     || "google/gemini-2.0-flash-001",
      standard:  process.env.LLM_MODEL          || "google/gemini-2.0-flash-001",
      advanced:  process.env.LLM_MODEL_RESEARCH || "anthropic/claude-sonnet-4-5",
      reasoning: process.env.LLM_MODEL_REASONING || "anthropic/claude-opus-4",
    },
  },
  mistral: {
    name: "mistral",
    baseURL: "https://api.mistral.ai/v1",
    models: {
      fast:      "mistral-small-latest",
      standard:  "mistral-medium-latest",
      advanced:  "mistral-large-latest",
      reasoning: "mistral-large-latest",
    },
  },
  xai: {
    name: "xai",
    baseURL: "https://api.x.ai/v1",
    models: {
      fast:      "grok-3-mini",
      standard:  "grok-3",
      advanced:  "grok-3",
      reasoning: "grok-3",
    },
  },
  together: {
    name: "together",
    baseURL: "https://api.together.xyz/v1",
    models: {
      fast:      "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      standard:  "meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo",
      advanced:  "meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo",
      reasoning: "meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo",
    },
  },
  azure: {
    name: "azure",
    // Azure baseURL: set AZURE_OPENAI_ENDPOINT in .env (e.g. https://my-resource.openai.azure.com)
    baseURL: `${(process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, "")}/openai`,
    defaultHeaders: { "api-key": process.env.AZURE_OPENAI_API_KEY || "" },
    defaultQuery: { "api-version": process.env.AZURE_OPENAI_API_VERSION || "2025-01-01-preview" },
    models: {
      // Azure uses deployment names — override via LLM_MODEL_* env vars
      fast:      process.env.LLM_MODEL_FAST     || "gpt-4o-mini",
      standard:  process.env.LLM_MODEL          || "gpt-4o",
      advanced:  process.env.LLM_MODEL_RESEARCH || "gpt-4o",
      reasoning: process.env.LLM_MODEL_REASONING || "o3",
    },
  },
};

function detectProvider(): Provider {
  const explicit = (process.env.LLM_PROVIDER || "").toLowerCase() as Provider;
  if (explicit && PROVIDER_CONFIGS[explicit]) return explicit;

  // Auto-detect from key presence
  if (process.env.OPENAI_API_KEY)        return "openai";
  if (process.env.ANTHROPIC_API_KEY)     return "anthropic";
  if (process.env.GROQ_API_KEY)          return "groq";
  if (process.env.GOOGLE_API_KEY)        return "gemini";
  if (process.env.OPENROUTER_API_KEY)    return "openrouter";
  if (process.env.MISTRAL_API_KEY)       return "mistral";
  if (process.env.XAI_API_KEY)           return "xai";
  if (process.env.TOGETHER_API_KEY)      return "together";
  if (process.env.AZURE_OPENAI_API_KEY)  return "azure";

  return "openai"; // will fail at getClient() with a clear error
}

function getApiKey(provider: Provider): string {
  const keys: Record<Provider, string | undefined> = {
    openai:      process.env.OPENAI_API_KEY,
    anthropic:   process.env.ANTHROPIC_API_KEY,
    groq:        process.env.GROQ_API_KEY,
    gemini:      process.env.GOOGLE_API_KEY,
    openrouter:  process.env.OPENROUTER_API_KEY,
    mistral:     process.env.MISTRAL_API_KEY,
    xai:         process.env.XAI_API_KEY,
    together:    process.env.TOGETHER_API_KEY,
    azure:       process.env.AZURE_OPENAI_API_KEY,
  };
  return keys[provider] || "";
}

let client: OpenAI | null = null;
let activeProvider: Provider | null = null;

/** Returns true if any supported LLM key is configured */
export function hasLLMKey(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.MISTRAL_API_KEY ||
    process.env.XAI_API_KEY ||
    process.env.TOGETHER_API_KEY ||
    process.env.AZURE_OPENAI_API_KEY,
  );
}

/** @deprecated use hasLLMKey() */
export function hasOpenAIKey(): boolean {
  return hasLLMKey();
}

function getClient(): OpenAI {
  if (client) return client;

  const provider = detectProvider();
  const apiKey = getApiKey(provider);

  if (!apiKey) {
    throw new Error(
      `No API key found. Set one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY, GOOGLE_API_KEY, OPENROUTER_API_KEY, MISTRAL_API_KEY, XAI_API_KEY, TOGETHER_API_KEY, AZURE_OPENAI_API_KEY`,
    );
  }

  const cfg = PROVIDER_CONFIGS[provider];
  client = new OpenAI({
    apiKey,
    baseURL: cfg.baseURL,
    defaultHeaders: cfg.defaultHeaders,
    defaultQuery: (cfg as any).defaultQuery,
    timeout: CONFIG.LLM.REQUEST_TIMEOUT_MS,
  });
  activeProvider = provider;

  return client;
}

export function getActiveProvider(): Provider {
  return activeProvider ?? detectProvider();
}

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
  tool_call_id?: string;
}

export interface LLMCallOptions {
  systemPrompt: string;
  userMessage: string;
  tools?: Tool[];
  jsonMode?: boolean;
  temperature?: number;
  model?: string;
  stream?: boolean; // Enable streaming for long operations
  stage?: string; // For cost tracking
}

export interface LLMCallResult {
  content: string;
  toolCalls?: ToolCall[];
  finishReason: string;
}

let callStats = { total: 0, failed: 0 };

function modelSupportsTemperature(model: string): boolean {
  // OpenAI reasoning models don't support temperature
  const noTempModels = ["o1", "o3", "o4"];
  return !noTempModels.some((m) => model.toLowerCase().startsWith(m));
}

/** Providers that support OpenAI's response_format: json_object */
function providerSupportsJsonMode(provider: Provider): boolean {
  return provider === "openai" || provider === "groq" || provider === "openrouter";
}

/**
 * Select the appropriate model based on task complexity.
 * Uses provider-specific defaults unless overridden by LLM_MODEL_* env vars.
 */
export function selectModel(
  taskType: "fast" | "standard" | "advanced" | "reasoning" | "pro" = "standard"
): string {
  const provider = detectProvider();
  const providerModels = PROVIDER_CONFIGS[provider].models;

  switch (taskType) {
    case "fast":
      return process.env.LLM_MODEL_FAST      || providerModels.fast;
    case "advanced":
      return process.env.LLM_MODEL_RESEARCH  || providerModels.advanced;
    case "reasoning":
      return process.env.LLM_MODEL_REASONING || providerModels.reasoning;
    case "pro":
      return process.env.LLM_MODEL_PRO       || providerModels.advanced;
    case "standard":
    default:
      return process.env.LLM_MODEL           || providerModels.standard;
  }
}

/**
 * Call the configured LLM provider with optional tool definitions
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMCallResult> {
  const {
    systemPrompt,
    userMessage,
    tools,
    jsonMode = false,
    temperature = CONFIG.LLM.TEMPERATURE_ANALYTICAL,
    model = selectModel("standard"),
    stage = "unknown",
  } = options;

  const provider = getActiveProvider();
  const useJsonMode = jsonMode && providerSupportsJsonMode(provider);

  // For providers that don't support response_format, inject a JSON instruction
  const effectiveSystem = jsonMode && !useJsonMode
    ? `${systemPrompt}\n\nRespond with valid JSON only. No markdown, no explanation.`
    : systemPrompt;

  const messages: LLMMessage[] = [
    { role: "system", content: effectiveSystem },
    { role: "user", content: userMessage },
  ];

  const useTemperature = modelSupportsTemperature(model);
  const openai = getClient();

  for (let attempt = 1; attempt <= CONFIG.LLM.RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model,
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        temperature: useTemperature ? temperature : undefined,
        tools: tools ? tools.map((t) => ({ type: "function" as const, function: t.function })) : undefined,
        response_format: useJsonMode ? { type: "json_object" } : undefined,
      });

      callStats.total++;

      // Extract detailed usage from response
      const usage = response.usage;
      if (usage) {
        const tokens: TokenUsage = {
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          cachedTokens: usage.prompt_tokens_details?.cached_tokens,
          reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
          audioInputTokens: usage.prompt_tokens_details?.audio_tokens,
          audioOutputTokens: usage.completion_tokens_details?.audio_tokens,
        };

        // OpenRouter returns actual cost in some cases
        const billedCost = (usage as any).cost;

        recordUsage(stage, provider, model, tokens, {
          requestId: response.id,
          billedCost,
        });
      }

      const message = response.choices[0].message;

      const toolCalls = message.tool_calls
        ? message.tool_calls.map((tc: OpenAI.ChatCompletionMessageToolCall) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          }))
        : undefined;

      return {
        content: message.content || "",
        toolCalls,
        finishReason: response.choices[0].finish_reason || "stop",
      };
    } catch (error: any) {
      const status = Number(error?.status ?? error?.statusCode ?? 0);

      if (status >= 400 && status < 500 && status !== 429) {
        callStats.failed++;
        throw error;
      }

      if (error?.status === 429 && attempt < CONFIG.LLM.RETRY_ATTEMPTS) {
        // Silent rate limit retry
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (attempt === CONFIG.LLM.RETRY_ATTEMPTS) {
        callStats.failed++;
        throw error;
      }
      
      // Silent retry - wait a bit before next attempt
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error("LLM call failed after all retries");
}

/**
 * Parse JSON from LLM response (with fallback)
 */
export function parseJSON<T>(text: string): T {
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown code blocks
    const match = text.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (match) {
      return JSON.parse(match[1]);
    }

    // Try to find JSON object
    const objStart = text.indexOf("{");
    const objEnd = text.lastIndexOf("}");
    if (objStart !== -1 && objEnd > objStart) {
      return JSON.parse(text.substring(objStart, objEnd + 1));
    }

    throw new Error("Could not parse JSON from response");
  }
}

/**
 * Get statistics about LLM calls
 */
export function getCallStats() {
  return callStats;
}
