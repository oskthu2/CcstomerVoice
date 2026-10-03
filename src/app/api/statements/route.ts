import { NextResponse } from "next/server";
import { ensureStarted, submitStatement } from "@/lib/engine";

export async function POST(req: Request) {
  ensureStarted();
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 5) return NextResponse.json({ error: "Texten är för kort." }, { status: 400 });
  const st = submitStatement({ text, author: body.author, role: body.role, source: "kiosk" });
  return NextResponse.json({ id: st.id });
}
