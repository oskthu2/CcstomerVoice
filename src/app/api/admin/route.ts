import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { deleteStatement, ensureStarted, reanalyzeAll, regroupThemes, resetAll, seedExamples } from "@/lib/engine";

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Fel admin-token" }, { status: 401 });
  ensureStarted();
  const { action, id } = await req.json().catch(() => ({}));
  try {
    switch (action) {
      case "check":
        return NextResponse.json({ ok: true });
      case "seed":
        return NextResponse.json({ ok: true, added: seedExamples() });
      case "reanalyze":
        reanalyzeAll();
        return NextResponse.json({ ok: true });
      case "regroup":
        return NextResponse.json({ ok: await regroupThemes() });
      case "delete":
        deleteStatement(String(id));
        return NextResponse.json({ ok: true });
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
