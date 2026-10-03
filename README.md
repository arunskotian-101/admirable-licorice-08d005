# Residential Society Website

A responsive society website built from the *Society Work — Operating Review* deck, using plain HTML, CSS and vanilla JavaScript, with Netlify Functions for server-side Gemini requests.

| Page | What it does |
|---|---|
| `/` Home | Society name, office-bearer and emergency-contact **placeholders**, complaint process and service review from the deck |
| `/letter.html` | Member letter form → editable AI draft → copy / download / print |
| `/minutes.html` | AGM, SGM, weekly and monthly committee minutes: attendance, quorum record, agenda, discussion, resolutions, votes, action owners |
| `/rules.html` | Rules & FAQ plus Ask Society Assistant using retrieved, reviewed passages in `netlify/data/assistant-sources.json` |

## 1. How it protects against invented content

- **Facts come from your form, not the AI.** The letter's date, addressee, subject, name, flat and contact, and the minutes' attendance, quorum, votes, proposers and action owners are copied verbatim by server code (`netlify/lib/documents.js`). The model only writes the letter body and tidies free-text notes.
- **The prompts forbid** inventing facts, bye-law/clause/Act citations, delivery or approval claims, votes, and unanimity. Missing details become `[bracketed placeholders]` and reviewer notes.
- **A second check runs after generation** (`netlify/lib/checks.js`): any figure in the draft that is not in your input, and any bye-law reference, "was sent/approved" claim or "unanimously" that you did not supply, produces a visible warning.
- **Quorum, passed/not-passed and majorities are never decided by the tool.** You choose the recorded status; the tool only shows hints (e.g. "2 marked Present vs 3 required — confirm against the bye-laws").
- **Rules answers must cite an entry.** An answer with no valid citation is replaced by "not covered — ask the Secretary or Managing Committee".
- **"Draft — requires review"** shows on every generated document and is added as the first line of every copy, download and print.
- **Nothing is ever sent.** There is no email/SMS/WhatsApp integration, and the UI never claims delivery.

## 2. Prerequisites

- Node.js 20 or newer (`node -v`)
- A free [Netlify](https://www.netlify.com) account
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
- Git (for the recommended deployment route)

## 3. Run it locally

```bash
cd society-site
cp .env.example .env          # Windows: copy .env.example .env
# open .env and set GEMINI_API_KEY and, if needed, GEMINI_MODEL
npm run dev                   # same as: npx netlify-cli dev
```

Open the URL it prints (normally http://localhost:8888). **Do not open the HTML files directly** — the pages need the local server for `/api/*` and `/data/*`.

Run the automated checks (no API key or network needed — Gemini is mocked):

```bash
npm test
```

## 4. Choose the Gemini model

The model is read from `GEMINI_MODEL` on every request. Model ids change and older ones are retired, so check the current list at https://ai.google.dev/gemini-api/docs/models. The default in `.env.example` is `gemini-3.8-flash`, taken from Google's docs when this project was built — if you get *"model not found"*, change that one variable (no code change, just redeploy or restart).

## 5. Fill in the society details

Edit `public/data/society.json`: society name, registration number, address, office hours, office-bearer names/phones/emails and emergency contacts. Values still in `[square brackets]` display as grey placeholders. Do not publish names or roles until the committee has confirmed them (the deck says role assignments need confirmation).

## 6. Deploy to Netlify (recommended: Git)

1. Create a Git repository from this folder and push it to GitHub/GitLab/Bitbucket. `.gitignore` already excludes `.env`.
2. In Netlify: **Add new site → Import an existing project**, pick the repo. Build settings are read from `netlify.toml` (publish `public`, functions `netlify/functions`) — leave the build command empty.
3. **Before the first deploy finishes**, open *Site configuration → Environment variables* and add:
   - `GEMINI_API_KEY` — your key (mark it as a secret if offered)
   - `GEMINI_MODEL` — e.g. `gemini-3.8-flash`
   - *(recommended)* `SOCIETY_ACCESS_CODE` — see section 7
4. Deploy (or **Deploys → Trigger deploy** if you added variables afterwards — functions read them at deploy time).
5. Open `https://<your-site>.netlify.app/api/health`. You should see `{"ok":true,"aiConfigured":true,...}`.

CLI alternative: `npx netlify-cli login`, `npx netlify-cli init`, set the variables with `npx netlify-cli env:set GEMINI_API_KEY "…"`, then `npm run deploy`.

## 7. Protect your API quota

A public site with an AI endpoint can be used by anyone who finds it. Two protections are built in:

- **`SOCIETY_ACCESS_CODE`** — if set, the site asks for the code the first time someone generates a document (kept only for that browser tab). Share the code through your normal resident channel. Strongly recommended.
- **Per-IP rate limit** (`RATE_LIMIT_PER_10_MIN`, default 15). Netlify production requires Upstash Redis REST credentials for atomic shared limits across instances. Local development additionally uses a best-effort in-memory limiter. Also set a Google AI quota/budget.

## 8. Privacy

- Letter text, names, flat numbers and meeting notes you submit are sent to Google's Gemini API. Google's terms can differ between free and paid usage on whether content may be used to improve their products — read the current terms before entering residents' personal details, and consider a paid-tier key.
- The minutes form is auto-saved in the browser's `localStorage` (this device only). Use **Clear saved form** on shared computers.
- Nothing is stored on the server; the functions keep no database.

## 9. Assistant sources and registered provisions

See [ASSISTANT_SETUP.md](ASSISTANT_SETUP.md). The uploaded 2014 model PDF is included under `public/documents/`. It is NOT the society’s registered bye-laws. Current searchable coverage is deliberately limited to model bye-laws 44, 70, 165, 171 and 172 and the opening excerpt of Act section 13(1). Other questions fall back rather than guessing.

The public FAQ contains society presentation process guidance; it is not used as legal evidence by the assistant. The server corpus is `netlify/data/assistant-sources.json`. Adding text to the public FAQ does not automatically authorise it as an assistant source.

## 10. Troubleshooting

| Message shown | Meaning / fix |
|---|---|
| "The AI service is not configured… GEMINI_API_KEY" | Variable missing. Add it in Netlify and redeploy. |
| "Gemini API key was rejected / refused the request" | Wrong or restricted key, or the API is unavailable from the function's region. Create a new key. |
| "The model "…" was not found" | Change `GEMINI_MODEL` to a current id. |
| "busy or quota reached" | Gemini rate limit or quota. Wait and retry, or check your quota. |
| "declined to process this text" | Gemini's safety filter. Rephrase the wording. |
| "took too long" / "request timed out" | Netlify's documented limit for synchronous functions is 30 s (some older sites use 10 s). The Gemini call is aborted at `GEMINI_TIMEOUT_MS` (default 24 s) so you get a clear message. Shorten the notes or use a faster model. |
| "server function was not found" | You opened the HTML directly or ran a plain static server. Use `npm run dev`. |
| "access code … not correct" | Matches `SOCIETY_ACCESS_CODE`. Case-sensitive. |

## 11. Project layout

```
public/            static site (HTML, css/, js/, data/)
  js/validators.js shared rules used by browser AND server
  data/society.json, data/knowledge.json   the content you edit
netlify/functions/ generate-letter, generate-minutes, rules-qa, health
netlify/lib/       gemini client, guards, prompts, document assembly, output checks
test/              automated tests (mocked Gemini)
netlify.toml  .env.example  .gitignore  package.json
```

## 12. Limits to be aware of

- Drafts are aids, not legal documents. A person must read every draft; the tool cannot verify bye-law compliance, quorum, voting majorities or notice periods.
- The output checks catch invented digits and certain claim phrases, not every possible wording error. Number words ("three") are not checked.
- Downloads are plain `.txt`; use Print → Save as PDF for a PDF.
