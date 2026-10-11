import type { Edge, Node } from "@xyflow/react";
import { hash01, rectCollide, relax, type Box, type Link } from "./force";
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
export interface VoiceData extends Record<string, unknown> { text: string; who: string; colors: string[]; fresh: boolean; compact?: boolean }
export interface VennCircleData extends Record<string, unknown> { color: string; size: number }
export interface VennLabelData extends Record<string, unknown> { name: string; count: number; color: string; unit?: [string, string] }

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
  // Up to three categories read best as a Venn diagram; more fall back to hubs with links.
  if (categories.length >= 1 && categories.length <= 3) return buildVennGraph(categories, statements, fresh, prev);
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

// ---------------------------------------------------------------------------
// Venn diagrams (≤ 3 sets): each item sits in the region matching its exact set
// membership; items in no set gather under a label below the circles.
// Used for voices × categories and for value cards × benefit types.
// ---------------------------------------------------------------------------
interface VennItem {
  id: string;
  sets: string[];
  createdAt: string;
  type: string;
  data: Record<string, unknown>;
}

function vennLayout(
  sets: Category[],
  items: VennItem[],
  size: { w: number; h: number },
  prev: Positions | undefined,
  labels: { unit: [string, string]; none: string; noneColor?: string },
): Graph {
  const k = sets.length;
  const regions = new Map<string, VennItem[]>();
  for (const it of [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const key = it.sets.join("+") || UNCATEGORIZED_ID;
    regions.set(key, [...(regions.get(key) ?? []), it]);
  }

  // Venn geometry for unit radius: try several distances between the circle centres
  // (closer circles → bigger overlaps) and keep the one that needs the smallest circles
  // for this distribution of cards. Region areas and centroids come from a sampling grid.
  const cardArea = (size.w + 14) * (size.h + 14) * 1.3;
  const geometry = (f: number) => {
    const unitCentres = sets.map((_, i) => {
      if (k === 1) return { x: 0, y: 0 };
      if (k === 2) return { x: (i === 0 ? -1 : 1) * f * 0.5, y: 0 };
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
      return { x: Math.cos(a) * (f / Math.sqrt(3)), y: Math.sin(a) * (f / Math.sqrt(3)) };
    });
    const step = 0.025;
    const acc = new Map<string, { n: number; x: number; y: number }>();
    for (let x = -2.2; x <= 2.2; x += step)
      for (let y = -2.2; y <= 2.2; y += step) {
        const inside = sets.map((c, i) => (Math.hypot(x - unitCentres[i].x, y - unitCentres[i].y) < 1 ? c.id : "")).filter(Boolean);
        if (!inside.length) continue;
        const key = inside.sort().join("+");
        const a = acc.get(key) ?? { n: 0, x: 0, y: 0 };
        a.n++; a.x += x; a.y += y;
        acc.set(key, a);
      }
    const region = new Map([...acc].map(([key, a]) => [key, { area: a.n * step * step, x: a.x / a.n, y: a.y / a.n }]));
    let need = 0;
    for (const [key, members] of regions) {
      if (key === UNCATEGORIZED_ID) continue;
      const r = region.get(key);
      if (r) need = Math.max(need, Math.sqrt((members.length * cardArea) / r.area));
    }
    return { f, unitCentres, region, R: Math.max(520, size.w * 1.9, need) };
  };
  const geo = (k === 1 ? [geometry(1)] : [1.0, 0.85, 0.72, 0.6].map(geometry)).reduce((a, b) => (b.R < a.R ? b : a));
  const R0 = geo.R;

  const unit = (x: number, y: number) => {
    const d = Math.hypot(x, y) || 1;
    return { x: x / d, y: y / d };
  };
  // Lay out for a given radius; if cards still overlap, grow the circles a little and try again.
  const attempt = (R: number) => {
    const centre = new Map(sets.map((c, i) => [c.id, { x: geo.unitCentres[i].x * R, y: geo.unitCentres[i].y * R }]));
    const bottom = Math.max(...[...centre.values()].map((c) => c.y)) + R;

    // Each region's cloud starts at the region's centroid.
    const anchorOf = (key: string) => {
      if (key === UNCATEGORIZED_ID) return { x: 0, y: bottom + 220 + size.h };
      const r = geo.region.get(key);
      return r ? { x: r.x * R, y: r.y * R } : { x: 0, y: 0 };
    };

    const PAD = 18;
    const SPIRAL = Math.sqrt((size.w + 14) * (size.h + 14) / Math.PI) * 1.18;
    const boxes: (Box & { sets: string[] })[] = [];
    for (const [key, members] of regions) {
      const a = anchorOf(key);
      members.forEach((it, i) => {
        const r = SPIRAL * Math.sqrt(i + 0.5);
        const t = i * 2.399963 + hash01(key) * 6.283;
        const p = prev?.get(it.id);
        boxes.push({ id: it.id, w: size.w, h: size.h, x: p?.x ?? a.x + Math.cos(t) * r, y: p?.y ?? a.y + Math.sin(t) * r, ax: a.x, ay: a.y, sets: it.sets });
      });
    }

    // Keep every card inside its own circles and outside the others, tested against the
    // card's actual rectangle: all corners inside a member circle, nearest point outside the rest.
    const hw = size.w / 2;
    const hh = size.h / 2;
    const constrain = () => {
      for (const b of boxes) {
        for (const c of sets) {
          const o = centre.get(c.id)!;
          if (b.sets.includes(c.id)) {
            const max = R - PAD;
            // Farthest corner from the circle centre.
            const fx = Math.abs(b.x! - o.x) + hw;
            const fy = Math.abs(b.y! - o.y) + hh;
            const far = Math.hypot(fx, fy);
            if (far > max) {
              const dx = b.x! - o.x;
              const dy = b.y! - o.y;
              const d = Math.hypot(dx, dy) || 1;
              const shift = far - max;
              b.x! -= (dx / d) * shift;
              b.y! -= (dy / d) * shift;
            }
          } else {
            const min = R + PAD;
            // Nearest point of the card to the circle centre.
            const nx = Math.max(b.x! - hw, Math.min(o.x, b.x! + hw));
            const ny = Math.max(b.y! - hh, Math.min(o.y, b.y! + hh));
            const near = Math.hypot(nx - o.x, ny - o.y);
            if (near < min) {
              const dx = b.x! - o.x;
              const dy = b.y! - o.y;
              const d = Math.hypot(dx, dy);
              const u = d > 1 ? { x: dx / d, y: dy / d } : unit(b.ax! - o.x, b.ay! - o.y);
              const shift = min - near;
              b.x! += u.x * shift;
              b.y! += u.y * shift;
            }
          }
        }
      }
    };
    const collide = rectCollide(12);
    collide.initialize(boxes);
    const iterations = prev?.size ? 120 : 260;
    for (let i = 0; i < iterations; i++) {
      for (const b of boxes) {
        b.x! += (b.ax! - b.x!) * 0.03;
        b.y! += (b.ay! - b.y!) * 0.03;
      }
      collide(0.7);
      constrain();
    }
    for (let i = 0; i < 120; i++) {
      collide(0.5);
      constrain();
    }
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (Math.abs(a.x! - b.x!) < (a.w + b.w) / 2 - 1 && Math.abs(a.y! - b.y!) < (a.h + b.h) / 2 - 1) overlaps++;
      }
    return { R, centre, bottom, boxes, overlaps };
  };
  let layout = attempt(R0);
  for (let tries = 0; tries < 7 && layout.overlaps > 0; tries++) layout = attempt(layout.R * 1.08);
  const { R, centre, bottom, boxes } = layout;

  const nodes: Node[] = [];
  const counts = new Map(sets.map((c) => [c.id, items.filter((v) => v.sets.includes(c.id)).length]));
  for (const c of sets) {
    const o = centre.get(c.id)!;
    nodes.push({ id: `vc:${c.id}`, type: "vennCircle", position: { x: o.x - R, y: o.y - R }, zIndex: -1, selectable: false, data: { color: c.color, size: 2 * R } satisfies VennCircleData });
    // Label just outside the circle, away from the middle; further sideways for side labels (it is wide).
    const dir = k === 1 ? { x: 0, y: -1 } : unit(o.x, o.y);
    const lx = o.x + dir.x * (R + 60 + 240 * Math.abs(dir.x));
    const ly = o.y + dir.y * (R + 70);
    nodes.push({ id: `vl:${c.id}`, type: "vennLabel", position: { x: lx - 260, y: ly - 70 }, data: { name: c.name, count: counts.get(c.id)!, color: c.color, unit: labels.unit } satisfies VennLabelData });
  }
  const others = regions.get(UNCATEGORIZED_ID) ?? [];
  if (others.length) {
    nodes.push({ id: "vl:" + UNCATEGORIZED_ID, type: "vennLabel", position: { x: -260, y: bottom + 40 }, data: { name: labels.none, count: others.length, color: labels.noneColor ?? "#7a8a99", unit: labels.unit } satisfies VennLabelData });
  }
  const byId = new Map(items.map((it) => [it.id, it]));
  for (const b of boxes) {
    const it = byId.get(b.id)!;
    nodes.push({ id: b.id, type: it.type, position: { x: b.x! - b.w / 2, y: b.y! - b.h / 2 }, data: it.data });
  }
  return {
    nodes,
    edges: [],
    centres: new Map(boxes.map((b) => [b.id, { x: b.x!, y: b.y! }])),
    groups: [
      ...sets.map((c) => ({ id: c.id, nodeIds: [`vc:${c.id}`, `vl:${c.id}`] })),
      ...(others.length ? [{ id: UNCATEGORIZED_ID, nodeIds: ["vl:" + UNCATEGORIZED_ID, ...others.map((o) => o.id)] }] : []),
    ],
  };
}

const VENN_VOICE = { w: 250, h: 104 };

/** Category view: voices × categories. */
export function buildVennGraph(categories: Category[], statements: Statement[], fresh: Set<string>, prev?: Positions): Graph {
  const known = new Set(categories.map((c) => c.id));
  const colorOf = new Map(categories.map((c) => [c.id, c.color]));
  const items: VennItem[] = statements
    .filter((s) => s.status === "done" || (s.categories?.length ?? 0) > 0)
    .map((s) => {
      const cats = [...new Set((s.categories ?? []).filter((c) => known.has(c)))].sort();
      const text = s.text.length > 90 ? s.text.slice(0, 87).trimEnd() + " …" : s.text;
      return {
        id: `v:${s.id}`, sets: cats, createdAt: s.createdAt, type: "voice",
        data: { text, who: who(s), colors: cats.map((c) => colorOf.get(c)!), fresh: fresh.has(s.id), compact: true } satisfies VoiceData,
      };
    });
  return vennLayout(categories, items, VENN_VOICE, prev, { unit: ["röst", "röster"], none: "Övrigt" });
}

// ---------------------------------------------------------------------------
// View 3: value. One card per Inera service / opportunity, placed in a Venn diagram of
// benefit types. A card gets a benefit when at least a third of its needs point to it.
// ---------------------------------------------------------------------------
export interface ValueCardData extends Record<string, unknown> {
  name: string; status: ProductStatus; count: number; need: string; colors: string[]; fresh: boolean;
}
const VALUE_CARD = { w: 360, h: 168 };
export const BENEFIT_SHARE = 1 / 3;

export function buildValueGraph(benefits: Category[], insights: Insight[], fresh: Set<string>, prev?: Positions): Graph {
  const known = new Set(benefits.map((b) => b.id));
  const colorOf = new Map(benefits.map((b) => [b.id, b.color]));
  const byProduct = new Map<string, Insight[]>();
  for (const i of insights) byProduct.set(i.product, [...(byProduct.get(i.product) ?? []), i]);
  const items: VennItem[] = [...byProduct.entries()].map(([name, list]) => {
    const share = (id: string) => list.filter((i) => i.benefits?.includes(id)).length / list.length;
    const sets = benefits.filter((b) => share(b.id) >= BENEFIT_SHARE).map((b) => b.id).filter((id) => known.has(id)).sort();
    const newest = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      id: `b:${name}`, sets, createdAt: newest[newest.length - 1].createdAt, type: "valueCard",
      data: {
        name, status: list[0].productStatus, count: list.length, need: newest[0].need, colors: sets.map((s) => colorOf.get(s)!),
        fresh: list.some((i) => fresh.has(i.id)),
      } satisfies ValueCardData,
    };
  });
  return vennLayout(benefits, items, VALUE_CARD, prev, { unit: ["kort", "kort"], none: "Ingen tydlig nytta" });
}
