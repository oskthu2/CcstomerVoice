import { NextResponse } from "next/server";
import { loadSeed } from "@/lib/config";

export const dynamic = "force-dynamic";

/** A random voice from the Dagens Medicin article, used by the kiosk "Förifyll" button. */
export function GET(req: Request) {
  const voices = loadSeed().statements;
  const exclude = Number(new URL(req.url).searchParams.get("exclude") ?? -1);
  let idx = Math.floor(Math.random() * voices.length);
  if (idx === exclude && voices.length > 1) idx = (idx + 1) % voices.length;
  return NextResponse.json({ index: idx, total: voices.length, ...voices[idx] });
}
