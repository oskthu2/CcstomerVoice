"use client";
import "@xyflow/react/dist/style.css";
import { Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildGraph, type ProductData, type RootData, type ThemeData } from "@/lib/layout";
import type { Insight, Statement, Theme } from "@/lib/types";

/** Camera tour pacing in seconds (set from /admin). */
export interface TourTiming {
  overviewSec: number;
  themeSec: number;
  freshSec: number;
}

const inner = (side: string) => (side === "right" ? Position.Left : Position.Right);
const outer = (side: string) => (side === "right" ? Position.Right : Position.Left);

function RootNode({ data }: NodeProps<Node<RootData>>) {
  return (
    <div className="mm-root">
      {data.title}
      <small>{data.subtitle}</small>
      <Handle type="source" id="right" position={Position.Right} />
      <Handle type="source" id="left" position={Position.Left} />
    </div>
  );
}

function ThemeNode({ data }: NodeProps<Node<ThemeData>>) {
  return (
    <div className="mm-theme" style={{ background: data.color }}>
      {data.name}
      <small>{data.count} behov</small>
      <Handle type="target" id={data.side} position={inner(data.side)} />
      <Handle type="source" id={data.side} position={outer(data.side)} />
    </div>
  );
}

function ProductNode({ data }: NodeProps<Node<ProductData>>) {
  return (
    <div className={`mm-product ${data.status} ${data.fresh ? "fresh" : ""}`} style={{ borderColor: data.fresh ? undefined : data.color }}>
      <header>
        <h3>{data.name}</h3>
        <div className="meta">
          <span className={`pill ${data.status}`}>{data.status === "current" ? "Befintlig" : "Framtida"}</span>
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
      <Handle type="target" id={data.side} position={inner(data.side)} />
    </div>
  );
}

const nodeTypes = { root: RootNode, theme: ThemeNode, product: ProductNode };

interface Props {
  themes: Theme[];
  insights: Insight[];
  statements: Statement[];
  tour: boolean;
  timing: TourTiming;
}

function MindMapInner({ themes, insights, statements, tour, timing }: Props) {
  const timingRef = useRef(timing);
  timingRef.current = timing;
  const flow = useReactFlow();
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);
  const focusUntil = useRef(0);

  // Detect newly arrived insights → highlight them and fly the camera there.
  useEffect(() => {
    const ids = new Set(insights.map((i) => i.id));
    if (seen.current === null) {
      seen.current = ids;
      return;
    }
    const added = insights.filter((i) => !seen.current!.has(i.id));
    seen.current = ids;
    if (!added.length) return;
    setFresh(new Set(added.map((i) => i.id)));
    const themeId = added[added.length - 1].themeId;
    const freshMs = timingRef.current.freshSec * 1000;
    focusUntil.current = Date.now() + freshMs;
    setTimeout(() => flow.fitView({ nodes: focusNodes(themeId), duration: 1400, padding: 0.12, maxZoom: 1 }), 150);
    const t = setTimeout(() => setFresh(new Set()), freshMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insights]);

  const { nodes, edges, themeIds } = useMemo(() => buildGraph(themes, insights, statements, fresh), [themes, insights, statements, fresh]);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  function focusNodes(themeId: string) {
    const tid = themeId.startsWith("t:") ? themeId : `t:${themeId}`;
    return nodesRef.current.filter((n) => n.id === tid || n.id.startsWith(`p:${tid.slice(2)}:`)).map((n) => ({ id: n.id }));
  }

  // Camera tour: overview → each theme in turn → overview …
  const themeIdsRef = useRef(themeIds);
  themeIdsRef.current = themeIds;
  useEffect(() => {
    if (!tour) return;
    let step = -1;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (Date.now() < focusUntil.current) {
        timer = setTimeout(next, focusUntil.current - Date.now());
        return;
      }
      const ids = themeIdsRef.current;
      step = step + 1 > ids.length ? 0 : step + 1;
      if (step === 0 || ids.length === 0) {
        flow.fitView({ duration: 1600, padding: 0.06 });
        timer = setTimeout(next, timingRef.current.overviewSec * 1000);
      } else {
        flow.fitView({ nodes: focusNodes(ids[step - 1]), duration: 1600, padding: 0.12, maxZoom: 1 });
        timer = setTimeout(next, timingRef.current.themeSec * 1000);
      }
    };
    timer = setTimeout(next, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.06 }}
      minZoom={0.05}
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
