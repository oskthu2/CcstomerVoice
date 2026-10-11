"use client";
import { useEffect, useState } from "react";
import type { Category } from "@/lib/types";

/** Texts and limits for the two lists this panel edits. */
const KINDS = {
  categories: {
    title: "Kategorier",
    intro:
      "AI:n kopplar varje röst till en eller flera av de här kategorierna. De visas i väggens kategorivy (venndiagram med upp till tre kategorier). Beskrivningen styr hur AI:n tolkar kategorin. Om du byter namn behåller rösterna sina kopplingar. Nya eller ändrade kategorier gäller för befintliga röster först när du kategoriserar om dem.",
    add: "+ Lägg till kategori",
    save: "Spara kategorier",
    redo: "Kategorisera om alla röster",
    action: "recategorize",
    max: 8,
    itemWord: "röster",
    confirm: (n: number) => `Kategorisera om alla ${n} röster med de här kategorierna? AI:n går igenom dem i omgångar om 30.`,
    progress: "Kategoriserar",
    placeholder: "t.ex. Patienter",
  },
  benefits: {
    title: "Nyttor",
    intro:
      "AI:n bedömer om varje behov pekar på en nytta som kan tillgodogöras, och i så fall vilken. För ekonomisk nytta anges också om den främst frigör tid eller resurser. Ett kort på väggens värdevy får en nytta när minst en tredjedel av dess behov pekar på den. Högst tre nyttor, eftersom de visas som ett venndiagram.",
    add: "+ Lägg till nytta",
    save: "Spara nyttor",
    redo: "Bedöm nytta för alla behov",
    action: "reassessBenefits",
    max: 3,
    itemWord: "behov",
    confirm: (n: number) => `Bedöm nyttan för alla ${n} behov igen? AI:n går igenom dem i omgångar om 30.`,
    progress: "Bedömer",
    placeholder: "t.ex. Kvalitet & patientsäkerhet",
  },
} as const;

interface Props {
  kind?: keyof typeof KINDS;
  token: string;
  /** Current categories as served to the wall. */
  current: Category[];
  voices: number;
  categorizing: { done: number; total: number } | null;
  act: (action: string, extra?: Record<string, unknown>, confirmText?: string) => Promise<boolean>;
}

const PALETTE = ["#19a7a8", "#d9622b", "#8a4fd1", "#3b82f6", "#c99a06", "#d6335a", "#5f9a1f", "#0e8fa8"];
let nextKey = 1;
type Row = Category & { key: number };
const toRows = (cs: Category[]): Row[] => cs.map((c) => ({ ...c, key: nextKey++ }));
const strip = (rows: Row[]): Category[] => rows.map(({ key: _key, ...c }) => c);

/** Edit the predefined categories every voice is linked to in the alternative wall view. */
export default function CategoriesPanel({ kind = "categories", token, current, voices, categorizing, act }: Props) {
  const K = KINDS[kind];
  const [rows, setRows] = useState<Row[]>(toRows(current));
  const [saved, setSaved] = useState(JSON.stringify(current));
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const dirty = JSON.stringify(strip(rows)) !== saved;
  // Follow changes made elsewhere unless there are unsaved edits here.
  useEffect(() => {
    if (!dirty && JSON.stringify(current) !== saved) {
      setRows(toRows(current));
      setSaved(JSON.stringify(current));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const edit = (key: number, patch: Partial<Category>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function save(recategorize: boolean) {
    if (recategorize && !confirm(K.confirm(voices))) return;
    setBusy(true);
    try {
      if (dirty) {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: { "content-type": "application/json", "x-admin-token": token },
          body: JSON.stringify({ settings: { [kind]: strip(rows) } }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setRows(toRows(json.settings[kind]));
        setSaved(JSON.stringify(json.settings[kind]));
        setStatus(`${K.title} är sparade och används för nya röster.`);
      }
      if (recategorize && (await act(K.action))) setStatus(`${K.progress} ${voices} ${K.itemWord} – väggen uppdateras löpande.`);
    } catch (e) {
      setStatus(`Fel: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{K.title}</h2>
        <span className="note">{dirty ? "● Osparade ändringar" : `${rows.length} ${K.title.toLowerCase()}`}</span>
      </div>
      <p className="note">{K.intro}</p>

      <div className="catalog">
        <div className="catalog-row head cat-row">
          <span>Färg</span>
          <span>Namn</span>
          <span>Beskrivning (för AI:n)</span>
          <span />
        </div>
        {rows.map((r) => (
          <div className="catalog-row cat-row" key={r.key}>
            <input type="color" value={r.color} onChange={(e) => edit(r.key, { color: e.target.value })} aria-label="Färg" />
            <input value={r.name} placeholder={K.placeholder} onChange={(e) => edit(r.key, { name: e.target.value })} />
            <input value={r.description} placeholder="Vad som hör till kategorin" onChange={(e) => edit(r.key, { description: e.target.value })} />
            <button className="btn danger" title="Ta bort" disabled={rows.length <= 1} onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>✕</button>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <button
          className="btn"
          disabled={rows.length >= K.max}
          onClick={() => setRows([...rows, { key: nextKey++, id: "", name: "", description: "", color: PALETTE[rows.length % PALETTE.length] }])}
        >
          {K.add}
        </button>
        <button className="btn primary" disabled={busy || !dirty} onClick={() => save(false)}>{K.save}</button>
        <button className="btn" disabled={busy || Boolean(categorizing) || voices === 0} onClick={() => save(true)}>
          {dirty ? `Spara och ${K.redo.charAt(0).toLowerCase()}${K.redo.slice(1)}` : K.redo}
        </button>
        <button className="btn" disabled={busy || !dirty} onClick={() => setRows(toRows(JSON.parse(saved)))}>Ångra ändringar</button>
      </div>
      {categorizing && (
        <div className="progress">
          <div style={{ width: `${(100 * categorizing.done) / Math.max(categorizing.total, 1)}%` }} />
          <span>{K.progress}: {categorizing.done} av {categorizing.total} {K.itemWord} klara</span>
        </div>
      )}
      {status && <p>{status}</p>}
    </section>
  );
}
