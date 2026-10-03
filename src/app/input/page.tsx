"use client";
import { useEffect, useRef, useState } from "react";

interface ResultInsight {
  id: string;
  need: string;
  product: string;
  productStatus: "current" | "future";
  theme?: string;
  rationale?: string;
}

type Phase = "form" | "sending" | "result";
const RESET_AFTER_MS = 30_000;

// Minimal typing for the browser Web Speech API (Chrome/Edge/Safari).
type SpeechRec = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

export default function InputPage() {
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [role, setRole] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState("");
  const [prefillNote, setPrefillNote] = useState("");
  const [insights, setInsights] = useState<ResultInsight[] | null>(null);
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const lastExample = useRef(-1);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSpeechSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  // Kiosk: go back to an empty form automatically after showing the result.
  useEffect(() => {
    if (phase !== "result") return;
    const t = setTimeout(reset, RESET_AFTER_MS);
    return () => clearTimeout(t);
  }, [phase]);

  function reset() {
    setText(""); setAuthor(""); setRole(""); setError(""); setPrefillNote("");
    setInsights(null); setPhase("form");
  }

  async function prefill() {
    setError("");
    try {
      const res = await fetch(`/api/examples/random?exclude=${lastExample.current}`, { cache: "no-store" });
      const v = await res.json();
      lastExample.current = v.index;
      setText(v.text); setAuthor(v.author); setRole(v.role);
      setPrefillNote(`Exempel ${v.index + 1}/${v.total} ur Dagens Medicin, ”Vårdens digitala vägval – 60 röster inför valet 2026”.`);
    } catch {
      setError("Kunde inte hämta ett exempel.");
    }
  }

  function toggleMic() {
    if (listening) { recRef.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Rec = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Rec) return;
    const rec = new Rec();
    rec.lang = "sv-SE"; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => {
      let chunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) chunk += e.results[i][0].transcript;
      if (chunk) setText((t) => (t ? t.trimEnd() + " " : "") + chunk.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = (e) => { setListening(false); setError(`Taligenkänning: ${e.error}`); };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  async function submit() {
    recRef.current?.stop();
    setError("");
    setPhase("sending");
    try {
      const res = await fetch("/api/statements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, author, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Något gick fel.");
      setPhase("result");
      // Poll until the AI has analysed the statement.
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const r = await fetch(`/api/statements/${json.id}`, { cache: "no-store" });
        if (!r.ok) break;
        const d = await r.json();
        if (d.statement.status === "done" || d.statement.status === "error") {
          setInsights(d.insights);
          break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("form");
    }
  }

  if (phase === "result") {
    return (
      <main className="kiosk">
        <div className="kiosk-card">
          <h1>Tack för din röst!</h1>
          <p className="lead">Titta på storskärmen – din röst sorteras just nu in i tankekartan.</p>
          <div className="result">
            {insights === null && <p>AI:n analyserar ditt uttalande …</p>}
            {insights?.length === 0 && <p>Vi har sparat din röst. AI:n hittade ingen direkt koppling till en Inera-produkt den här gången.</p>}
            {insights?.map((i) => (
              <div key={i.id} className={`result-item ${i.productStatus}`}>
                <span className={`pill ${i.productStatus}`}>{i.productStatus === "current" ? "Befintlig" : "Framtida"}</span>{" "}
                <b>{i.product}</b>
                <div>{i.need}</div>
                {i.theme && <div className="note">Tema: {i.theme}</div>}
              </div>
            ))}
          </div>
          <div className="actions">
            <button className="btn primary" onClick={reset}>Lämna en till röst</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="kiosk">
      <div className="kiosk-card">
        <h1>Vad är viktigast för vårdens digitalisering?</h1>
        <p className="lead">Berätta om ett behov, ett problem eller en idé. AI:n kopplar din röst till befintliga och framtida Inera-tjänster – live på storskärmen.</p>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setPrefillNote(""); }}
          placeholder="Skriv här, eller tryck på mikrofonen och prata …"
          maxLength={2000}
        />
        {prefillNote && <div className="note">{prefillNote}</div>}
        <div className="row">
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Namn (valfritt)" maxLength={80} />
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Roll / organisation (valfritt)" maxLength={120} />
        </div>
        {error && <div className="error">{error}</div>}
        <div className="actions">
          {speechSupported && (
            <button className={`btn ${listening ? "rec" : ""}`} onClick={toggleMic} type="button">
              {listening ? "■ Stoppa inspelning" : "🎤 Prata"}
            </button>
          )}
          <button className="btn" onClick={prefill} type="button" title="Fyll i en slumpad röst ur Dagens Medicin-artikeln">
            🎲 Förifyll
          </button>
          <span className="spacer" />
          <button className="btn primary" onClick={submit} disabled={phase === "sending" || text.trim().length < 5}>
            {phase === "sending" ? "Skickar …" : "Skicka in"}
          </button>
        </div>
        <p className="note">Skriv inga personuppgifter om patienter. Röster visas på storskärmen och används i Ineras produktutveckling.</p>
      </div>
    </main>
  );
}
