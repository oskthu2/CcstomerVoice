"use client";
import { useEffect, useRef, useState } from "react";
import type { WallSettings, WallTheme } from "@/lib/settings";

interface Props {
  token: string;
  /** Current values as served to the wall (from /api/state). */
  current: WallSettings;
}

const THEMES: { value: WallTheme; label: string }[] = [
  { value: "dark", label: "Mörkt" },
  { value: "light", label: "Ljust" },
  { value: "auto", label: "Följ webbläsaren" },
];

const SLIDERS: { key: "overviewSec" | "themeSec" | "freshSec"; label: string; hint: string }[] = [
  { key: "overviewSec", label: "Översikt", hint: "hur länge hela kartan visas" },
  { key: "themeSec", label: "Per tema", hint: "hur länge kameran stannar på varje tema" },
  { key: "freshSec", label: "Ny röst", hint: "hur länge en ny röst lyfts fram" },
];

/** Changes save automatically; the wall picks them up on its next poll (~2 s). */
export default function WallSettingsPanel({ token, current }: Props) {
  const [draft, setDraft] = useState<WallSettings>(current);
  const [status, setStatus] = useState("");
  const editing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Follow external changes (e.g. another admin tab) unless the user is mid-edit.
  useEffect(() => {
    if (!editing.current) setDraft(current);
  }, [current]);

  function update(patch: Partial<WallSettings>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    editing.current = true;
    setStatus("Sparar …");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: { "content-type": "application/json", "x-admin-token": token },
          body: JSON.stringify({ settings: { wall: next } }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setDraft(json.settings.wall);
        setStatus("Sparat ✔ – väggen uppdateras inom några sekunder.");
      } catch (e) {
        setStatus(`Fel: ${e instanceof Error ? e.message : e}`);
      } finally {
        editing.current = false;
      }
    }, 400);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Väggen</h2>
        <a className="note" href="/wall" target="_blank" rel="noreferrer">Öppna väggen ↗</a>
      </div>

      <div className="field">
        <span>Utseende</span>
        <div className="segmented">
          {THEMES.map((t) => (
            <button key={t.value} className={draft.theme === t.value ? "on" : ""} onClick={() => update({ theme: t.value })}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Rundturens tempo</span>
        {SLIDERS.map((s) => (
          <label key={s.key} className="slider">
            <span>
              {s.label} <small>{s.hint}</small>
            </span>
            <input type="range" min={3} max={120} value={draft[s.key]} onChange={(e) => update({ [s.key]: Number(e.target.value) })} />
            <b>{draft[s.key]} s</b>
          </label>
        ))}
      </div>
      <p className="note">Mellanslag på väggen pausar och startar rundturen.</p>
      {status && <p className="note">{status}</p>}
    </section>
  );
}
