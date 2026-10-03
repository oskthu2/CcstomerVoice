import { NextResponse } from "next/server";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = getState();
  const statement = s.statements.find((x) => x.id === id);
  if (!statement) return NextResponse.json({ error: "not found" }, { status: 404 });
  const insights = s.insights
    .filter((i) => i.statementId === id)
    .map((i) => ({ ...i, theme: s.themes.find((t) => t.id === i.themeId)?.name }));
  return NextResponse.json({ statement, insights });
}
