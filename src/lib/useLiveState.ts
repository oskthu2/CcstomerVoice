"use client";
import { useEffect, useRef, useState } from "react";
import type { Insight, Statement, Theme } from "./types";

export interface LiveState {
  version: number;
  queue: number;
  demoMode: boolean;
  model: string | null;
  inputUrl: string;
  statements: Statement[];
  insights: Insight[];
  themes: Theme[];
}

/** Polls /api/state; the server answers "unchanged" cheaply when nothing happened. */
export function useLiveState(intervalMs = 2000) {
  const [state, setState] = useState<LiveState | null>(null);
  const version = useRef(-1);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/api/state?since=${version.current}`, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        if (json.unchanged) setState((s) => (s ? { ...s, queue: json.queue } : s));
        else {
          version.current = json.version;
          setState(json);
        }
      } catch {
        /* server restarting – try again */
      }
      if (alive) timer = setTimeout(tick, intervalMs);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [intervalMs]);
  return state;
}
