# Competitor Brief

A local, single-user web app that turns a rough product idea into a **competitor
brief**: a scored competitor landscape, screenshots, shared design patterns, and
concrete opportunities you can act on.

Everything runs on your machine. There is no database server, no account system,
no telemetry, and no billing — only the free tiers of Google Gemini and Tavily.

---

## What it does

1. **Describe an idea** in plain language.
2. Gemini turns it into an **idea profile**: problem, target customer, solution
   type, category, key features, and 4–8 web search queries.
3. You **review and edit** the profile. Editing never costs another AI call.
4. **Run the brief.** The pipeline searches, verifies, screenshots, and analyzes:
   - **Search** — Tavily, basic depth, sequential, one credit per query, cached
     for 7 days.
   - **Verify** — each candidate URL is fetched to confirm it exists and
     captures the requested terms. Private and metadata addresses are refused.
   - **Screenshot** — a Playwright Chromium visit captures a JPEG of the homepage.
   - **Analyze** — Gemini looks at those screenshots plus the evidence pages and
     scores every competitor.
5. **Read the brief**: direct and indirect competitors with 0–3 scores and
   reasons, design patterns shared across at least two sites, and opportunities.
6. **Export** to Markdown, or **print** to PDF from the browser dialog.

---

## Requirements

| Need | Notes |
| --- | --- |
| Node.js 20+ | Developed on Node with Next.js 16 |
| Gemini API key | Free tier. Do **not** enable billing |
| Tavily API key | Free "Researcher" plan, 1000 credits/month, no card |
| Chromium for Playwright | `npx playwright install chromium` (one time) |

---

## Setup

```bash
npm install
cp .env.example .env.local     # Windows: copy .env.example .env.local
```

Fill in `.env.local`:

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | yes | — | All three AI requests |
| `TAVILY_API_KEY` | yes | — | Web search |
| `GEMINI_MODEL_FAST` | no | `gemini-3.5-flash-lite` | AI requests 1 and 2 (text only) |
| `GEMINI_MODEL_SMART` | no | `gemini-3.5-flash` | AI request 3 (includes screenshots, must accept images) |
| `SWIND_R_DATA_DIR` | no | `./data` | Where briefs, screenshots, and cache live |

`.env.local` is gitignored. Never commit real keys.

Install the browser once:

```bash
npx playwright install chromium
```

## Running

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # serve the production build
npm test         # unit tests (no network)
npm run lint     # type check
```

> **Windows note.** Both scripts pass `--webpack`. Turbopack needs native SWC
> bindings, which fail to load from some synced folders (OneDrive) with
> `not a valid Win32 application`. Webpack transparently falls back to the
> WASM bindings and prints a harmless warning.

---

## How a brief is priced

The budget is the whole point, so it is enforced in code rather than hoped for.
All of it lives in `lib/config/limits.ts`.

| Limit | Value |
| --- | --- |
| Tavily searches per brief | 8, basic depth, sequential |
| AI requests per brief | 3 (profile, candidates, analysis) |
| Validation retries per AI request | 1 |
| HTTP 503 retries per AI request | 3, with backoff |
| Candidates sent to verification | 20 |
| Verified competitors analyzed | 15 |
| Score reasons | max 120 characters |
| Design patterns | max 6, each shared by ≥ 2 screenshot-backed sites |
| Opportunities | 3–5 |

Other rules worth knowing:

- **Cached searches are free.** A repeated query within 7 days costs no credit
  and does not count against the brief's 8-search limit.
- **Quota errors are never retried.** A 429 fails the brief with the provider's
  retry time; retrying would waste the quota you are trying to protect.
- **One brief runs at a time.** A file lock, taken atomically before the status
  flips to `running`, prevents overlapping runs. A lock left behind by a killed
  process is reclaimed after it goes stale, and `instrumentation.ts` marks such
  briefs as interrupted on startup.

---

## Re-running and editing

Once a brief has run, its profile is read-only and its results stay exactly as
they were. **Edit profile & re-run** clones the saved profile into a **new**
brief, so the original is untouched and the clone's identical search queries hit
the Tavily cache — often a zero-credit run.

---

## Where your data lives

Everything is a plain file under `./data` (or `SWIND_R_DATA_DIR`):

```
data/
  briefs/<uuid>.json        one file per brief
  images/<uuid>/<domain>.jpg
  cache/tavily/<hash>.json  7-day search cache
  usage.json                provider request counts
```

Delete the folder to reset the app. Nothing is uploaded anywhere except the
search queries sent to Tavily and the page text and screenshots sent to Gemini.

`./.test-data` is used by the test suite and is gitignored too.

---

## Troubleshooting

**"Another brief is already running."** Wait for it, or if the app was killed
mid-run, restart it — the stale lock is reclaimed and the brief is marked
interrupted.

**"The free AI quota is used up for now."** Gemini's free tier is exhausted.
Wait for the window to reset; the message shows the retry time when the provider
reports one. Tavily failures are separate and usually mean a bad key.

**A brief found no competitors.** Either the idea is genuinely new or the search
queries were too narrow. Edit the profile and re-run; the second attempt usually
costs nothing thanks to the cache.

**Playwright errors on screenshot capture.** Run
`npx playwright install chromium` once. Sites that block headless browsers are
skipped rather than failed.

---

## Verification

`npm test` runs 194 unit tests covering the pipeline's decision logic — AI
retry and quota handling, Tavily caching and budgets, SSRF and URL
normalization, status classification, zod and Gemini schema contracts, brief
storage and locking, and the API's state transitions — with no network calls
and no cost.

`npm run lint` type checks the project.