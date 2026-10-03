"use client";
import dynamic from "next/dynamic";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { useLiveState } from "@/lib/useLiveState";

const MindMap = dynamic(() => import("@/components/MindMap"), { ssr: false });

export default function WallPage() {
  const state = useLiveState(2000);
  const [tour, setTour] = useState(true);
  const [inputUrl, setInputUrl] = useState("");

  useEffect(() => {
    if (new URLSearchParams(location.search).get("tour") === "0") setTour(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") setTour((t) => !t);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setInputUrl(state?.inputUrl || `${location.origin}/input`);
  }, [state?.inputUrl]);

  if (!state) return <div className="wall" />;

  const products = new Set(state.insights.map((i) => i.product));
  const future = new Set(state.insights.filter((i) => i.productStatus === "future").map((i) => i.product));
  const latest = [...state.statements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  return (
    <div className="wall">
      <div style={{ position: "relative" }}>
        {state.insights.length === 0 ? (
          <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 32, color: "var(--muted)" }}>
            Väntar på de första rösterna …
          </div>
        ) : (
          <MindMap themes={state.themes} insights={state.insights} statements={state.statements} tour={tour} />
        )}
        <div className="wall-hint">{tour ? "Rundtur pågår – mellanslag pausar" : "Rundtur pausad – mellanslag startar"}</div>
      </div>
      <aside className="wall-side">
        <div>
          <h1 className="wall-title">Vårdens digitala vägval</h1>
          <p className="wall-sub">Vad kan Inera lösa – i dag och i morgon?</p>
        </div>
        {state.demoMode && <div className="badge-demo">Demo-läge: ingen AI-nyckel konfigurerad, nyckelordsmatchning används.</div>}
        <div className="wall-stats">
          <div className="wall-stat"><b>{state.statements.length}</b><span>röster</span></div>
          <div className="wall-stat"><b>{products.size - future.size}</b><span>befintliga tjänster</span></div>
          <div className="wall-stat"><b>{future.size}</b><span>framtida idéer</span></div>
        </div>
        {state.queue > 0 && <div className="wall-sub">AI:n analyserar {state.queue} {state.queue === 1 ? "röst" : "röster"} …</div>}
        <div className="feed">
          {latest.map((s) => {
            const tags = state.insights.filter((i) => i.statementId === s.id);
            return (
              <div className="feed-item" key={s.id}>
                ”{s.text.length > 180 ? s.text.slice(0, 180) + " …" : s.text}”
                <div className="who">{[s.author, s.role].filter(Boolean).join(", ") || "Anonym besökare"}</div>
                <div className="tags">
                  {s.status !== "done" && <span className="tag">{s.status === "error" ? "fel vid analys" : "analyseras …"}</span>}
                  {tags.map((t) => (
                    <span key={t.id} className="tag" style={{ borderColor: t.productStatus === "current" ? "var(--current)" : "var(--future)" }}>
                      {t.product}
                    </span>
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
