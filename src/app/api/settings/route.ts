import { NextResponse } from "next/server";
import { analyzeSystemPrompt, regroupSystemPrompt } from "@/lib/ai";
import { authorized, UNAUTHORIZED_MSG } from "@/lib/auth";
import { loadProducts } from "@/lib/products";
import { DEFAULT_SETTINGS, getSettings, resetSettings, saveSettings } from "@/lib/settings";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

function payload() {
  const s = getState();
  const products = loadProducts();
  const themes = s.themes.filter((t) => (t.gen ?? 0) === (s.generation ?? 0)).map((t) => t.name);
  return {
    settings: getSettings(),
    defaults: DEFAULT_SETTINGS,
    // The exact system prompts the model receives right now (instructions + fixed parts).
    preview: { analyze: analyzeSystemPrompt(products, themes), regroup: regroupSystemPrompt(products) },
  };
}

export function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: UNAUTHORIZED_MSG }, { status: 401 });
  return NextResponse.json(payload());
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: UNAUTHORIZED_MSG }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "reset") resetSettings();
  else saveSettings(body.settings ?? {});
  return NextResponse.json(payload());
}
