# Customer Voice – Vårdens digitala vägval

An interactive "Voice of the Customer" station for a conference floor. Attendees leave a statement on a
tablet (by typing or speaking), and an AI picks out the parts that current or future **Inera** products could
solve. The results appear live on a big-screen mind map: **themes → Inera products → needs**.

Inspired by [aotakeda/learn-thing](https://github.com/aotakeda/learn-thing) (Next.js + React Flow + LLM), rebuilt
around this use case.

| Client | URL | Device |
|---|---|---|
| Input kiosk | `http://<host>:3000/input` | Tablet or phone (the wall shows a QR code) |
| Wall | `http://<host>:3000/wall` | Large screen, full-screen browser (F11) |
| Admin | `http://<host>:3000/admin` | Your laptop |

## Quick start (Docker)

macOS / Linux (bash):

```bash
cp config/secrets.example.env config/secrets.env
nano config/secrets.env          # add ANTHROPIC_API_KEY and/or OPENAI_API_KEY
docker compose up -d --build
```

Windows (PowerShell):

```powershell
Copy-Item config\secrets.example.env config\secrets.env
notepad config\secrets.env       # add ANTHROPIC_API_KEY and/or OPENAI_API_KEY, then save
docker compose up -d --build
```

Other devices on the network reach the app through your computer's IP address (`ipconfig` / `ip addr`) instead of
`localhost`. On Windows you may need to allow port 3000 in the firewall.

Open <http://localhost:3000>. If you start without a key, the app runs in **demo mode** and uses a keyword
matcher, which is handy for testing the setup offline.

### Configuration: `config/secrets.env` (git-ignored, local only)

| Variable | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key. If it is set, Claude is used (default model `claude-opus-5-5`, `ANTHROPIC_EFFORT=low`). |
| `ANTHROPIC_WORKSPACE_ID` | Only for keys that are not scoped to a workspace (`wrkspc_…`). |
| `OPENAI_API_KEY` | OpenAI key. Used when no Anthropic key is set (default model `gpt-4.1-mini`). |
| `OPENAI_BASE_URL` | Any OpenAI-compatible endpoint, e.g. Ollama (`http://ollama:11434/v1`). |
| `AI_PROVIDER` | Optional override: `anthropic`, `openai` or `demo`. |
| `ADMIN_TOKEN` | Protects `/admin` and the exports. |
| `PUBLIC_INPUT_URL` | The URL behind the wall's QR code. Use your machine's LAN IP, e.g. `http://192.168.1.20:3000/input`. |
| `SEED_ON_START` | `true` loads the 63 example voices on the first start. |

After you edit `secrets.env`, run `docker compose up -d` again (a restart does not re-read `env_file`).

### Local LLM (optional)

```bash
docker compose --profile ollama up -d
docker compose exec ollama ollama pull qwen2.5:7b
# secrets.env: OPENAI_BASE_URL=http://ollama:11434/v1  OPENAI_MODEL=qwen2.5:7b
```

## Running it live

- **🎲 Förifyll** on the kiosk fills in a random voice from the Dagens Medicin article, so you can demo
  without typing. You can still edit the text before you press **Skicka in**.
- **🎤 Prata** uses the browser's speech recognition (sv-SE, Chrome/Edge/Safari). Browsers only allow
  the microphone on `https://` or `localhost`. On a tablet over plain LAN http, use the keyboard's own dictation instead.
- **The wall** tours automatically: an overview, then one theme at a time. When a new voice arrives, it flies
  to that voice and highlights it. `Space` pauses or resumes the tour. `/wall?tour=0` starts it paused.
- **AI instructions (admin):** edit the instruction used to sort each voice and the theme-regrouping instruction,
  set max themes / insights per voice, preview the full prompt, and click *Sortera om alla röster* to re-sort the
  existing voices. The wall keeps showing the old result until each voice has been re-sorted. Saved in the data volume.
- **Wall & catalogue (admin):** switch the wall between dark, light or the browser's theme, set the tour pacing
  (overview / per theme / new voice), and edit the Inera product catalogue (add, remove, aliases, current vs
  future). Changes reach the wall within a few seconds; catalogue edits are stored in the data volume and
  *Återställ till config-filen* goes back to `config/inera-products.json`.
- **Admin:** load the examples, *Gruppera om teman* (AI consolidates the themes and merges synonymous future products),
  *Analysera om alla*, delete inappropriate entries, and export **CSV/JSON** for follow-up product work.

## How the AI is instructed

`src/lib/ai.ts` contains the prompt. For each statement, the model:

1. finds **parts** of the statement that describe a need that a current or future Inera product could solve
   (and ignores pure party politics, reimbursement models, etc.),
2. returns a verbatim quote, a short need, a theme (reusing existing themes, max 8), a product and a status
   (`current` = from the catalogue, `future` = a proposed new product or extension), and a one-sentence rationale.

The prompt includes three worked examples taken from the article. With Claude, the answer is constrained by a JSON
schema (structured outputs). Server-side fallbacks are enabled, so if a safety classifier declines a request it is
re-run on a fallback model.

### Product catalogue: `config/inera-products.json`

Lists the current Inera services and known ideas for the future. It is mounted into the container, so you can edit
it and then run `docker compose restart app`. **Check the names and descriptions against inera.se before the conference.**

## Example data

`data/seed/dagens-medicin-2026.json` holds 63 statements (name, role, text) extracted from
*Dagens Medicin, "Vårdens digitala vägval – 60 röster inför valet 2026" (4 May 2026)*.

## Development without Docker

```bash
npm install
cp config/secrets.example.env .env.local   # Next.js reads .env.local
npm run dev
```

Data is stored in `data/state.json` (in Docker: the `voice-data` volume).
