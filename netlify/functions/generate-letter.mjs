import V from "../../public/js/validators.js";
import http from "../lib/http.js";
const { route, AppError } = http;
import gemini from "../lib/gemini.js";
const { generateJson } = gemini;
import prompts from "../lib/prompts.js";
const { buildLetterPrompt, LETTER_SCHEMA } = prompts;
import documents from "../lib/documents.js";
const { buildLetter } = documents;
import checks from "../lib/checks.js";
const { auditText } = checks;

const isBoilerplate = (s) => /^(dear\b|yours\b|sincerely\b|regards\b|thank you\b|subject\s*:)/i.test(s);

export default route(async (body) => {
  const { ok, errors, value } = V.validateLetter(body);
  if (!ok) throw new AppError(422, "VALIDATION", "Please correct the highlighted fields.", errors);

  const { system, user, sourceText } = buildLetterPrompt(value);
  const { json, model } = await generateJson({ system, user, schema: LETTER_SCHEMA });

  const paragraphs = (Array.isArray(json.body_paragraphs) ? json.body_paragraphs : [])
    .map((p) => (typeof p === "string" ? p.trim() : "")).filter((p) => p && !isBoilerplate(p)).slice(0, 8).map((p) => p.slice(0, 1500));
  if (!paragraphs.length) throw new AppError(502, "AI_EMPTY", "The AI service returned an empty letter. Please try again.");

  const notes = (Array.isArray(json.reviewer_notes) ? json.reviewer_notes : [])
    .filter((n) => typeof n === "string" && n.trim()).slice(0, 8).map((n) => n.trim().slice(0, 250));

  return {
    letter: buildLetter(value, paragraphs),
    draftLabel: V.DRAFT_LABEL,
    reviewerNotes: notes,
    warnings: auditText(paragraphs.join("\n"), sourceText),
    model
  };
});
