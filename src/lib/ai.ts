import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { ai, demoMode } from "./config";
import { fill, getSettings } from "./settings";
import type { Product, ProductStatus } from "./types";

export interface RawInsight {
  excerpt: string;
  need: string;
  theme: string;
  product: string;
  product_status: ProductStatus;
  rationale?: string;
}

export interface RegroupResult {
  themes: { name: string; description?: string; insight_ids: string[] }[];
  product_renames?: { from: string; to: string }[];
}

function catalogText(products: Product[]) {
  const line = (p: Product) =>
    `- ${p.name}${p.aliases?.length ? ` (även: ${p.aliases.join(", ")})` : ""}: ${p.description ?? ""}`;
  return [
    "BEFINTLIGA Inera-produkter (product_status = \"current\"):",
    ...products.filter((p) => p.status === "current").map(line),
    "",
    "KÄNDA IDÉER för FRAMTIDA Inera-produkter (product_status = \"future\"):",
    ...products.filter((p) => p.status === "future").map(line),
  ].join("\n");
}

/** Full system prompt for one statement: editable instructions + fixed, code-owned parts. */
export function analyzeSystemPrompt(products: Product[], themes: string[]) {
  const st = getSettings();
  return `${fill(st.analyzeInstructions, st)}

---
${catalogText(products)}

BEFINTLIGA TEMAN (återanvänd exakt stavning): ${themes.length ? themes.map((t) => `"${t}"`).join(", ") : "(inga ännu)"}

SVARSFORMAT: svara ENDAST med JSON enligt {"insights":[{"excerpt":"","need":"","theme":"","product":"","product_status":"current","rationale":""}]}`;
}

export function regroupSystemPrompt(products: Product[]) {
  const st = getSettings();
  return `${fill(st.regroupInstructions, st)}

---
Befintliga produkter (byt aldrig namn på dessa): ${products.filter((p) => p.status === "current").map((p) => p.name).join(", ")}.
SVARSFORMAT: svara ENDAST med JSON {"themes":[{"name":"","description":"en mening","insight_ids":["..."]}],"product_renames":[{"from":"","to":""}]}
Varje insikts-id ska förekomma i exakt ett tema.`;
}

// JSON Schemas: enforced by Anthropic structured outputs, and spelled out in the prompts for OpenAI.
const INSIGHTS_SCHEMA = {
  type: "object",
  properties: {
    insights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          excerpt: { type: "string" },
          need: { type: "string" },
          theme: { type: "string" },
          product: { type: "string" },
          product_status: { type: "string", enum: ["current", "future"] },
          rationale: { type: "string" },
        },
        required: ["excerpt", "need", "theme", "product", "product_status", "rationale"],
        additionalProperties: false,
      },
    },
  },
  required: ["insights"],
  additionalProperties: false,
};

const REGROUP_SCHEMA = {
  type: "object",
  properties: {
    themes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          insight_ids: { type: "array", items: { type: "string" } },
        },
        required: ["name", "description", "insight_ids"],
        additionalProperties: false,
      },
    },
    product_renames: {
      type: "array",
      items: {
        type: "object",
        properties: { from: { type: "string" }, to: { type: "string" } },
        required: ["from", "to"],
        additionalProperties: false,
      },
    },
  },
  required: ["themes", "product_renames"],
  additionalProperties: false,
};

let anthropicClient: Anthropic | null = null;

/** Turn SDK errors into a short message that is shown in /admin. */
function describe(e: unknown): Error {
  if (e instanceof Anthropic.AuthenticationError) return new Error("401: ogiltig ANTHROPIC_API_KEY");
  if (e instanceof Anthropic.PermissionDeniedError) return new Error(`403: nyckeln saknar behörighet (${e.message})`);
  if (e instanceof Anthropic.NotFoundError) return new Error(`404: modellen "${ai.anthropic.model}" finns inte för kontot – sätt ANTHROPIC_MODEL`);
  if (e instanceof Anthropic.RateLimitError) return new Error("429: rate limit eller slut på krediter");
  if (e instanceof Anthropic.BadRequestError && /workspace/i.test(e.message))
    return new Error("400: nyckeln är inte kopplad till en workspace – sätt ANTHROPIC_WORKSPACE_ID i secrets.env (eller skapa en workspace-nyckel)");
  if (e instanceof Anthropic.APIError) return new Error(`${e.status ?? ""} ${e.message}`.trim());
  return e instanceof Error ? e : new Error(String(e));
}
let openaiClient: OpenAI | null = null;

async function chatJson<T>(system: string, user: string, schema: Record<string, unknown>): Promise<T> {
  if (ai.provider === "anthropic") {
    anthropicClient ??= new Anthropic({
      apiKey: ai.anthropic.apiKey,
      defaultHeaders: ai.anthropic.workspaceId ? { "anthropic-workspace-id": ai.anthropic.workspaceId } : undefined,
    });
    const base = {
      model: ai.anthropic.model,
      max_tokens: 16000,
      system,
      messages: [{ role: "user" as const, content: user }],
      output_config: { effort: ai.anthropic.effort, format: { type: "json_schema" as const, schema } },
    };
    let res;
    try {
      // If a safety classifier declines, the API retries on a suitable fallback model.
      res = await anthropicClient.beta.messages.create({
        ...base,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    } catch (e) {
      // Some accounts/models don't accept the fallback beta: retry once as a plain request.
      if (!(e instanceof Anthropic.BadRequestError) || /workspace/i.test(e.message)) throw describe(e);
      console.warn("[ai] request rejected with fallbacks, retrying without:", e.message);
      try {
        res = await anthropicClient.messages.create(base);
      } catch (e2) {
        throw describe(e2);
      }
    }
    if (res.stop_reason === "refusal") throw new Error("Modellen avböjde att svara.");
    if (res.stop_reason === "max_tokens") throw new Error("Svaret blev för långt (max_tokens).");
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return JSON.parse(text) as T;
  }

  openaiClient ??= new OpenAI({ apiKey: ai.openai.apiKey || "not-needed", baseURL: ai.openai.baseURL });
  const res = await openaiClient.chat.completions.create({
    model: ai.openai.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    ...(ai.openai.temperature !== undefined ? { temperature: ai.openai.temperature } : {}),
  });
  const content = res.choices[0]?.message?.content ?? "{}";
  // Some local models wrap JSON in prose or code fences; grab the outermost object.
  const match = content.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : content) as T;
}

export async function analyzeStatement(
  text: string,
  meta: { author?: string; role?: string },
  products: Product[],
  themes: string[],
): Promise<RawInsight[]> {
  if (demoMode) return keywordAnalyze(text);
  const who = [meta.author, meta.role].filter(Boolean).join(", ");
  const out = await chatJson<{ insights?: RawInsight[] }>(
    analyzeSystemPrompt(products, themes),
    `Uttalande${who ? ` (${who})` : ""}: "${text}"`,
    INSIGHTS_SCHEMA,
  );
  return (out.insights ?? []).filter((i) => i && i.need && i.product && i.theme).slice(0, getSettings().maxInsights);
}

/** Quick end-to-end check used by the admin "Testa AI" button. */
export async function testAi(products: Product[]) {
  const t0 = Date.now();
  const insights = await analyzeStatement(
    "Vi vill att vuxna ska kunna utses till digitala ombud för andra vuxna inom sjukvården.",
    {},
    products,
    [],
  );
  return { provider: ai.provider, model: ai.model, ms: Date.now() - t0, insights };
}

/** Consolidate themes (and synonym future products) across all insights. */
export async function regroup(
  items: { id: string; need: string; product: string; theme: string }[],
  products: Product[],
): Promise<RegroupResult | null> {
  if (demoMode || items.length === 0) return null;
  const system = regroupSystemPrompt(products);
  return chatJson<RegroupResult>(system, JSON.stringify(items), REGROUP_SCHEMA);
}

// ---------------------------------------------------------------------------
// Demo mode: crude keyword matcher so the kiosk + wall work without an API key.
// ---------------------------------------------------------------------------
const RULES: { re: RegExp; theme: string; product: string; status: ProductStatus; need: string }[] = [
  { re: /interoperab|dela (relevant )?information|delning av hälsodata|följ(a|er) patienten|huvudmannagräns|standard|api/i, theme: "Interoperabilitet och informationsdelning", product: "Nationella tjänsteplattformen", status: "current", need: "Information följer patienten mellan aktörer" },
  { re: /journal(information|system)?|sammanhåll/i, theme: "Interoperabilitet och informationsdelning", product: "Nationell patientöversikt (NPÖ)", status: "current", need: "Sammanhållen journalinformation för vården" },
  { re: /egen hälsodata|sin egen hälsodata|egen data/i, theme: "Patientens egen hälsodata", product: "Journalen", status: "current", need: "Patienten når sin egen hälsodata" },
  { re: /ombud|närstående|anhöriga/i, theme: "Digital delaktighet och inkludering", product: "Digitalt ombud för vuxna i 1177", status: "future", need: "Närstående kan stötta digitalt" },
  { re: /bankid|utanförskap|funktionsnedsättning|funktionsvariation|språk|tillgängliga för alla/i, theme: "Digital delaktighet och inkludering", product: "Inloggning utan BankID", status: "future", need: "Digitala tjänster tillgängliga för alla" },
  { re: /\bai\b|ai-/i, theme: "AI som avlastar vården", product: "AI-stöd för dokumentation", status: "future", need: "AI som minskar administrativ börda" },
  { re: /administrat|dokumentation|dubbelregistrer/i, theme: "AI som avlastar vården", product: "AI-stöd för dokumentation", status: "future", need: "Mindre administration för vårdpersonal" },
  { re: /techjätt|suverän|beroende av (globala|amerikanska)/i, theme: "Robust och säker infrastruktur", product: "Suverän AI-plattform för vården", status: "future", need: "Minskat beroende av globala techjättar" },
  { re: /robust|redundans|cyber|kris|sårbar/i, theme: "Robust och säker infrastruktur", product: "Reservrutiner och redundans för nationella tjänster", status: "future", need: "Tjänster som fungerar vid kris" },
  { re: /telefonkö|digitala ingångar|digitala möten|distans|videokonsult|digital vård/i, theme: "Tillgänglig digital vård", product: "1177 Direkt", status: "current", need: "Enkel digital kontakt med vården" },
  { re: /egenvård|kronisk|själva styra sin hälsa|uppföljning/i, theme: "Egenvård och prevention", product: "Egen mätdata och egenvård i 1177", status: "future", need: "Digitalt stöd för egenvård" },
  { re: /psykisk|kbt|internetprogram|psykolog/i, theme: "Tillgänglig digital vård", product: "Stöd och behandling", status: "current", need: "Digital psykologisk behandling" },
  { re: /sekundär|forskning|register|life science/i, theme: "Hälsodata för forskning och innovation", product: "Patientens egen hälsodata (EHDS)", status: "future", need: "Säker sekundäranvändning av hälsodata" },
  { re: /samtycke|integritet|sekretess|gdpr|informationssäkerhet/i, theme: "Robust och säker infrastruktur", product: "Säkerhetstjänster", status: "current", need: "Säker och integritetsskyddad datadelning" },
  { re: /apotek|läkemedel/i, theme: "Robust och säker infrastruktur", product: "Pascal", status: "current", need: "Säker läkemedelshantering" },
  { re: /välfärdsteknik|äldre|omsorg|kommun/i, theme: "Välfärdsteknik i omsorgen", product: "Hjälpmedelstjänsten", status: "current", need: "Välfärdsteknik som frigör tid i omsorgen" },
];

function keywordAnalyze(text: string): RawInsight[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const out: RawInsight[] = [];
  const seen = new Set<string>();
  for (const r of RULES) {
    const sentence = sentences.find((s) => r.re.test(s));
    if (!sentence || seen.has(r.product)) continue;
    seen.add(r.product);
    const words = sentence.split(/\s+/);
    out.push({
      excerpt: words.length > 25 ? words.slice(0, 25).join(" ") + " ..." : sentence,
      need: r.need,
      theme: r.theme,
      product: r.product,
      product_status: r.status,
      rationale: "Demo-läge: matchat på nyckelord.",
    });
    if (out.length >= 3) break;
  }
  return out;
}
