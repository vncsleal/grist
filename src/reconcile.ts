import OpenAI from "openai";
import fs from "fs";
import path from "path";

interface ReconciliationEntry {
  requestId: string;
  actualCost: number;
}

/**
 * Attempt to reconcile OpenAI costs with actual billing data.
 * This runs silently after harvest - failures are logged but don't break the pipeline.
 * Only updates the cost log if successful and billable requests are found.
 */
export async function reconcileOpenAICostsIfAvailable(costLogPath: string): Promise<number> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // No API key - skip silently
    return 0;
  }

  try {
    // Load the cost log
    const costLogContent = fs.readFileSync(costLogPath, "utf-8");
    const costLog = JSON.parse(costLogContent);
    const openaiEntries = costLog.entries.filter(
      (e: any) => e.provider === "openai" && e.requestId
    );

    if (openaiEntries.length === 0) {
      // No OpenAI requests - nothing to reconcile
      return 0;
    }

    // Get date range for API query
    const timestamps = openaiEntries.map((e: any) => e.timestamp);
    const startDate = new Date(Math.min(...timestamps));
    const endDate = new Date(Math.max(...timestamps));
    
    // Format dates for API (YYYY-MM-DD)
    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = new Date(endDate.getTime() + 86400000).toISOString().split("T")[0]; // +1 day

    // Query OpenAI billing API
    const response = await fetch(
      `https://api.openai.com/v1/usage/completions?start_date=${startDateStr}&end_date=${endDateStr}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      // API access error - likely insufficient permissions
      // Silently continue with estimated costs
      return 0;
    }

    const data = (await response.json()) as any;
    const usageData = data.data || [];

    // Build map of request ID to actual cost
    const actualCostMap = new Map<string, number>();
    for (const record of usageData) {
      if (record.request_id && record.cost_in_dollars !== undefined) {
        actualCostMap.set(record.request_id, record.cost_in_dollars);
      }
    }

    if (actualCostMap.size === 0) {
      // No matching cost data found
      return 0;
    }

    // Update cost log entries with actual costs
    let updatedCount = 0;
    for (const entry of costLog.entries) {
      if (entry.provider === "openai" && entry.requestId && actualCostMap.has(entry.requestId)) {
        entry.billedCost = actualCostMap.get(entry.requestId);
        entry.confidence = "actual";
        updatedCount++;
      }
    }

    // Write updated cost log back
    fs.writeFileSync(costLogPath, JSON.stringify(costLog, null, 2));

    return updatedCount;
  } catch (error) {
    // Any error during reconciliation - fail silently and continue
    // Users can investigate if needed
    return 0;
  }
}
