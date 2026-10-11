import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config";
import type { Category } from "./types";

/**
 * AI instructions editable from /admin. The catalogue, current themes and the
 * JSON output format are always appended in code, so edits here can't break parsing.
 * `{maxThemes}` and `{maxInsights}` are replaced with the numeric settings.
 */
export type WallTheme = "dark" | "light" | "auto";
/** Which visualisation the wall shows; "both" alternates every `viewSec`. */
export type WallView = "themes" | "categories" | "value" | "both";

/** Appearance and camera-tour pacing of the big-screen wall (seconds). */
export interface WallSettings {
  theme: WallTheme;
  overviewSec: number;
  themeSec: number;
  freshSec: number;
  view: WallView;
  viewSec: number;
}

export interface Settings {
  analyzeInstructions: string;
  regroupInstructions: string;
  maxThemes: number;
  maxInsights: number;
  wall: WallSettings;
  categories: Category[];
  /** Benefit types for the value view (same shape as categories). */
  benefits: Category[];
}

export const DEFAULT_BENEFITS: Category[] = [
  { id: "kvalitet", name: "Kvalitet & patientsäkerhet", description: "Bättre vårdkvalitet, färre fel och risker, säkrare och mer jämlik vård för patienten.", color: "#19a7a8" },
  { id: "arbetsmiljo", name: "Arbetsmiljö & utvecklingsförmåga", description: "Bättre arbetsmiljö, mindre stress, ökad kompetens och förmåga att utveckla verksamheten.", color: "#d9622b" },
  { id: "ekonomi", name: "Ekonomisk nytta", description: "Frigjord tid (t.ex. mindre administration och dubbelarbete) eller frigjorda resurser (t.ex. lägre kostnader, bättre kapacitetsutnyttjande).", color: "#c99a06" },
];

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "patienter", name: "Patienter", description: "Invånare, patienter och närstående: tillgång till vård och egen information, delaktighet, egenvård.", color: "#19a7a8" },
  { id: "medarbetare", name: "Medarbetare", description: "Vård- och omsorgspersonal: arbetsmiljö, administration, kompetens och verktyg i vardagen.", color: "#d9622b" },
  { id: "infrastruktur", name: "Infrastruktur", description: "System och informationsdelning, standarder, säkerhet, robusthet och nationell digital infrastruktur.", color: "#8a4fd1" },
];

export const DEFAULT_WALL: WallSettings = { theme: "dark", overviewSec: 14, themeSec: 9, freshSec: 14, view: "themes", viewSec: 90 };

export const DEFAULT_ANALYZE = `Du är produktanalytiker på Inera, som utvecklar och förvaltar gemensamma digitala tjänster för regioner och kommuner i Sverige.
Besökare på en konferens lämnar uttalanden om vårdens digitalisering. Din uppgift:

1. Leta efter DELAR av uttalandet som beskriver ett behov, problem eller önskemål som kan lösas helt eller delvis av en befintlig eller framtida Inera-produkt.
   Ignorera delar som enbart handlar om partipolitik, ersättningsmodeller, lön eller annat som Inera inte kan påverka med en digital tjänst.
2. För varje sådan del, returnera:
   - "excerpt": ordagrant citat ur uttalandet (max 25 ord, förkorta med "..." vid behov)
   - "need": behovet formulerat kort och konkret ur användarens perspektiv (max 10 ord, svenska)
   - "theme": ett övergripande tema (2–5 ord). ÅTERANVÄND ett befintligt tema om det passar. Skapa bara ett nytt om inget passar och det totalt finns färre än {maxThemes} teman.
   - "product": namnet på EN befintlig Inera-produkt från katalogen som löser behovet, ELLER ett kort namn (2–6 ord) på en framtida produkt/vidareutveckling. Återanvänd namn på kända framtida idéer när de passar.
   - "product_status": "current" om produkten finns i katalogen över befintliga produkter, annars "future"
   - "rationale": en mening om hur produkten möter behovet
3. Returnera 0–{maxInsights} insikter. Hitta inte på behov som inte står i texten. Om inget är relevant: {"insights":[]}.
4. Skriv på svenska även om uttalandet är på ett annat språk.

EXEMPEL 1
Uttalande (Lotta Håkansson, Reumatikerförbundet): "Det som har varit centralt för Reumatikerförbundet och många andra patientorganisationer under lång tid är att säkerställa att patienten har tillgång till sin egen hälsodata. Patienten ska stå i centrum och kunna dra nytta av digitaliseringen. Men det är också många som inte klarar av att hantera digitala vårdkontakter, utan behöver stöd från närstående. Vi vill att vuxna ska kunna utses till digitala ombud för andra vuxna inom sjukvården. Det skulle öka tryggheten för många."
Svar:
{"insights":[
 {"excerpt":"säkerställa att patienten har tillgång till sin egen hälsodata","need":"Patienten når all sin egen hälsodata","theme":"Patientens egen hälsodata","product":"Journalen","product_status":"current","rationale":"Journalen ger invånaren tillgång till sin journal via 1177 och kan breddas med fler källor."},
 {"excerpt":"vuxna ska kunna utses till digitala ombud för andra vuxna inom sjukvården","need":"Närstående kan agera digitalt ombud för vuxna","theme":"Digital delaktighet och inkludering","product":"Digitalt ombud för vuxna i 1177","product_status":"future","rationale":"Utökar dagens ombudsfunktion för barn i 1177 e-tjänster till vuxna."}
]}

EXEMPEL 2
Uttalande (Johan Wallér, Sveriges Apoteksförening): "Den viktigaste frågan blir hur vi säkrar robusthet och redundans i vårdens digitala infrastruktur. Vården och apoteken är i dag beroende av nationella system som oftast fungerar väl – men som också är sårbara vid cyberangrepp, driftstörningar eller kris."
Svar:
{"insights":[
 {"excerpt":"säkrar robusthet och redundans i vårdens digitala infrastruktur","need":"Nationella e-hälsotjänster fungerar även vid kris","theme":"Robust och säker infrastruktur","product":"Reservrutiner och redundans för nationella tjänster","product_status":"future","rationale":"Inera driver nationella tjänster som vård och apotek är beroende av."}
]}

EXEMPEL 3
Uttalande (Caroline Erkers, Svea KBT): "...Med psykisk ohälsa som växande problem tror jag att digitala möten, internetprogram och kortare tid med patienten såklart kan göra vården lättillgänglig men också urholkad och mindre kvalitativ."
Svar:
{"insights":[
 {"excerpt":"digitala möten, internetprogram ... kan göra vården lättillgänglig men också urholkad","need":"Digital psykiatrisk vård med bibehållen kvalitet","theme":"Tillgänglig digital vård","product":"Stöd och behandling","product_status":"current","rationale":"Plattformen för internetbehandling kan stödja uppföljning och kvalitet i behandlingen."}
]}`;

export const DEFAULT_REGROUP = `Du är produktanalytiker på Inera. Du får en lista med insikter (behov kopplade till Inera-produkter) från en konferens.
Gruppera ALLA insikter i 4–{maxThemes} tydliga, ömsesidigt uteslutande teman (2–5 ord, svenska) som är användbara för produktutveckling.
Slå också ihop framtida produktnamn som betyder samma sak (product_renames). Byt aldrig namn på befintliga produkter.`;

export const DEFAULT_SETTINGS: Settings = {
  analyzeInstructions: DEFAULT_ANALYZE,
  regroupInstructions: DEFAULT_REGROUP,
  maxThemes: 8,
  maxInsights: 4,
  wall: DEFAULT_WALL,
  categories: DEFAULT_CATEGORIES,
  benefits: DEFAULT_BENEFITS,
};

const FILE = path.join(DATA_DIR, "settings.json");
const g = globalThis as unknown as { __cvSettings?: Settings };

export function getSettings(): Settings {
  if (!g.__cvSettings) {
    try {
      const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
      g.__cvSettings = { ...DEFAULT_SETTINGS, ...saved, wall: { ...DEFAULT_WALL, ...saved.wall }, categories: saved.categories?.length ? saved.categories : DEFAULT_CATEGORIES, benefits: saved.benefits?.length ? saved.benefits : DEFAULT_BENEFITS };
    } catch {
      g.__cvSettings = { ...DEFAULT_SETTINGS };
    }
  }
  return g.__cvSettings!;
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function cleanWall(input: Partial<WallSettings> | undefined, cur: WallSettings): WallSettings {
  const w = { ...cur, ...input };
  return {
    theme: w.theme === "light" || w.theme === "auto" ? w.theme : "dark",
    overviewSec: clampInt(w.overviewSec, 3, 120, cur.overviewSec),
    themeSec: clampInt(w.themeSec, 3, 120, cur.themeSec),
    freshSec: clampInt(w.freshSec, 3, 120, cur.freshSec),
    view: w.view === "categories" || w.view === "value" || w.view === "both" ? w.view : "themes",
    viewSec: clampInt(w.viewSec, 15, 600, cur.viewSec),
  };
}

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kategori";

function cleanCategories(input: unknown, cur: Category[], max = 8): Category[] {
  if (!Array.isArray(input)) return cur;
  const out: Category[] = [];
  const ids = new Set<string>();
  for (const raw of input as Partial<Category>[]) {
    const name = String(raw?.name ?? "").trim().slice(0, 40);
    if (!name || out.some((c) => c.name.toLowerCase() === name.toLowerCase())) continue;
    // Keep the id when a category is renamed, so stored voices stay linked.
    let id = String(raw.id ?? "").trim() || slug(name);
    while (ids.has(id)) id += "-2";
    ids.add(id);
    const color = /^#[0-9a-f]{6}$/i.test(String(raw.color)) ? String(raw.color) : "#7a8a99";
    out.push({ id, name, description: String(raw.description ?? "").trim().slice(0, 300), color });
  }
  if (!out.length) throw new Error("Det måste finnas minst en kategori.");
  return out.slice(0, max);
}

export function saveSettings(input: Partial<Omit<Settings, "wall">> & { wall?: Partial<WallSettings> }): Settings {
  const cur = getSettings();
  const next: Settings = {
    analyzeInstructions: input.analyzeInstructions?.trim() || cur.analyzeInstructions,
    regroupInstructions: input.regroupInstructions?.trim() || cur.regroupInstructions,
    maxThemes: clampInt(input.maxThemes ?? cur.maxThemes, 2, 20, cur.maxThemes),
    maxInsights: clampInt(input.maxInsights ?? cur.maxInsights, 1, 10, cur.maxInsights),
    wall: cleanWall(input.wall, cur.wall),
    categories: cleanCategories(input.categories, cur.categories),
    benefits: cleanCategories(input.benefits, cur.benefits, 3), // Venn diagram: at most three circles
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  g.__cvSettings = next;
  return next;
}

/** Restore the default AI instructions (wall settings and categories are kept). */
export function resetSettings(): Settings {
  const { wall, categories, benefits } = getSettings();
  return saveSettings({ ...DEFAULT_SETTINGS, wall, categories, benefits });
}

export function fill(template: string, s: Settings) {
  return template.replaceAll("{maxThemes}", String(s.maxThemes)).replaceAll("{maxInsights}", String(s.maxInsights));
}
