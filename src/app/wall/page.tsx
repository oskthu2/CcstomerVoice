"use client";
import dynamic from "next/dynamic";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { who } from "@/lib/format";
import { useLiveState } from "@/lib/useLiveState";
import type { MapView } from "@/components/MindMap";

const MindMap = dynamic(() => import("@/components/MindMap"), { ssr: false });

export default function WallPage() {
  const state = useLiveState(2000);
  const [tour, setTour] = useState(true);
  const [inputUrl, setInputUrl] = useState("");
  // Manual override from ?view= or the V key; otherwise the admin setting decides.
  const [override, setOverride] = useState<MapView | null>(null);
  const [alternate, setAlternate] = useState<MapView>("themes");
  const viewRef = useRef<MapView>("themes");

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("tour") === "0") setTour(false);
    const v = q.get("view");
    if (v === "themes" || v === "categories") setOverride(v);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") setTour((t) => !t);
      if (e.code === "KeyV") setOverride(viewRef.current === "themes" ? "categories" : "themes");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setInputUrl(state?.inputUrl || `${location.origin}/input`);
  }, [state?.inputUrl]);

  // "Both": alternate between the two views.
  const mode = state?.wall?.view ?? "themes";
  const viewSec = state?.wall?.viewSec ?? 90;
  useEffect(() => {
    if (mode !== "both" || override) return;
    const t = setInterval(() => setAlternate((v) => (v === "themes" ? "categories" : "themes")), viewSec * 1000);
    return () => clearInterval(t);
  }, [mode, viewSec, override]);

  function currentView(): MapView {
    return override ?? (mode === "both" ? alternate : mode);
  }
  const view = currentView();
  viewRef.current = view;

  const themeClass = `wall theme-${state?.wall?.theme ?? "dark"}`;
  if (!state) return <div className={themeClass} />;

  const products = new Set(state.insights.map((i) => i.product));
  const future = new Set(state.insights.filter((i) => i.productStatus === "future").map((i) => i.product));
  const latest = [...state.statements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const hasContent = view === "themes" ? state.insights.length > 0 : state.statements.some((s) => s.status === "done");
  const catNames = new Map(state.categories.map((c) => [c.id, c]));

  return (
    <div className={themeClass}>
      <div style={{ position: "relative" }}>
        {!hasContent ? (
          <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 32, color: "var(--muted)" }}>
            Väntar på de första rösterna …
          </div>
        ) : (
          <MindMap
            view={view}
            themes={state.themes}
            insights={state.insights}
            statements={state.statements}
            categories={state.categories}
            tour={tour}
            timing={state.wall}
          />
        )}
        <div className="wall-hint">
          {tour ? "Rundtur pågår – mellanslag pausar" : "Rundtur pausad – mellanslag startar"} · V byter vy
        </div>
      </div>
      <aside className="wall-side">
        <div>
          <h1 className="wall-title">Vårdens digitala vägval</h1>
          <p className="wall-sub">{view === "themes" ? "Vad kan Inera lösa – i dag och i morgon?" : "Vem berörs? Varje röst kopplad till sina kategorier"}</p>
        </div>
        {state.demoMode && <div className="badge-demo">Demo-läge: ingen AI-nyckel konfigurerad, nyckelordsmatchning används.</div>}
        {view === "themes" ? (
          <div className="wall-stats">
            <div className="wall-stat"><b>{state.statements.length}</b><span>röster</span></div>
            <div className="wall-stat"><b>{products.size - future.size}</b><span>befintliga tjänster</span></div>
            <div className="wall-stat"><b>{future.size}</b><span>framtida idéer</span></div>
          </div>
        ) : (
          <div className="wall-legend">
            {state.categories.map((c) => (
              <div key={c.id} className="legend-row">
                <span className="swatch" style={{ background: c.color }} />
                <b>{c.name}</b>
                <span>{state.statements.filter((s) => s.categories?.includes(c.id)).length} röster</span>
              </div>
            ))}
          </div>
        )}
        {state.queue > 0 && <div className="wall-sub">AI:n analyserar {state.queue} {state.queue === 1 ? "röst" : "röster"} …</div>}
        {state.categorizing && <div className="wall-sub">Kategoriserar om: {state.categorizing.done} av {state.categorizing.total} …</div>}
        <div className="feed">
          {latest.map((s) => {
            const tags = state.insights.filter((i) => i.statementId === s.id);
            return (
              <div className="feed-item" key={s.id}>
                ”{s.text.length > 180 ? s.text.slice(0, 180) + " …" : s.text}”
                <div className="who">{who(s)}</div>
                <div className="tags">
                  {s.status !== "done" && <span className="tag">{s.status === "error" ? "fel vid analys" : "analyseras …"}</span>}
                  {view === "themes"
                    ? tags.map((t) => (
                        <span key={t.id} className="tag" style={{ borderColor: t.productStatus === "current" ? "var(--current)" : "var(--future)" }}>
                          {t.product}
                        </span>
                      ))
                    : (s.categories ?? []).map((id) => catNames.get(id) && (
                        <span key={id} className="tag" style={{ borderColor: catNames.get(id)!.color }}>{catNames.get(id)!.name}</span>
                      ))}
                </div>
              </div>
            );
          })}
        </div>
        {inputUrl && (
          <div className="qr">
            <QRCodeSVG value={inputUrl} size={104} />
            <p>
              Lämna din röst!
              <small>{inputUrl}</small>
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
