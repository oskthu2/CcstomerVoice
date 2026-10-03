import { NextResponse } from "next/server";
import { ai, demoMode, publicInputUrl } from "@/lib/config";
import { ensureStarted, queueLength } from "@/lib/engine";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  ensureStarted();
  const s = getState();
  const since = Number(new URL(req.url).searchParams.get("since") ?? -1);
  const meta = { version: s.version, queue: queueLength(), demoMode, model: demoMode ? null : ai.model, inputUrl: publicInputUrl };
  if (since === s.version) return NextResponse.json({ ...meta, unchanged: true });
  return NextResponse.json({ ...meta, statements: s.statements, insights: s.insights, themes: s.themes });
}
