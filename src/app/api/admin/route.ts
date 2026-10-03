import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { testAi } from "@/lib/ai";
import { loadProducts } from "@/lib/config";
import { deleteStatement, ensureStarted, reanalyzeAll, regroupThemes, resetAll, retryFailed, seedExamples } from "@/lib/engine";

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Fel admin-token" }, { status: 401 });
  ensureStarted();
  const { action, id, regroupAfter } = await req.json().catch(() => ({}));
  try {
    switch (action) {
      case "check":
        return NextResponse.json({ ok: true });
      case "seed":
        return NextResponse.json({ ok: true, added: seedExamples() });
      case "reanalyze":
        return NextResponse.json({ ok: true, queued: reanalyzeAll({ regroupAfter: Boolean(regroupAfter) }) });
      case "regroup":
        return NextResponse.json({ ok: await regroupThemes() });
      case "delete":
        deleteStatement(String(id));
        return NextResponse.json({ ok: true });
      case "test":
        return NextResponse.json({ ok: true, ...(await testAi(loadProducts())) });
      case "retry":
        return NextResponse.json({ ok: true, retried: retryFailed() });
      case "reset":
        resetAll();
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Okänd åtgärd" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
