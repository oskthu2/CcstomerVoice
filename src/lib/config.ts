import fs from "node:fs";
import path from "node:path";
import type { Product, SeedVoice } from "./types";

const root = process.cwd();
export const CONFIG_DIR = process.env.CONFIG_DIR || path.join(root, "config");
export const DATA_DIR = process.env.DATA_DIR || path.join(root, "data");
export const SEED_FILE = path.join(root, "data", "seed", "dagens-medicin-2026.json");

export type Provider = "anthropic" | "openai" | "demo";

const env = (k: string) => process.env[k]?.trim() || "";

/**
 * Provider choice: AI_PROVIDER if set, otherwise whichever key is present
 * (ANTHROPIC_API_KEY wins if both are), otherwise demo mode (keyword matcher).
 */
function pickProvider(): Provider {
  const forced = env("AI_PROVIDER").toLowerCase();
  if (forced === "anthropic" || forced === "openai" || forced === "demo") return forced;
  if (env("ANTHROPIC_API_KEY")) return "anthropic";
  if (env("OPENAI_API_KEY") || env("OPENAI_BASE_URL")) return "openai";
  return "demo";
}

const provider = pickProvider();

export const ai = {
  provider,
  anthropic: {
    apiKey: env("ANTHROPIC_API_KEY"),
    model: env("ANTHROPIC_MODEL") || "claude-opus-5-5",
    effort: (env("ANTHROPIC_EFFORT") || "low") as "low" | "medium" | "high" | "xhigh" | "max",
  },
  openai: {
    apiKey: env("OPENAI_API_KEY"),
    baseURL: env("OPENAI_BASE_URL") || undefined,
    model: env("OPENAI_MODEL") || "gpt-4.1-mini",
    temperature: env("OPENAI_TEMPERATURE") ? Number(env("OPENAI_TEMPERATURE")) : undefined,
  },
  get model() {
    return provider === "anthropic" ? this.anthropic.model : provider === "openai" ? this.openai.model : null;
  },
};

export const demoMode = provider === "demo";

export const adminToken = process.env.ADMIN_TOKEN?.trim() || "";
export const publicInputUrl = process.env.PUBLIC_INPUT_URL?.trim() || "";
export const seedOnStart = process.env.SEED_ON_START === "true";

export function loadProducts(): Product[] {
  const file = path.join(CONFIG_DIR, "inera-products.json");
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  return json.products as Product[];
}

let seedCache: { source: string; statements: SeedVoice[] } | null = null;
export function loadSeed() {
  if (!seedCache) seedCache = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
  return seedCache!;
}
