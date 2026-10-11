import type { Edge, Node } from "@xyflow/react";
import { hash01, relax, type Box, type Link } from "./force";
import { who } from "./format";
import type { Category, Insight, ProductStatus, Statement, Theme } from "./types";

export const THEME_COLORS = ["#1f9d8b", "#3b82f6", "#d9622b", "#b4369f", "#c99a06", "#0e8fa8", "#d6335a", "#5f9a1f", "#7c4ddb", "#2d7fc1"];
export const QUOTES_PER_PRODUCT = 3;
export const UNCATEGORIZED_ID = "_none";

export interface Quote { id: string; need: string; who: string }
export interface ProductData extends Record<string, unknown> {
  name: string; status: ProductStatus; count: number; quotes: Quote[]; color: string; fresh: boolean;
}
export interface ThemeData extends Record<string, unknown> { name: string; count: number; color: string }
export interface RootData extends Record<string, unknown> { title: string; subtitle: string }
export interface HubData extends Record<string, unknown> { name: string; description: string; count: number; color: string }
export interface VoiceData extends Record<string, unknown> { text: string; who: string; colors: string[]; fresh: boolean }

/** Result of a layout: React Flow nodes/edges plus groups the camera tour can focus on. */
export interface Graph {
  nodes: Node[];
  edges: Edge[];
  groups: { id: string; nodeIds: string[] }[];
  /** Box centres, fed back in as the warm start of the next layout. */
  centres: Positions;
}

export type Positions = Map<string, { x: number; y: number }>;

// Fixed sizes keep the layout deterministic (must match globals.css).
const ROOT = { w: 340, h: 120 };
const THEME = { w: 280, h: 132 };
const PRODUCT_W = 320;
// Title is clamped to two lines in CSS (~24 characters per line at 20px in a 320px card).
const productHeight = (name: string, quotes: number, more: boolean) => 78 + (name.length > 24 ? 25 : 0) + quotes * 62 + (more ? 24 : 0) + 6;
const HUB = { w: 280, h: 120 };
const VOICE = { w: 250, h: 112 };

const edge = (source: string, target: string, color: string, width: number, dashed = false): Edge => ({
  id: `${source}->${target}`,
  source,
  target,
  sourceHandle: "c",
  targetHandle: "c",
  type: "straight",
  style: { stroke: color, strokeWidth: width, strokeDasharray: dashed ? "8 6" : undefined },
});

/** Turn relaxed box centres into React Flow nodes (top-left positions). */
function place(boxes: Box[], pos: Positions, make: (b: Box) => Omit<Node, "position" | "id">): Node[] {
  return boxes.map((b) => {
    const p = pos.get(b.id)!;
    return { id: b.id, position: { x: p.x - b.w / 2, y: p.y - b.h / 2 }, ...make(b) } as Node;
  });
}

// ---------------------------------------------------------------------------
// View 1: themes as clouds around the root, products floating around their theme.
// ---------------------------------------------------------------------------
export function buildThemeGraph(themes: Theme[], insights: Insight[], statements: Statement[], fresh: Set<string>, prev?: Positions): Graph {
  const stById = new Map(statements.map((s) => [s.id, s]));
  const groups = themes
    .map((t, i) => {
      const its = insights.filter((x) => x.themeId === t.id);
      const byProduct = new Map<string, Insight[]>();
      for (const x of its) byProduct.set(x.product, [...(byProduct.get(x.product) ?? []), x]);
      const products = [...byProduct.entries()]
        .map(([name, list]) => {
          const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          const quotes = sorted.slice(0, QUOTES_PER_PRODUCT).map((x) => ({ id: x.id, need: x.need, who: who(stById.get(x.statementId)) }));
          return {
            id: `p:${t.id}:${name}`, name, status: list[0].productStatus, count: list.length, quotes,
            h: productHeight(name, quotes.length, list.length > quotes.length), fresh: list.some((x) => fresh.has(x.id)),
          };
        })
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      // Rough cluster radius from the area of its cards.
      const area = products.reduce((s, p) => s + (PRODUCT_W + 40) * (p.h + 40), THEME.w * THEME.h);
      return { theme: t, id: `t:${t.id}`, color: THEME_COLORS[i % THEME_COLORS.length], count: its.length, products, r: Math.sqrt(area) * 0.62 };
    })
    .filter((g) => g.count > 0)
    .sort((a, b) => b.count - a.count);

  // Anchor each cluster on a ring around the root; wider clusters get a wider slice.
  const totalR = groups.reduce((s, g) => s + g.r, 0) || 1;
  const ringR = Math.max(ROOT.w / 2 + 260 + (groups[0]?.r ?? 0), (totalR * 2 * 1.08) / (2 * Math.PI));
  let acc = 0;
  const boxes: Box[] = [{ id: "root", w: ROOT.w, h: ROOT.h, x: 0, y: 0, fixed: true, charge: 0 }];
  const links: Link[] = [];
  for (const g of groups) {
    const angle = ((acc + g.r) / totalR) * Math.PI - Math.PI / 2;
    acc += 2 * g.r;
    const R = ringR + g.r * 0.35;
    const ax = Math.cos(angle) * R;
    const ay = Math.sin(angle) * R;
    const prevT = prev?.get(g.id);
    boxes.push({ id: g.id, w: THEME.w, h: THEME.h, x: prevT?.x ?? ax, y: prevT?.y ?? ay, ax, ay, charge: -1600 });
    links.push({ source: "root", target: g.id, distance: R, strength: 0.15 });
    g.products.forEach((p, j) => {
      // Fan products out around their theme, starting on the side facing away from the root.
      const a = angle + (j - (g.products.length - 1) / 2) * ((2 * Math.PI) / Math.max(g.products.length, 4)) * 0.9;
      const d = THEME.w / 2 + PRODUCT_W / 2 + 40;
      const prevP = prev?.get(p.id);
      boxes.push({ id: p.id, w: PRODUCT_W, h: p.h, x: prevP?.x ?? ax + Math.cos(a) * d, y: prevP?.y ?? ay + Math.sin(a) * d, ax, ay, charge: -500 });
      links.push({ source: g.id, target: p.id, distance: d, strength: 0.7 });
    });
  }

  const pos = relax(boxes, links, { ticks: prev?.size ? 160 : 320, padding: 26 });
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const productById = new Map(groups.flatMap((g) => g.products.map((p) => [p.id, { p, g }] as const)));
  const nodes = place(boxes, pos, (b) => {
    if (b.id === "root") return { type: "root", data: { title: "Vårdens digitala vägval", subtitle: "Röster → Inera-tjänster" } satisfies RootData };
    const g = groupById.get(b.id);
    if (g) return { type: "theme", data: { name: g.theme.name, count: g.count, color: g.color } satisfies ThemeData };
    const { p, g: pg } = productById.get(b.id)!;
    return { type: "product", data: { name: p.name, status: p.status, count: p.count, quotes: p.quotes, color: pg.color, fresh: p.fresh } satisfies ProductData };
  });
  const edges: Edge[] = [];
  for (const g of groups) {
    edges.push(edge("root", g.id, g.color, 5));
    for (const p of g.products) edges.push(edge(g.id, p.id, g.color, 3, p.status === "future"));
  }
  return { nodes, edges, centres: pos, groups: groups.map((g) => ({ id: g.theme.id, nodeIds: [g.id, ...g.products.map((p) => p.id)] })) };
}

// ---------------------------------------------------------------------------
// View 2: every voice linked to one or more predefined categories.
// Voices with several categories float between their hubs.
// ---------------------------------------------------------------------------
export function buildCategoryGraph(categories: Category[], statements: Statement[], fresh: Set<string>, prev?: Positions): Graph {
  const known = new Set(categories.map((c) => c.id));
  const voices = statements
    .filter((s) => s.status === "done" || (s.categories?.length ?? 0) > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((s) => ({ s, cats: (s.categories ?? []).filter((c) => known.has(c)) }));
  const hubs: (Category & { count: number })[] = categories.map((c) => ({ ...c, count: voices.filter((v) => v.cats.includes(c.id)).length }));
  const uncategorized = voices.filter((v) => v.cats.length === 0);
  if (uncategorized.length) {
    hubs.push({ id: UNCATEGORIZED_ID, name: "Övrigt", description: "Röster utan tydlig koppling", color: "#7a8a99", count: uncategorized.length });
    for (const v of uncategorized) v.cats = [UNCATEGORIZED_ID];
  }

  // Group voices by their exact set of categories; each group becomes a cloud.
  const groups = new Map<string, typeof voices>();
  for (const v of voices) {
    const key = [...v.cats].sort().join("+");
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  const SPIRAL = 118; // spacing of the sunflower spiral, ~ one voice card
  const HUB_CLEAR = ((HUB.w / 2 + 40) / SPIRAL) ** 2; // spiral index where cards clear the hub
  const cloudR = (n: number, clear = 0) => SPIRAL * Math.sqrt(n + clear);
  const ringHubs = hubs.filter((h) => h.id !== UNCATEGORIZED_ID);
  const k = ringHubs.length;
  const largest = (size: number) => Math.max(0, ...[...groups.entries()].filter(([key]) => key.split("+").length === size && !key.includes(UNCATEGORIZED_ID)).map(([, g]) => g.length));
  const rSingle = cloudR(largest(1), HUB_CLEAR);
  const rPair = cloudR(largest(2));
  const rMany = cloudR(Math.max(largest(3), largest(4)));
  // Ring radius so single clouds, the clouds between two hubs and the centre cloud don't collide.
  const halfChord = k > 1 ? Math.sin(Math.PI / k) : 1;
  const ringR = k <= 1 ? 0 : Math.max(560, (rSingle + rPair + 140) / halfChord, (rPair + rMany + 160) / Math.max(Math.cos(Math.PI / k), 0.3));

  const hubPos = new Map<string, { x: number; y: number }>();
  ringHubs.forEach((h, i) => {
    const a = (i / Math.max(k, 1)) * 2 * Math.PI - Math.PI / 2;
    hubPos.set(h.id, { x: Math.cos(a) * ringR, y: Math.sin(a) * ringR });
  });
  if (uncategorized.length) hubPos.set(UNCATEGORIZED_ID, { x: -(ringR + rSingle + 420), y: ringR * 0.6 });

  const boxes: Box[] = hubs.map((h) => ({ id: `c:${h.id}`, w: HUB.w, h: HUB.h, ...hubPos.get(h.id)!, fixed: true, charge: 0 }));
  const links: Link[] = [];
  for (const [key, members] of groups) {
    const ids = key.split("+");
    const pts = ids.map((c) => hubPos.get(c)!);
    const single = ids.length === 1;
    // Anchor: the hub itself, or the midpoint of the hubs the group shares.
    const ax = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const ay = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    members.forEach(({ s }, i) => {
      const id = `v:${s.id}`;
      const r = SPIRAL * Math.sqrt(i + 0.5 + (single ? HUB_CLEAR : 0));
      const t = i * 2.399963 + hash01(key) * 6.283;
      const p = prev?.get(id);
      boxes.push({ id, w: VOICE.w, h: VOICE.h, x: p?.x ?? ax + Math.cos(t) * r, y: p?.y ?? ay + Math.sin(t) * r, ax, ay, charge: 0 });
      for (const c of ids) links.push({ source: id, target: `c:${c}`, distance: Math.hypot(ax - hubPos.get(c)!.x, ay - hubPos.get(c)!.y) + r * 0.3, strength: 0.02 });
    });
  }

  const pos = relax(boxes, links, { ticks: 120, padding: 14 });
  const hubById = new Map(hubs.map((h) => [`c:${h.id}`, h]));
  const colorOf = new Map(hubs.map((h) => [h.id, h.color]));
  const voiceById = new Map(voices.map((v) => [`v:${v.s.id}`, v]));
  const nodes = place(boxes, pos, (b) => {
    const h = hubById.get(b.id);
    if (h) return { type: "hub", data: { name: h.name, description: h.description, count: h.count, color: h.color } satisfies HubData };
    const { s, cats } = voiceById.get(b.id)!;
    const text = s.text.length > 120 ? s.text.slice(0, 117).trimEnd() + " …" : s.text;
    return { type: "voice", data: { text, who: who(s), colors: cats.map((c) => colorOf.get(c)!), fresh: fresh.has(s.id) } satisfies VoiceData };
  });
  const edges = voices.flatMap(({ s, cats }) => cats.map((c) => edge(`c:${c}`, `v:${s.id}`, colorOf.get(c)!, 2)));
  return {
    nodes,
    edges,
    centres: pos,
    groups: hubs.map((h) => ({ id: h.id, nodeIds: [`c:${h.id}`, ...voices.filter((v) => v.cats.includes(h.id)).map((v) => `v:${v.s.id}`)] })),
  };
}
