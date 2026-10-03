import { NextResponse } from "next/server";
import { authorized, UNAUTHORIZED_MSG } from "@/lib/auth";
import { loadProducts, productsSource, resetProducts, saveProducts } from "@/lib/products";

export const dynamic = "force-dynamic";

const payload = () => ({ products: loadProducts(), source: productsSource() });

export function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: UNAUTHORIZED_MSG }, { status: 401 });
  return NextResponse.json(payload());
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: UNAUTHORIZED_MSG }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "reset") resetProducts();
    else saveProducts(body.products);
    return NextResponse.json(payload());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
