"use client";
import { useEffect, useState } from "react";
import AiSettingsPanel from "@/components/AiSettingsPanel";
import { useLiveState } from "@/lib/useLiveState";

export default function AdminPage() {
  const state = useLiveState(2500);
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [auth, setAuth] = useState<"checking" | "ok" | "bad">("checking");

  useEffect(() => {
    try { setToken(localStorage.getItem("cv-admin-token") ?? ""); } catch { /* ignore */ }
  }, []);
  const saveToken = (t: string) => {
    setToken(t.trim());
    try { localStorage.setItem("cv-admin-token", t.trim()); } catch { /* ignore */ }
  };

  // Verify the token as it's typed so a wrong one is obvious before any action fails.
  useEffect(() => {
    setAuth("checking");
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin", {
          method: "POST",
          headers: { "content-type": "application/json", "x-admin-token": token },
          body: JSON.stringify({ action: "check" }),
        });
        setAuth(res.ok ? "ok" : "bad");
      } catch {
        setAuth("bad");
      }
    }, 300);
    return () => clearTimeout(t);
  }, [token]);

  async function act(action: string, extra: Record<string, unknown> = {}, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return false;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (action === "regroup" && !json.ok) throw new Error("Omgruppering kräver AI-nyckel och minst en insikt.");
      setMsg(
        action === "test" ? `AI fungerar ✔ (${json.provider}, ${json.model}, ${json.ms} ms): ${json.insights.map((i: { product: string }) => i.product).join(", ") || "inga insikter"}`
        : action === "retry" ? `${json.retried} misslyckade röster köade igen.`
        : action === "seed" ? `${json.added} exempel köade för analys.`
        : action === "regroup" ? (json.ok ? "Teman omgrupperade." : "Omgruppering kräver AI-nyckel och minst en insikt.")
        : action === "reanalyze" ? `${json.queued} röster köade för omsortering.`
        : "Klart.",
      );
      return true;
    } catch (e) {
      setMsg(`Fel: ${e instanceof Error ? e.message : e}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const exportUrl = (format: string) => `/api/export?format=${format}&token=${encodeURIComponent(token)}`;
  const statements = state ? [...state.statements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];

  return (
    <main className="page">
      <h1>Admin</h1>
      <div className="toolbar">
        <label>
          Admin-token{" "}
          <input
            type="password"
            value={token}
            onChange={(e) => saveToken(e.target.value)}
            style={{ padding: 8, borderRadius: 8, border: `2px solid ${auth === "bad" ? "var(--danger)" : "var(--border)"}` }}
          />{" "}
          <b style={{ color: auth === "ok" ? "var(--accent)" : auth === "bad" ? "var(--danger)" : "var(--muted)" }}>
            {auth === "ok" ? "✔ Inloggad" : auth === "bad" ? "✖ Fel token" : "…"}
          </b>
        </label>
        {state && (
          <span>
            {state.demoMode ? "Demo-läge (ingen AI-nyckel)" : `Modell: ${state.model}`} · {state.statements.length} röster · {state.insights.length} insikter ·{" "}
            {state.themes.length} teman · kö: {state.queue}
          </span>
        )}
      </div>
      <div className="toolbar">
        <button className="btn primary" disabled={busy} onClick={() => act("seed")}>Ladda exempel (Dagens Medicin)</button>
        <button className="btn" disabled={busy} onClick={() => act("test")}>Testa AI</button>
        <button className="btn" disabled={busy} onClick={() => act("retry")}>Försök igen med misslyckade</button>
        <a className="btn" href={exportUrl("csv")}>Exportera CSV</a>
        <a className="btn" href={exportUrl("json")}>Exportera JSON</a>
        <button className="btn danger" disabled={busy} onClick={() => act("reset", {}, "Radera ALLA röster och insikter?")}>Rensa allt</button>
      </div>
      {auth === "bad" && (
        <div className="panel" style={{ borderColor: "var(--danger)" }}>
          <b>Ange admin-token för att använda admin.</b>
          <span>
            Skriv värdet av <code>ADMIN_TOKEN</code> från <code>config/secrets.env</code> i fältet ovan (standard i exempelfilen är{" "}
            <code>change-me</code>). Har du ändrat filen? Kör <code>docker compose up -d</code> så att den läses in på nytt.
          </span>
        </div>
      )}
      {msg && <div>{msg}</div>}
      {state && auth === "ok" && (
        <AiSettingsPanel
          token={token}
          demoMode={state.demoMode}
          progress={{
            remaining: state.statements.filter((s) => s.status === "pending" || s.status === "processing").length,
            total: state.statements.length,
          }}
          act={act}
        />
      )}
      <table>
        <thead>
          <tr><th>Röst</th><th>Avsändare</th><th>Insikter</th><th>Status</th><th /></tr>
        </thead>
        <tbody>
          {statements.map((s) => (
            <tr key={s.id}>
              <td style={{ maxWidth: 460 }}>{s.text}</td>
              <td>{[s.author, s.role].filter(Boolean).join(", ")}<div className="status">{s.source === "example" ? "exempel" : "kiosk"}</div></td>
              <td>
                {state!.insights.filter((i) => i.statementId === s.id).map((i) => (
                  <div key={i.id} style={{ marginBottom: 6 }}>
                    <span className={`pill ${i.productStatus}`}>{i.productStatus === "current" ? "B" : "F"}</span> <b>{i.product}</b>: {i.need}
                  </div>
                ))}
              </td>
              <td className={`status ${s.status}`}>
                {s.status}
                {s.error && <div style={{ fontWeight: 400, maxWidth: 260 }}>{s.error}</div>}
              </td>
              <td><button className="btn danger" disabled={busy} onClick={() => act("delete", { id: s.id }, "Ta bort rösten?")}>Ta bort</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
