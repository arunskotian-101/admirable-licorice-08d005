# Ask Society Assistant — setup and maintenance

## What is implemented

The opening page has a centred assistant section immediately below the welcome banner, also available on the Rules page. It has a labelled question textarea, Ask/loading state, English/Marathi selector, evidence quotes, source title, provision, edition and clickable PDF page links. Follow-ups carry the preceding question, not model answers, as untrusted context. Draft a letter carries only the member’s concern into the existing editable form; it does not submit a letter or assert that model guidance is a fact.

Server-side lexical retrieval selects at most eight matching passages BEFORE Gemini is called. Eligible registered provisions rank first; verified official Maharashtra legislation, rules and model references supplement them. The model receives only this subset, never all FAQs. A bilingual keyword list improves Marathi retrieval. It is a small local index, not semantic/vector search; unsupported wording may conservatively return no match. Improve keywords when reviewing real member questions.

The server checks cited IDs against retrieved passages and requires a verbatim evidence quote from each cited passage. This blocks invented source IDs and fabricated quotes; it cannot mechanically prove every sentence is a correct interpretation. Important or contested answers still need office bearer review. Questions and source text are enclosed as JSON data; the system instruction owns scope and boundaries. Rendering uses textContent/DOM nodes, never generated HTML. URLs originate only from the reviewed corpus and must be HTTPS.

## Configure Netlify

1. Keep the existing publish directory `public` and functions directory `netlify/functions`.
2. Set `GEMINI_API_KEY` and `GEMINI_MODEL` as Netlify Function environment variables. Use a model available to your account. Never place keys in HTML, browser JavaScript, the PDF or public JSON.
3. Create an Upstash Redis database. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to Function environment variables. This is the additional service REQUIRED for production request limiting, not for document retrieval.
4. Set `REQUIRE_DISTRIBUTED_RATE_LIMIT=true` explicitly. Netlify’s `NETLIFY=true` also triggers fail-closed enforcement. Set a unique `SOCIETY_RATE_LIMIT_NAMESPACE` if several sites share Redis. Default is 15 AI requests per IP per ten minutes, shared across letter, minutes and question endpoints. School/office shared IPs may need a reviewed higher limit.
5. Set `SOCIETY_ACCESS_CODE` to restrict access and redeploy. A shared code is not individual member authentication.
6. Run `npm test` and `npm run dev`; test a complaint question in both languages, a follow-up, and the letter prefill. Generate answers only after configuration succeeds.

Redis uses an atomic INCR/EXPIRE Lua operation; backend outage returns 503, excess requests 429. No questions are stored in Redis; IP-derived keys are SHA-256 hashes. The local-only in-memory guard is not a distributed protection. Gemini quota/key/model/timeout errors remain readable. Requests are capped at 1000 characters per question/context and 12 KB of JSON for the assistant.

## Source coverage and PDF inclusion

The included PDF is the uploaded 2014 Maharashtra MODEL bye-laws. It is publicly downloadable and is linked to the corresponding official Maharashtra publication. Five selected provisions have been checked and indexed, rather than treating an unreviewed bulk PDF extraction as applicable law. The Act source is an official consolidated edition as on 6 June 2025, with only an opening section 13(1) excerpt included; it is not a complete or automatically updated legislative database. Later amendments and specific applicability must be reviewed. No Maharashtra Rules passages have yet been added.

## Add your society’s registered PDF

1. Obtain the registered bye-laws, registration evidence and registered amendment certificates from the Secretary. Confirm which clauses are currently applicable; do not relabel this model PDF as registered.
2. Keep private originals outside `public`; redact personal details from any copy offered to members. Use an authorised HTTPS document URL for source links. This ZIP does not implement member document uploads, OCR, login-protected document hosting or an admin dashboard.
3. Extract text locally, e.g. `pdftotext -layout registered.pdf registered.txt` (requires Poppler), or OCR scanned pages. Compare each proposed passage with its PDF page, including qualifiers, exceptions and cross-references.
4. Add a source to `netlify/data/assistant-sources.json`: unique `id`, `title`, `kind: "registered"`, `status: "applicable"`, `edition`, HTTPS `url`, actual reviewer in `verifiedBy`, and review date in `verifiedOn`. Record registration/amendment details and dates in additional metadata. Do not invent reviewer or registration details.
5. Add passages: unique `id`, `sourceId`, exact `provision`, `page` (one-based PDF page), `text` and English/Marathi `keywords`. Keep clauses under 6000 characters; split long clauses without dropping exceptions. Related passages must be retrieved together; use shared keywords. Sources marked `draft`, `proposed` or `superseded` are excluded from answering. Retain them as archival material with separate IDs. Registered sources need verified metadata before becoming eligible.
6. Run `npm run validate:sources`, review the output, test queries, then redeploy. Update the visible source/FAQ data as needed; the server registry is the authoritative assistant evidence list.

## Retrieval service and internet claims

NO live internet search, crawling, PDF auto-refresh or Gemini search grounding is implemented. Retrieval is from the checked local server corpus bundled with the project. No paid search/vector service is needed for this implementation. Expanding to a larger corpus may justify a document index/vector service with official-domain filters, version metadata, trusted ingestion and re-ranking. Do not advertise live legal updates until an actual fetch/verify/index workflow exists. Review official source versions after legislative changes; keep superseded material excluded.

## Validation and limits

Automated tests mock Gemini; they verify retrieval priority, archived/unofficial exclusions, evidence validation, model disclaimer, unsupported and emergency responses, input bounds, Marathi prompt selection and limiter guards. Existing letter/minutes tests remain. Live Gemini/Redis calls and a deployed browser session were not verified with real credentials. Supporting English and Marathi means selectable generation and bilingual keyword retrieval; exact required English fallback/disclaimer strings remain visible alongside Marathi clarification where applicable.
