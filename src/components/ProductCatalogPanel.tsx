"use client";
import { useCallback, useEffect, useState } from "react";
import type { Product } from "@/lib/types";

interface Row {
  key: number;
  name: string;
  status: "current" | "future";
  aliases: string;
  description: string;
}

interface Props {
  token: string;
  voices: number;
  /** True while a re-sort is running. */
  sorting: boolean;
  act: (action: string, extra?: Record<string, unknown>, confirmText?: string) => Promise<boolean>;
}

let nextKey = 1;
const toRows = (products: Product[]): Row[] =>
  products.map((p) => ({
    key: nextKey++,
    name: p.name,
    status: p.status,
    aliases: (p.aliases ?? []).join(", "),
    description: p.description ?? "",
  }));
const toProducts = (rows: Row[]) =>
  rows.map((r) => ({
    name: r.name,
    status: r.status,
    description: r.description,
    aliases: r.aliases.split(",").map((a) => a.trim()).filter(Boolean),
  }));

export default function ProductCatalogPanel({ token, voices, sorting, act }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saved, setSaved] = useState("");
  const [source, setSource] = useState<"admin" | "config">("config");
  const [filter, setFilter] = useState<"all" | "current" | "future">("all");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = (json: { products: Product[]; source: "admin" | "config" }) => {
    const r = toRows(json.products);
    setRows(r);
    setSaved(JSON.stringify(toProducts(r)));
    setSource(json.source);
  };

  const load = useCallback(async () => {
    const res = await fetch("/api/products", { headers: { "x-admin-token": token }, cache: "no-store" });
    const json = await res.json();
    if (res.ok) apply(json);
    else setStatus(json.error);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": token },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    apply(json);
  }

  async function save(reanalyze = false) {
    if (!rows) return;
    const dirty = JSON.stringify(toProducts(rows)) !== saved;
    if (reanalyze && !confirm(`Spara katalogen och sortera om alla ${voices} röster?`)) return;
    setBusy(true);
    try {
      if (dirty) {
        await post({ products: toProducts(rows) });
        setStatus("Katalogen är sparad och används för nya röster.");
      }
      if (reanalyze && (await act("reanalyze", { regroupAfter: true }))) setStatus(`Sparat. Sorterar om ${voices} röster med den nya katalogen.`);
    } catch (e) {
      setStatus(`Fel: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!confirm("Kasta ändringarna i admin och använd config/inera-products.json igen?")) return;
    setBusy(true);
    try {
      await post({ action: "reset" });
      setStatus("Återställt till config/inera-products.json.");
    } catch (e) {
      setStatus(`Fel: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  if (!rows) {
    return (
      <section className="panel">
        <h2>Produktkatalog</h2>
        <p>{status || "Laddar …"}</p>
      </section>
    );
  }

  const dirty = JSON.stringify(toProducts(rows)) !== saved;
  const edit = (key: number, patch: Partial<Row>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const shown = rows.filter((r) => filter === "all" || r.status === filter);
  const count = (s: Row["status"]) => rows.filter((r) => r.status === s).length;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Produktkatalog</h2>
        <span className="note">
          {dirty ? "● Osparade ändringar" : source === "admin" ? "Redigerad i admin" : "Från config/inera-products.json"}
        </span>
      </div>
      <p className="note">
        AI:n kopplar röster till de här produkterna. <b>Befintliga</b> är dagens tjänster, <b>framtida</b> är idéer som AI:n kan återanvända
        (den kan också föreslå nya). Alias hjälper AI:n att känna igen andra namn för samma tjänst.
      </p>

      <div className="segmented">
        {(["all", "current", "future"] as const).map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {f === "all" ? `Alla (${rows.length})` : f === "current" ? `Befintliga (${count("current")})` : `Framtida (${count("future")})`}
          </button>
        ))}
      </div>

      <div className="catalog">
        <div className="catalog-row head">
          <span>Namn</span>
          <span>Status</span>
          <span>Alias (kommaseparerade)</span>
          <span>Beskrivning</span>
          <span />
        </div>
        {shown.map((r) => (
          <div className="catalog-row" key={r.key}>
            <input value={r.name} placeholder="Produktnamn" onChange={(e) => edit(r.key, { name: e.target.value })} />
            <select value={r.status} onChange={(e) => edit(r.key, { status: e.target.value as Row["status"] })}>
              <option value="current">Befintlig</option>
              <option value="future">Framtida</option>
            </select>
            <input value={r.aliases} placeholder="t.ex. 1177.se, Vårdguiden" onChange={(e) => edit(r.key, { aliases: e.target.value })} />
            <input value={r.description} placeholder="Vad produkten gör" onChange={(e) => edit(r.key, { description: e.target.value })} />
            <button className="btn danger" title="Ta bort" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>✕</button>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <button
          className="btn"
          onClick={() => {
            setFilter("all");
            setRows([...rows, { key: nextKey++, name: "", status: filter === "future" ? "future" : "current", aliases: "", description: "" }]);
          }}
        >
          + Lägg till produkt
        </button>
        <button className="btn primary" disabled={busy || !dirty} onClick={() => save()}>Spara katalog</button>
        <button className="btn" disabled={busy || sorting || voices === 0} onClick={() => save(true)}>
          {dirty ? "Spara och sortera om alla röster" : "Sortera om alla röster"}
        </button>
        <button className="btn" disabled={busy || !dirty} onClick={load}>Ångra ändringar</button>
        <button className="btn danger" disabled={busy || source === "config"} onClick={reset}>Återställ till config-filen</button>
      </div>
      {status && <p>{status}</p>}
    </section>
  );
}
