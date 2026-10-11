import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = getState();
  const statement = s.statements.find((x) => x.id === id);
  if (!statement) return NextResponse.json({ error: "not found" }, { status: 404 });
  const insights = s.insights
    .filter((i) => i.statementId === id)
    .map((i) => ({
      ...i,
      theme: s.themes.find((t) => t.id === i.themeId)?.name,
      benefitNames: getSettings().benefits.filter((b) => i.benefits?.includes(b.id)).map((b) => b.name),
    }));
  const categories = getSettings().categories.filter((c) => statement.categories?.includes(c.id)).map(({ name, color }) => ({ name, color }));
  return NextResponse.json({ statement, insights, categories });
}
