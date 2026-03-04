import * as fs from "fs";
import * as path from "path";
import type { Provider } from "./llm";

// Detailed token usage breakdown supporting all provider response shapes
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  // OpenAI/OpenRouter/Groq cached tokens
  cachedTokens?: number;
  // OpenAI reasoning tokens (o1, o3, o4)
  reasoningTokens?: number;
  // Audio tokens (input/output)
  audioInputTokens?: number;
  audioOutputTokens?: number;
  // Anthropic cache fields
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  // Gemini thinking tokens
  thinkingTokens?: number;
}

export interface UsageRecord {
  stage: string;
  provider: Provider;
  model: string;
  requestId?: string;
  tokens: TokenUsage;
  // Actual billed cost (when provider returns it)
  billedCost?: number;
  // Estimated cost (computed from pricing table)
  estimatedCost: number;
  // Confidence level
  confidence: "actual" | "estimated" | "unknown";
  timestamp: number;
}

interface CostLog {
  entries: UsageRecord[];
  totalEstimatedCost: number;
  totalBilledCost?: number;
  timestamp: string;
}

let usageRecords: UsageRecord[] = [];
export const EMBEDDING_INPUT_COST_PER_TOKEN = 0.00000002;

// Pricing per 1M tokens (input, output)
const MODEL_PRICING: Record<string, { input: number; output: number; cached?: number; reasoning?: number }> = {
  // OpenAI
  "gpt-5.2": { input: 0.0003, output: 0.0012, cached: 0.00015 },
  "gpt-5-mini": { input: 0.00003, output: 0.00012, cached: 0.000015 },
  "gpt-4-turbo": { input: 0.00001, output: 0.00003, cached: 0.000005 },
  "gpt-4o": { input: 0.0000025, output: 0.00001, cached: 0.00000125 },
  "gpt-4o-mini": { input: 0.00000015, output: 0.0000006, cached: 0.000000075 },
  "o3": { input: 0.002, output: 0.008, reasoning: 0.008 },
  "text-embedding-3-small": { input: EMBEDDING_INPUT_COST_PER_TOKEN, output: 0 },
  "text-embedding-3-large": { input: 0.00000013, output: 0 },
  // Anthropic Claude
  "claude-sonnet-4-5": { input: 0.000003, output: 0.000015, cached: 0.0000003 },
  "claude-opus-4": { input: 0.000015, output: 0.000075, cached: 0.0000015 },
  "claude-haiku-3-5": { input: 0.0000008, output: 0.000004, cached: 0.00000008 },
  // Groq (free tier, but track tokens)
  "llama-3.3-70b-versatile": { input: 0, output: 0 },
  "llama-3.1-8b-instant": { input: 0, output: 0 },
  // Gemini
  "gemini-2.0-flash": { input: 0, output: 0 }, // Free tier
  "gemini-2.5-pro": { input: 0.00000125, output: 0.000005 },
  // Together AI
  "meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo": { input: 0.0000006, output: 0.0000006 },
  "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo": { input: 0.0000002, output: 0.0000002 },
};

/**
 * Record usage from API response with provider-specific fields.
 * Computes estimated cost and uses billed cost when available (OpenRouter).
 */
export function recordUsage(
  stage: string,
  provider: Provider,
  model: string,
  tokens: TokenUsage,
  options?: {
    requestId?: string;
    billedCost?: number;
  }
) {
  const pricing = MODEL_PRICING[model];
  let estimatedCost = 0;
  let confidence: "actual" | "estimated" | "unknown" = "unknown";

  // If provider returns actual billed cost, use it
  if (options?.billedCost !== undefined) {
    estimatedCost = options.billedCost;
    confidence = "actual";
  } else if (pricing) {
    // Compute estimated cost from pricing table
    const inputCost = tokens.promptTokens * pricing.input;
    const outputCost = tokens.completionTokens * pricing.output;
    const cachedCost = (tokens.cachedTokens || 0) * (pricing.cached || pricing.input * 0.5);
    const reasoningCost = (tokens.reasoningTokens || 0) * (pricing.reasoning || pricing.output);
    estimatedCost = inputCost + outputCost + cachedCost + reasoningCost;
    confidence = "estimated";
  } else {
    console.warn(`⚠️  Unknown model pricing: ${model} (provider: ${provider})`);
    confidence = "unknown";
  }

  usageRecords.push({
    stage: stage || "unknown",
    provider,
    model,
    requestId: options?.requestId,
    tokens,
    billedCost: options?.billedCost,
    estimatedCost,
    confidence,
    timestamp: Date.now(),
  });
}

/**
 * Record embedding cost (preserving backward compatibility).
 */
export function recordEmbeddingCost(cost: number, tokens?: number) {
  usageRecords.push({
    stage: "cache",
    provider: "openai",
    model: "text-embedding-3-small",
    tokens: {
      promptTokens: tokens || 0,
      completionTokens: 0,
      totalTokens: tokens || 0,
    },
    estimatedCost: cost,
    confidence: tokens ? "estimated" : "unknown",
    timestamp: Date.now(),
  });
}

export function getCostStats(): {
  totalEstimated: number;
  totalBilled?: number;
  byStage: Record<string, number>;
  byModel: Record<string, number>;
  byProvider: Record<string, number>;
  byConfidence: Record<string, number>;
  entries: UsageRecord[];
  tokenStats: {
    totalPrompt: number;
    totalCompletion: number;
    totalCached: number;
    totalReasoning: number;
  };
} {
  const totalEstimated = usageRecords.reduce((sum, e) => sum + e.estimatedCost, 0);
  const billedRecords = usageRecords.filter((e) => e.billedCost !== undefined);
  const totalBilled = billedRecords.length > 0
    ? billedRecords.reduce((sum, e) => sum + (e.billedCost || 0), 0)
    : undefined;

  const byStage = usageRecords.reduce(
    (acc, e) => {
      acc[e.stage] = (acc[e.stage] || 0) + e.estimatedCost;
      return acc;
    },
    {} as Record<string, number>
  );

  const byModel = usageRecords.reduce(
    (acc, e) => {
      acc[e.model] = (acc[e.model] || 0) + e.estimatedCost;
      return acc;
    },
    {} as Record<string, number>
  );

  const byProvider = usageRecords.reduce(
    (acc, e) => {
      acc[e.provider] = (acc[e.provider] || 0) + e.estimatedCost;
      return acc;
    },
    {} as Record<string, number>
  );

  const byConfidence = usageRecords.reduce(
    (acc, e) => {
      acc[e.confidence] = (acc[e.confidence] || 0) + e.estimatedCost;
      return acc;
    },
    {} as Record<string, number>
  );

  const tokenStats = usageRecords.reduce(
    (acc, e) => ({
      totalPrompt: acc.totalPrompt + e.tokens.promptTokens,
      totalCompletion: acc.totalCompletion + e.tokens.completionTokens,
      totalCached: acc.totalCached + (e.tokens.cachedTokens || 0),
      totalReasoning: acc.totalReasoning + (e.tokens.reasoningTokens || 0),
    }),
    { totalPrompt: 0, totalCompletion: 0, totalCached: 0, totalReasoning: 0 }
  );

  return {
    totalEstimated,
    totalBilled,
    byStage,
    byModel,
    byProvider,
    byConfidence,
    entries: usageRecords,
    tokenStats,
  };
}

export function logCostsToFile(date: string) {
  const stats = getCostStats();

  const costLog: CostLog = {
    entries: stats.entries,
    totalEstimatedCost: stats.totalEstimated,
    totalBilledCost: stats.totalBilled,
    timestamp: new Date().toISOString(),
  };

  const costDir = path.join(process.cwd(), "costs");
  if (!fs.existsSync(costDir)) {
    fs.mkdirSync(costDir, { recursive: true });
  }

  const filename = `costs_${date.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}.json`;
  const filepath = path.join(costDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(costLog, null, 2));

  return {
    path: filepath,
    totalEstimated: stats.totalEstimated,
    totalBilled: stats.totalBilled,
    byStage: stats.byStage,
    byProvider: stats.byProvider,
    tokenStats: stats.tokenStats,
  };
}

export function resetCosts() {
  usageRecords = [];
}

/**
 * Legacy compatibility: recordCost maps to recordUsage.
 * @deprecated Use recordUsage instead.
 */
export function recordCost(
  stage: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  customCost?: number
) {
  recordUsage(
    stage,
    "openai", // Assume OpenAI for legacy calls
    model,
    {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
    customCost !== undefined ? { billedCost: customCost } : undefined
  );
}
