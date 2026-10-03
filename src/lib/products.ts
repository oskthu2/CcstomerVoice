import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR, DATA_DIR } from "./config";
import type { Product } from "./types";

const BASE_FILE = path.join(CONFIG_DIR, "inera-products.json");
// Edits made in /admin are stored here (data volume) and take precedence over config/.
const OVERRIDE_FILE = path.join(DATA_DIR, "products.json");

export function loadBaseProducts(): Product[] {
  return JSON.parse(fs.readFileSync(BASE_FILE, "utf8")).products as Product[];
}

export function productsSource(): "admin" | "config" {
  return fs.existsSync(OVERRIDE_FILE) ? "admin" : "config";
}

export function loadProducts(): Product[] {
  try {
    return JSON.parse(fs.readFileSync(OVERRIDE_FILE, "utf8")).products as Product[];
  } catch {
    return loadBaseProducts();
  }
}

/** Validate and store the catalogue edited in /admin. Returns the cleaned list. */
export function saveProducts(input: unknown): Product[] {
  if (!Array.isArray(input)) throw new Error("Produktlistan måste vara en lista.");
  const seen = new Set<string>();
  const products: Product[] = [];
  for (const raw of input as Partial<Product>[]) {
    const name = String(raw?.name ?? "").trim().slice(0, 80);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const aliases = (Array.isArray(raw.aliases) ? raw.aliases : [])
      .map((a) => String(a).trim())
      .filter(Boolean)
      .slice(0, 20);
    products.push({
      name,
      status: raw.status === "future" ? "future" : "current",
      description: String(raw.description ?? "").trim().slice(0, 300) || undefined,
      ...(aliases.length ? { aliases } : {}),
    });
  }
  if (!products.length) throw new Error("Katalogen måste innehålla minst en produkt.");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OVERRIDE_FILE, JSON.stringify({ products }, null, 2));
  return products;
}

export function resetProducts() {
  try {
    fs.unlinkSync(OVERRIDE_FILE);
  } catch {
    /* already using config/ */
  }
}
