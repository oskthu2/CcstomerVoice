import type { Edge, Node } from "@xyflow/react";
import type { Insight, ProductStatus, Statement, Theme } from "./types";

export const THEME_COLORS = ["#1f9d8b", "#3b82f6", "#d9622b", "#b4369f", "#c99a06", "#0e8fa8", "#d6335a", "#5f9a1f", "#7c4ddb", "#2d7fc1"];

export const QUOTES_PER_PRODUCT = 3;

export interface Quote { id: string; need: string; who: string }
export interface ProductData extends Record<string, unknown> {
  name: string; status: ProductStatus; count: number; quotes: Quote[]; color: string; side: Side; fresh: boolean;
}
export interface ThemeData extends Record<string, unknown> { name: string; count: number; color: string; side: Side }
export interface RootData extends Record<string, unknown> { title: string; subtitle: string }
type Side = "left" | "right";

// Fixed sizes keep the layout deterministic (must match globals.css).
const ROOT = { w: 340, h: 120 };
const THEME = { w: 300, h: 96 };
const PRODUCT_W = 380;
const productHeight = (quotes: number, more: boolean) => 78 + quotes * 62 + (more ? 24 : 0) + 6;
const X_THEME = 300; // gap from centre to theme column
const X_PRODUCT = 720;
const GAP_PRODUCT = 22;
const GAP_THEME = 70;

export function buildGraph(themes: Theme[], insights: Insight[], statements: Statement[], fresh: Set<string>) {
  const stById = new Map(statements.map((s) => [s.id, s]));
  const groups = themes
    .map((t, i) => {
      const its = insights.filter((x) => x.themeId === t.id);
      const byProduct = new Map<string, Insight[]>();
      for (const x of its) byProduct.set(x.product, [...(byProduct.get(x.product) ?? []), x]);
      const products = [...byProduct.entries()]
        .map(([name, list]) => {
          const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          const quotes = sorted.slice(0, QUOTES_PER_PRODUCT).map((x) => {
            const st = stById.get(x.statementId);
            return { id: x.id, need: x.need, who: [st?.author, st?.role].filter(Boolean).join(", ") || "Anonym besökare" };
          });
          const h = productHeight(quotes.length, list.length > quotes.length);
          return { name, status: list[0].productStatus, count: list.length, quotes, h, fresh: list.some((x) => fresh.has(x.id)) };
        })
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      const height = Math.max(THEME.h, products.reduce((s, p) => s + p.h + GAP_PRODUCT, -GAP_PRODUCT));
      return { theme: t, color: THEME_COLORS[i % THEME_COLORS.length], count: its.length, products, height };
    })
    .filter((g) => g.count > 0)
    .sort((a, b) => b.count - a.count);

  // Balance the two sides of the mind map by height.
  const sides: Record<Side, typeof groups> = { right: [], left: [] };
  const heights = { right: 0, left: 0 };
  for (const g of groups) {
    const side: Side = heights.right <= heights.left ? "right" : "left";
    sides[side].push(g);
    heights[side] += g.height + GAP_THEME;
  }

  const nodes: Node[] = [
    {
      id: "root",
      type: "root",
      position: { x: -ROOT.w / 2, y: -ROOT.h / 2 },
      data: { title: "Vårdens digitala vägval", subtitle: "Röster → Inera-produkter" } satisfies RootData,
    },
  ];
  const edges: Edge[] = [];

  for (const side of ["right", "left"] as Side[]) {
    const dir = side === "right" ? 1 : -1;
    let y = -(heights[side] - GAP_THEME) / 2;
    for (const g of sides[side]) {
      const themeId = `t:${g.theme.id}`;
      nodes.push({
        id: themeId,
        type: "theme",
        position: { x: dir > 0 ? X_THEME : -X_THEME - THEME.w, y: y + g.height / 2 - THEME.h / 2 },
        data: { name: g.theme.name, count: g.count, color: g.color, side } satisfies ThemeData,
      });
      edges.push(edge("root", themeId, g.color, side, 5));
      let py = y + (g.height - g.products.reduce((s, p) => s + p.h + GAP_PRODUCT, -GAP_PRODUCT)) / 2;
      for (const p of g.products) {
        const pid = `p:${g.theme.id}:${p.name}`;
        nodes.push({
          id: pid,
          type: "product",
          position: { x: dir > 0 ? X_PRODUCT : -X_PRODUCT - PRODUCT_W, y: py },
          data: { name: p.name, status: p.status, count: p.count, quotes: p.quotes, color: g.color, side, fresh: p.fresh } satisfies ProductData,
        });
        edges.push(edge(themeId, pid, g.color, side, 3, p.status === "future"));
        py += p.h + GAP_PRODUCT;
      }
      y += g.height + GAP_THEME;
    }
  }
  return { nodes, edges, themeIds: groups.map((g) => `t:${g.theme.id}`) };
}

function edge(source: string, target: string, color: string, side: Side, width: number, dashed = false): Edge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    sourceHandle: side,
    targetHandle: side,
    style: { stroke: color, strokeWidth: width, strokeDasharray: dashed ? "8 6" : undefined },
  };
}
