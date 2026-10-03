import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config";
import type { State } from "./types";

const FILE = path.join(DATA_DIR, "state.json");

const empty = (): State => ({ version: 0, statements: [], insights: [], themes: [] });

// Kept on globalThis so all route bundles in the Next.js process share one copy.
const g = globalThis as unknown as { __cvState?: State };

export function getState(): State {
  if (!g.__cvState) {
    try {
      g.__cvState = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
    } catch {
      g.__cvState = empty();
    }
  }
  return g.__cvState!;
}

/** Apply a mutation, bump the version (wall clients poll on it) and persist atomically. */
export function mutate(fn: (s: State) => void) {
  const s = getState();
  fn(s);
  s.version++;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, FILE);
}

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
