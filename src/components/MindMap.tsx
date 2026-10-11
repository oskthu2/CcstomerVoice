"use client";
import "@xyflow/react/dist/style.css";
import { Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildCategoryGraph, buildThemeGraph,
  type HubData, type VennCircleData, type VennLabelData, type ProductData, type RootData, type ThemeData, type VoiceData,
} from "@/lib/layout";
import type { Category, Insight, Statement, Theme } from "@/lib/types";

/** Camera tour pacing in seconds (set from /admin). */
export interface TourTiming {
  overviewSec: number;
  themeSec: number;
  freshSec: number;
}

export type MapView = "themes" | "categories";

// One invisible handle in the middle of every node: edges run centre to centre,
// which suits a free-floating cloud better than fixed left/right ports.
const Center = () => (
  <>
    <Handle type="source" id="c" position={Position.Top} className="center-handle" />
    <Handle type="target" id="c" position={Position.Top} className="center-handle" />
  </>
);

function RootNode({ data }: NodeProps<Node<RootData>>) {
  return (
    <div className="mm-root">
      {data.title}
      <small>{data.subtitle}</small>
      <Center />
    </div>
  );
}

function ThemeNode({ data }: NodeProps<Node<ThemeData>>) {
  return (
    <div className="mm-theme" style={{ background: data.color }}>
      {data.name}
      <small>{data.count} behov</small>
      <Center />
    </div>
  );
}

function ProductNode({ data }: NodeProps<Node<ProductData>>) {
  return (
    <div className={`mm-product ${data.status} ${data.fresh ? "fresh" : ""}`} style={{ borderColor: data.fresh ? undefined : data.color }}>
      <header>
        <h3>{data.name}</h3>
        <div className="meta">
          {data.status === "future" && <span className="pill future">Möjlighet</span>}
          <span>{data.count} {data.count === 1 ? "röst" : "röster"}</span>
        </div>
      </header>
      <ul>
        {data.quotes.map((q) => (
          <li key={q.id} style={{ borderLeftColor: data.color }}>
            {q.need}
            <em>{q.who}</em>
          </li>
        ))}
      </ul>
      {data.count > data.quotes.length && <div className="more">+ {data.count - data.quotes.length} till</div>}
      <Center />
    </div>
  );
}

function HubNode({ data }: NodeProps<Node<HubData>>) {
  return (
    <div className="mm-hub" style={{ background: data.color }}>
      {data.name}
      <small>{data.count} {data.count === 1 ? "röst" : "röster"}</small>
      <Center />
    </div>
  );
}

function VoiceNode({ data }: NodeProps<Node<VoiceData>>) {
  return (
    <div className={`mm-voice ${data.compact ? "compact" : ""} ${data.fresh ? "fresh" : ""}`}>
      <div className="dots">
        {data.colors.map((c, i) => <span key={i} style={{ background: c }} />)}
      </div>
      <p>{data.text}</p>
      <em>{data.who}</em>
      <Center />
    </div>
  );
}

function VennCircleNode({ data }: NodeProps<Node<VennCircleData>>) {
  return <div className="mm-venn" style={{ width: data.size, height: data.size, borderColor: data.color, background: `${data.color}1f` }} />;
}

function VennLabelNode({ data }: NodeProps<Node<VennLabelData>>) {
  return (
    <div className="mm-venn-label" style={{ color: data.color }}>
      {data.name}
      <small>{data.count} {data.count === 1 ? "röst" : "röster"}</small>
    </div>
  );
}

const nodeTypes = { root: RootNode, theme: ThemeNode, product: ProductNode, hub: HubNode, voice: VoiceNode, vennCircle: VennCircleNode, vennLabel: VennLabelNode };

interface Props {
  view: MapView;
  themes: Theme[];
  insights: Insight[];
  statements: Statement[];
  categories: Category[];
  tour: boolean;
  timing: TourTiming;
}

function MindMapInner({ view, themes, insights, statements, categories, tour, timing }: Props) {
  const flow = useReactFlow();
  const timingRef = useRef(timing);
  timingRef.current = timing;
  const [freshInsights, setFreshInsights] = useState<Set<string>>(new Set());
  const [freshVoices, setFreshVoices] = useState<Set<string>>(new Set());
  const seenInsights = useRef<Set<string> | null>(null);
  const seenVoices = useRef<Set<string> | null>(null);
  const focusUntil = useRef(0);
  const pendingFocus = useRef<string[] | null>(null);
  // Last box centres per view: the next layout starts from them, so the cloud drifts instead of jumping.
  const prev = useRef<Record<MapView, Map<string, { x: number; y: number }>>>({ themes: new Map(), categories: new Map() });

  // Detect newly arrived insights / categorised voices → highlight them and fly the camera there.
  const doneVoiceIds = statements.filter((s) => s.status === "done").map((s) => s.id).join(",");
  useEffect(() => {
    const ins = new Set(insights.map((i) => i.id));
    const voices = new Set(doneVoiceIds ? doneVoiceIds.split(",") : []);
    if (seenInsights.current === null || seenVoices.current === null) {
      seenInsights.current = ins;
      seenVoices.current = voices;
      return;
    }
    const newIns = insights.filter((i) => !seenInsights.current!.has(i.id));
    const newVoices = [...voices].filter((v) => !seenVoices.current!.has(v));
    seenInsights.current = ins;
    seenVoices.current = voices;
    if (!newIns.length && !newVoices.length) return;
    setFreshInsights(new Set(newIns.map((i) => i.id)));
    setFreshVoices(new Set(newVoices));
    const freshMs = timingRef.current.freshSec * 1000;
    focusUntil.current = Date.now() + freshMs;
    pendingFocus.current =
      view === "themes"
        ? newIns.length ? [`group:${newIns[newIns.length - 1].themeId}`] : null
        : newVoices.length ? [`v:${newVoices[newVoices.length - 1]}`] : null;
    const t = setTimeout(() => {
      setFreshInsights(new Set());
      setFreshVoices(new Set());
    }, freshMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insights, doneVoiceIds]);

  const graph = useMemo(() => {
    const g =
      view === "themes"
        ? buildThemeGraph(themes, insights, statements, freshInsights, prev.current.themes)
        : buildCategoryGraph(categories, statements, freshVoices, prev.current.categories);
    prev.current[view] = g.centres;
    return g;
  }, [view, themes, insights, statements, categories, freshInsights, freshVoices]);
  const graphRef = useRef(graph);
  graphRef.current = graph;

  const focusNodes = (key: string) => {
    const g = graphRef.current;
    if (key.startsWith("group:")) return g.groups.find((x) => x.id === key.slice(6))?.nodeIds.map((id) => ({ id })) ?? [];
    // A single voice: show it together with the hubs it links to.
    const linked = g.edges.filter((e) => e.target === key).map((e) => e.source);
    return [key, ...linked].map((id) => ({ id }));
  };

  // Fly to fresh content once the new layout is rendered.
  useEffect(() => {
    if (!pendingFocus.current) return;
    const nodes = focusNodes(pendingFocus.current[0]);
    pendingFocus.current = null;
    if (nodes.length) setTimeout(() => flow.fitView({ nodes, duration: 1400, padding: 0.18, maxZoom: 1.1 }), 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // Overview whenever the view switches.
  useEffect(() => {
    const t = setTimeout(() => flow.fitView({ duration: 1200, padding: 0.06 }), 150);
    return () => clearTimeout(t);
  }, [view, flow]);

  // Camera tour: overview → each group (theme or category) → overview …
  useEffect(() => {
    if (!tour) return;
    let step = -1;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (Date.now() < focusUntil.current) {
        timer = setTimeout(next, focusUntil.current - Date.now());
        return;
      }
      const groups = graphRef.current.groups;
      step = step + 1 > groups.length ? 0 : step + 1;
      if (step === 0 || groups.length === 0) {
        flow.fitView({ duration: 1600, padding: 0.06 });
        timer = setTimeout(next, timingRef.current.overviewSec * 1000);
      } else {
        flow.fitView({ nodes: focusNodes(`group:${groups[step - 1].id}`), duration: 1600, padding: 0.12, maxZoom: 1 });
        timer = setTimeout(next, timingRef.current.themeSec * 1000);
      }
    };
    timer = setTimeout(next, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour, view]);

  return (
    <ReactFlow
      nodes={graph.nodes}
      edges={graph.edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.06 }}
      minZoom={0.03}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
    />
  );
}

export default function MindMap(props: Props) {
  return (
    <ReactFlowProvider>
      <MindMapInner {...props} />
    </ReactFlowProvider>
  );
}
