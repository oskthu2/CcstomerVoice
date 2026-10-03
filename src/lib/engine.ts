import { analyzeStatement, regroup, type RawInsight } from "./ai";
import { loadProducts, loadSeed, seedOnStart } from "./config";
import { getState, mutate, newId } from "./store";
import type { Insight, Product, Statement } from "./types";

const g = globalThis as unknown as {
  __cvEngine?: { queue: string[]; running: boolean; started: boolean; regroupAfter: boolean };
};
const engine = (g.__cvEngine ??= { queue: [], running: false, started: false, regroupAfter: false });

const generation = () => getState().generation ?? 0;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9åäöé]+/g, " ").trim();

/** Called lazily from every API route: resumes unfinished work after a restart. */
export function ensureStarted() {
  if (engine.started) return;
  engine.started = true;
  const s = getState();
  if (seedOnStart && s.statements.length === 0) seedExamples();
  for (const st of s.statements) if (st.status === "pending" || st.status === "processing") enqueue(st.id);
}

export function submitStatement(input: { text: string; author?: string; role?: string; source?: Statement["source"] }) {
  const st: Statement = {
    id: newId(),
    text: input.text.trim().slice(0, 2000),
    author: input.author?.trim().slice(0, 80) || undefined,
    role: input.role?.trim().slice(0, 120) || undefined,
    source: input.source ?? "kiosk",
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  mutate((s) => s.statements.push(st));
  enqueue(st.id);
  return st;
}

export function seedExamples() {
  const existing = new Set(getState().statements.map((s) => s.text));
  let added = 0;
  for (const v of loadSeed().statements) {
    if (existing.has(v.text)) continue;
    submitStatement({ ...v, source: "example" });
    added++;
  }
  return added;
}

/**
 * Re-sort every statement with the current AI instructions. Existing insights stay on
 * the wall until each statement has been re-analysed; a new generation makes the AI
 * build fresh themes instead of reusing the old ones.
 */
export function reanalyzeAll(opts: { regroupAfter?: boolean } = {}) {
  mutate((s) => {
    s.generation = (s.generation ?? 0) + 1;
    for (const st of s.statements) st.status = "pending";
  });
  engine.regroupAfter = Boolean(opts.regroupAfter);
  engine.queue = [];
  for (const st of getState().statements) enqueue(st.id);
  return getState().statements.length;
}

export function deleteStatement(id: string) {
  mutate((s) => {
    s.statements = s.statements.filter((x) => x.id !== id);
    s.insights = s.insights.filter((x) => x.statementId !== id);
    pruneThemes(s);
  });
}

export function retryFailed() {
  const failed = getState().statements.filter((s) => s.status === "error");
  mutate((s) => s.statements.forEach((st) => st.status === "error" && (st.status = "pending")));
  failed.forEach((st) => enqueue(st.id));
  return failed.length;
}

export function resetAll() {
  engine.queue = [];
  mutate((s) => {
    s.statements = [];
    s.insights = [];
    s.themes = [];
  });
}

export async function regroupThemes() {
  const s = getState();
  const items = s.insights.map((i) => ({
    id: i.id,
    need: i.need,
    product: i.product,
    theme: s.themes.find((t) => t.id === i.themeId)?.name ?? "",
  }));
  const res = await regroup(items, loadProducts());
  if (!res?.themes?.length) return false;
  mutate((st) => {
    const themes = res.themes.map((t) => ({ id: newId(), name: t.name, description: t.description, gen: st.generation ?? 0 }));
    const byInsight = new Map<string, string>();
    res.themes.forEach((t, idx) => t.insight_ids?.forEach((iid) => byInsight.set(iid, themes[idx].id)));
    const current = new Set(loadProducts().filter((p) => p.status === "current").map((p) => p.name));
    for (const ins of st.insights) {
      const tid = byInsight.get(ins.id);
      if (tid) ins.themeId = tid;
      const rename = res.product_renames?.find((r) => r.from === ins.product)?.to;
      if (rename && !current.has(ins.product)) ins.product = rename;
    }
    // Insights the model forgot keep their old theme, so retain those themes too.
    const used = new Set(st.insights.map((i) => i.themeId));
    st.themes = [...themes, ...st.themes].filter((t) => used.has(t.id));
  });
  return true;
}

// ---------------------------------------------------------------------------

function enqueue(id: string) {
  if (!engine.queue.includes(id)) engine.queue.push(id);
  void run();
}

async function run() {
  if (engine.running) return;
  engine.running = true;
  try {
    while (engine.queue.length) {
      const id = engine.queue.shift()!;
      await processStatement(id);
    }
    if (engine.regroupAfter) {
      engine.regroupAfter = false;
      await regroupThemes().catch((e) => console.error("[engine] regroup failed", e));
    }
  } finally {
    engine.running = false;
  }
}

async function processStatement(id: string) {
  const st = getState().statements.find((s) => s.id === id);
  if (!st) return;
  mutate(() => (st.status = "processing"));
  const products = loadProducts();
  let raw: RawInsight[] | null = null;
  let error = "";
  for (let attempt = 0; attempt < 3 && !raw; attempt++) {
    try {
      const themes = getState().themes.filter((t) => (t.gen ?? 0) === generation());
      raw = await analyzeStatement(st.text, st, products, themes.map((t) => t.name));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      console.error(`[engine] analyze failed (attempt ${attempt + 1})`, error);
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  mutate((s) => {
    const cur = s.statements.find((x) => x.id === id);
    if (!cur) return; // deleted meanwhile
    if (!raw) {
      cur.status = "error";
      cur.error = error;
      return;
    }
    s.insights = s.insights.filter((x) => x.statementId !== id);
    for (const r of raw) s.insights.push(toInsight(r, id, s, products));
    pruneThemes(s);
    cur.status = "done";
    cur.error = undefined;
  });
}

function toInsight(r: RawInsight, statementId: string, s: ReturnType<typeof getState>, products: Product[]): Insight {
  // Theme: reuse by normalised name, otherwise create.
  const gen = s.generation ?? 0;
  let theme = s.themes.find((t) => (t.gen ?? 0) === gen && norm(t.name) === norm(r.theme));
  if (!theme) {
    theme = { id: newId(), name: r.theme.trim(), gen };
    s.themes.push(theme);
  }
  // Product: resolve against catalogue names + aliases, then against products already on the wall.
  const n = norm(r.product);
  const known =
    products.find((p) => norm(p.name) === n || p.aliases?.some((a) => norm(a) === n)) ??
    products.find((p) => p.status === "current" && (n.includes(norm(p.name)) || norm(p.name).includes(n)));
  let name = known?.name ?? r.product.trim();
  let status = known?.status ?? "future";
  if (!known) {
    const onWall = s.insights.find((i) => norm(i.product) === n);
    if (onWall) {
      name = onWall.product;
      status = onWall.productStatus;
    }
  }
  return {
    id: newId(),
    statementId,
    excerpt: r.excerpt?.trim() ?? "",
    need: r.need.trim(),
    themeId: theme.id,
    product: name,
    productStatus: status,
    rationale: r.rationale?.trim(),
    createdAt: new Date().toISOString(),
  };
}

function pruneThemes(s: ReturnType<typeof getState>) {
  const used = new Set(s.insights.map((i) => i.themeId));
  s.themes = s.themes.filter((t) => used.has(t.id));
}

export function queueLength() {
  return engine.queue.length + (engine.running ? 1 : 0);
}
