import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DEFAULT_DATA_DIR = path.join(os.homedir(), ".quillby");

export const CONFIG = {
  get DATA_DIR() {
    return process.env.QUILLBY_HOME?.trim() || DEFAULT_DATA_DIR;
  },
  FILES: {
    get CONTEXT() {
      return path.join(CONFIG.DATA_DIR, "context.json");
    },
    get MEMORY() {
      return path.join(CONFIG.DATA_DIR, "memory.json");
    },
    get SOURCES() {
      return path.join(CONFIG.DATA_DIR, "rss_sources.txt");
    },
    get OUTPUT_DIR() {
      return path.join(CONFIG.DATA_DIR, "output");
    },
    get CACHE() {
      return path.join(CONFIG.DATA_DIR, ".cache/seen_urls.json");
    },
    get WORKSPACES_DIR() {
      return path.join(CONFIG.DATA_DIR, "workspaces");
    },
    get CURRENT_WORKSPACE() {
      return path.join(CONFIG.DATA_DIR, "current_workspace.txt");
    },
  },
  RSS: {
    ITEMS_PER_FEED: parseInt(process.env.RSS_ITEMS_PER_FEED || "5", 10),
    TIMEOUT: 12000,
    CONCURRENCY: 8,
  },
  ENRICHMENT: {
    ENABLED: true,
    MAX_CONTENT_LENGTH: 6000,
    TIMEOUT: 10000,
    RETRIES: 2,
  },
};

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function ensureDataDir() {
  ensureDir(CONFIG.DATA_DIR);
  ensureDir(CONFIG.FILES.WORKSPACES_DIR);
}

export function readTextFile(filePath: string): string {
  const ext = path.extname(filePath);
  const localVariant = ext
    ? `${filePath.slice(0, -ext.length)}.local${ext}`
    : `${filePath}.local`;

  for (const candidate of [localVariant, filePath]) {
    const resolved = path.isAbsolute(candidate)
      ? candidate
      : path.join(process.cwd(), candidate);
    if (fs.existsSync(resolved)) return fs.readFileSync(resolved, "utf-8");
  }

  throw new Error(`Cannot read config file: ${filePath}`);
}
