import V from "../../public/js/validators.js";
import http from "../lib/http.js";
const { route, AppError } = http;
import gemini from "../lib/gemini.js";
const { generateJson } = gemini;
import prompts from "../lib/prompts.js";
const { buildMinutesPrompt, MINUTES_SCHEMA, strip } = prompts;
import documents from "../lib/documents.js";
const { buildMinutes } = documents;
import checks from "../lib/checks.js";
const { auditText } = checks;

export default route(async (body) => {
  const res = V.validateMinutes(body);
  if (!res.ok) throw new AppError(422, "VALIDATION", "Please correct the highlighted fields.", res.errors);
  const v = res.value;
  const warnings = res.warnings.slice(), notes = [];
  const polished = {};
  let model = null, aiUsed = false;

  const { system, user, items } = buildMinutesPrompt(v);
  if (items.length) {
    const out = await generateJson({ system, user, schema: MINUTES_SCHEMA });
    model = out.model; aiUsed = true;
    const returned = Array.isArray(out.json.items) ? out.json.items : [];
    items.forEach((it) => {
      const r = returned.find((x) => x && String(x.id) === it.id);
      const row = v.agenda.find((a) => String(a.n) === it.id);
      if (!r) { warnings.push("Item " + it.id + ": the AI did not return wording, so your original notes were used."); return; }
      const discussion = row.discussion ? String(r.discussion || "").trim().slice(0, 3000) : "";
      const resolution = row.resolution ? String(r.resolution || "").trim().slice(0, 1500) : "";
      polished[it.id] = { discussion, resolution };
      const source = [it.title, it.discussion_notes, it.resolution_wording, it.outcome_set_by_secretary].join("\n");
      auditText(discussion + "\n" + resolution, source, "Item " + it.id).forEach((w) => warnings.push(w));
    });
    (Array.isArray(out.json.reviewer_notes) ? out.json.reviewer_notes : []).filter((n) => typeof n === "string" && n.trim()).slice(0, 8).forEach((n) => notes.push(strip(n).slice(0, 250)));
  } else {
    notes.push("No free-text notes or resolution wording were supplied, so the minutes were assembled directly from your form without AI wording.");
  }

  return { minutes: buildMinutes(v, polished), draftLabel: V.DRAFT_LABEL, reviewerNotes: notes, warnings, aiUsed, model };
});
