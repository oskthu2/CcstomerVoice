import { NextResponse } from "next/server";
import { ORGANIZATION_SUGGESTIONS } from "@/lib/format";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Suggestions for the kiosk's organisation field: known organisations plus those already entered. */
export function GET() {
  const entered = getState().statements.map((s) => s.organization).filter((o): o is string => Boolean(o));
  const seen = new Map<string, string>();
  for (const o of [...ORGANIZATION_SUGGESTIONS, ...entered]) if (!seen.has(o.toLowerCase())) seen.set(o.toLowerCase(), o);
  return NextResponse.json({ organizations: [...seen.values()].sort((a, b) => a.localeCompare(b, "sv")) });
}
