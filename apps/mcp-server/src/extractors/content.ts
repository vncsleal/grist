import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { safeFetch } from "@quillby/providers";
import { CONFIG } from "../config.js";

/**
 * Fetch HTML from a URL with redirect and SSRF protection.
 * Uses safeFetch from @quillby/providers which validates URLs against
 * private IP ranges and handles redirects.
 */
async function fetchURL(url: string): Promise<string> {
  try {
    const response = await safeFetch(url, {
      timeout: CONFIG.ENRICHMENT.TIMEOUT,
    });
    return await response.text();
  } catch {
    return "";
  }
}

/**
 * Extract readable text from HTML using Mozilla Readability.
 * Falls back to basic tag stripping if Readability cannot parse the page.
 */
export function extractTextFromHTML(html: string, url: string): string {
  try {
    const { document } = parseHTML(html);
    type ReadabilityDoc = ConstructorParameters<typeof Readability>[0];
    // Pass the URL so Readability can resolve relative links
    const article = new Readability(document as unknown as ReadabilityDoc, {
      url,
    }).parse();
    if (article?.textContent) {
      return article.textContent.replace(/\s+/g, " ").trim().slice(0, CONFIG.ENRICHMENT.MAX_CONTENT_LENGTH);
    }
  } catch {
    // fall through to basic extraction
  }

  // Fallback: strip all tags
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CONFIG.ENRICHMENT.MAX_CONTENT_LENGTH);
}

/**
 * Fetch and extract key content from a URL
 */
export async function enrichArticle(url: string, _title: string): Promise<string> {
  if (!CONFIG.ENRICHMENT.ENABLED) return "";

  for (let attempt = 0; attempt < CONFIG.ENRICHMENT.RETRIES; attempt++) {
    try {
      const html = await fetchURL(url);
      if (!html) continue;

      const text = extractTextFromHTML(html, url);
      if (text.length > 200) return text;
    } catch {
      // continue to next attempt
    }
  }

  return "";
}
