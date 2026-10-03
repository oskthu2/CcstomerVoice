"use client";
import { useCallback, useEffect, useState } from "react";

interface Settings {
  analyzeInstructions: string;
  regroupInstructions: string;
  maxThemes: number;
  maxInsights: number;
}
interface Payload {
  settings: Settings;
  defaults: Settings;
  preview: { analyze: string; regroup: string };
}

interface Props {
  token: string;
  demoMode: boolean;
  /** Statements still waiting for (re-)analysis, and the total. */
  progress: { remaining: number; total: number };
  act: (action: string, extra?: Record<string, unknown>, confirmText?: string) => Promise<boolean>;
}

export default function AiSettingsPanel({ token, demoMode, progress, act }: Props) {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [regroupAfter, setRegroupAfter] = useState(true);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus("");
    const res = await fetch("/api/settings", { headers: { "x-admin-token": token }, cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      setStatus(json.error ?? "Kunde inte läsa inställningarna.");
      return;
    }
    setData(json);
    setDraft(json.settings);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    setData(json);
    setDraft(json.settings);
  }

  async function save(then?: "reanalyze" | "regroup") {
    if (!draft) return;
    if (then === "reanalyze" && !confirm(`Sortera om alla ${progress.total} röster med de nya instruktionerna? Det gör ett AI-anrop per röst.`)) return;
    setBusy(true);
    try {
      await post({ settings: draft });
      setStatus("Instruktionerna är sparade och gäller för nya röster.");
      if (then === "reanalyze") {
        setStatus((await act("reanalyze", { regroupAfter }))
          ? `Sparat. Sorterar om ${progress.total} röster – väggen uppdateras löpande.`
          : "Sparat, men omsorteringen kunde inte startas (se meddelandet ovan).");
      }
      if (then === "regroup") {
        setStatus((await act("regroup")) ? "Sparat och teman omgrupperade." : "Sparat, men omgrupperingen misslyckades (se meddelandet ovan).");
      }
    } catch (e) {
      setStatus(`Fel: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!confirm("Återställ AI-instruktionerna till standard?")) return;
    setBusy(true);
    try {
      await post({ action: "reset" });
      setStatus("Återställt till standardinstruktionerna.");
    } catch (e) {
      setStatus(`Fel: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  if (!draft || !data) {
    return (
      <section className="panel">
        <h2>AI-instruktioner</h2>
        <p>{status || "Laddar …"}</p>
        {status && <button className="btn" onClick={load}>Försök igen</button>}
      </section>
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings);
  const isDefault = JSON.stringify(data.settings) === JSON.stringify(data.defaults);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft({ ...draft, [k]: v });
  const sorting = progress.remaining > 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>AI-instruktioner</h2>
        <span className="note">
          {dirty ? "● Osparade ändringar" : isDefault ? "Standardinstruktioner" : "Egna instruktioner"}
        </span>
      </div>
      {demoMode && <p className="warn">Demo-läge: instruktionerna används först när en AI-nyckel är konfigurerad.</p>}

      <label className="field">
        <span>Sortering av röster: instruktion för varje röst</span>
        <textarea rows={16} value={draft.analyzeInstructions} onChange={(e) => set("analyzeInstructions", e.target.value)} />
      </label>
      <label className="field">
        <span>Omgruppering av teman</span>
        <textarea rows={5} value={draft.regroupInstructions} onChange={(e) => set("regroupInstructions", e.target.value)} />
      </label>
      <div className="row-fields">
        <label className="field small">
          <span>Max antal teman <code>{"{maxThemes}"}</code></span>
          <input type="number" min={2} max={20} value={draft.maxThemes} onChange={(e) => set("maxThemes", Number(e.target.value))} />
        </label>
        <label className="field small">
          <span>Max insikter per röst <code>{"{maxInsights}"}</code></span>
          <input type="number" min={1} max={10} value={draft.maxInsights} onChange={(e) => set("maxInsights", Number(e.target.value))} />
        </label>
      </div>
      <p className="note">
        Produktkatalogen, befintliga teman och JSON-svarsformatet läggs alltid till automatiskt efter din text, så dem behöver du inte skriva.
      </p>

      <div className="toolbar">
        <button className="btn primary" disabled={busy || !dirty} onClick={() => save()}>Spara</button>
        <button className="btn" disabled={busy || sorting || progress.total === 0} onClick={() => save("reanalyze")}>
          {dirty ? "Spara och sortera om alla röster" : "Sortera om alla röster"}
        </button>
        <label className="note">
          <input type="checkbox" checked={regroupAfter} onChange={(e) => setRegroupAfter(e.target.checked)} /> gruppera om teman när det är klart
        </label>
        <button className="btn" disabled={busy || sorting} onClick={() => save("regroup")}>
          {dirty ? "Spara och gruppera om teman" : "Gruppera om teman"}
        </button>
        <button className="btn" disabled={busy || !dirty} onClick={() => setDraft(data.settings)}>Ångra ändringar</button>
        <button className="btn danger" disabled={busy || isDefault} onClick={reset}>Återställ standard</button>
      </div>

      {sorting && (
        <div className="progress">
          <div style={{ width: `${(100 * (progress.total - progress.remaining)) / Math.max(progress.total, 1)}%` }} />
          <span>Sorterar: {progress.total - progress.remaining} av {progress.total} röster klara</span>
        </div>
      )}
      {status && <p>{status}</p>}

      <details>
        <summary>Visa hela prompten som skickas till AI:n (sparad version)</summary>
        <h3>Per röst</h3>
        <pre>{data.preview.analyze}</pre>
        <h3>Omgruppering</h3>
        <pre>{data.preview.regroup}</pre>
      </details>
    </section>
  );
}
