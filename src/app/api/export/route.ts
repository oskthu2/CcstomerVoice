import { authorized, UNAUTHORIZED_MSG } from "@/lib/auth";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** Download everything for follow-up product work: ?format=csv (one row per insight) or json. */
export function GET(req: Request) {
  if (!authorized(req)) return new Response(UNAUTHORIZED_MSG, { status: 401 });
  const s = getState();
  const format = new URL(req.url).searchParams.get("format") ?? "json";
  if (format === "csv") {
    const header = ["tema", "produkt", "status", "behov", "citat", "motivering", "avsandare", "roll", "uttalande", "tid"];
    const rows = s.insights.map((i) => {
      const st = s.statements.find((x) => x.id === i.statementId);
      const theme = s.themes.find((t) => t.id === i.themeId)?.name;
      return [theme, i.product, i.productStatus === "current" ? "befintlig" : "framtida", i.need, i.excerpt, i.rationale, st?.author, st?.role, st?.text, i.createdAt];
    });
    const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="customer-voice.csv"' },
    });
  }
  return new Response(JSON.stringify(s, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="customer-voice.json"' },
  });
}
