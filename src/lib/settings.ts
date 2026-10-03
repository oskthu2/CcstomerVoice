import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config";

/**
 * AI instructions editable from /admin. The catalogue, current themes and the
 * JSON output format are always appended in code, so edits here can't break parsing.
 * `{maxThemes}` and `{maxInsights}` are replaced with the numeric settings.
 */
export interface Settings {
  analyzeInstructions: string;
  regroupInstructions: string;
  maxThemes: number;
  maxInsights: number;
}

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
};

const FILE = path.join(DATA_DIR, "settings.json");
const g = globalThis as unknown as { __cvSettings?: Settings };

export function getSettings(): Settings {
  if (!g.__cvSettings) {
    try {
      g.__cvSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
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

export function saveSettings(input: Partial<Settings>): Settings {
  const cur = getSettings();
  const next: Settings = {
    analyzeInstructions: input.analyzeInstructions?.trim() || cur.analyzeInstructions,
    regroupInstructions: input.regroupInstructions?.trim() || cur.regroupInstructions,
    maxThemes: clampInt(input.maxThemes ?? cur.maxThemes, 2, 20, cur.maxThemes),
    maxInsights: clampInt(input.maxInsights ?? cur.maxInsights, 1, 10, cur.maxInsights),
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  g.__cvSettings = next;
  return next;
}

export function resetSettings(): Settings {
  try {
    fs.unlinkSync(FILE);
  } catch {
    /* already default */
  }
  g.__cvSettings = { ...DEFAULT_SETTINGS };
  return g.__cvSettings;
}

export function fill(template: string, s: Settings) {
  return template.replaceAll("{maxThemes}", String(s.maxThemes)).replaceAll("{maxInsights}", String(s.maxInsights));
}
