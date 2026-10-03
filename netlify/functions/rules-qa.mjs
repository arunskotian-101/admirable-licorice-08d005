import knowledge from "../../public/data/knowledge.json" with { type: "json" };
import V from "../../public/js/validators.js";
import http from "../lib/http.js";
const { route, AppError } = http;
import gemini from "../lib/gemini.js";
const { generateJson } = gemini;
import prompts from "../lib/prompts.js";
const { RULES_SYSTEM, RULES_SCHEMA, strip } = prompts;

const srcById = Object.fromEntries(knowledge.sources.map((s) => [s.id, s]));
const entries = knowledge.entries.filter((e) => srcById[e.sourceId]);

const describe = (e) => {
  const s = srcById[e.sourceId];
  return "[" + e.id + "] (" + s.title + "; " + e.locator + ")\n" + (e.type === "rule" ? "Provision text: " + e.quote : "Q: " + e.question + "\nA: " + e.answer);
};

export default route(async (body) => {
  const q = V.cleanText(body.question, true);
  if (q.length < 5) throw new AppError(422, "VALIDATION", "Please enter a question of at least 5 characters.", { question: "Enter a question of at least 5 characters." });
  if (q.length > 400) throw new AppError(422, "VALIDATION", "Please shorten the question to 400 characters or fewer.", { question: "Question must be 400 characters or fewer (currently " + q.length + ")." });

  const base = { draftLabel: V.DRAFT_LABEL, citations: [], model: null };
  if (!entries.length) return { ...base, answerable: false, answer: "No verified entries have been added yet, so there is nothing to answer from. Please ask the Secretary or Managing Committee." };

  const user = "<entries>\n" + entries.map((e) => strip(describe(e))).join("\n\n") + "\n</entries>\n\nQuestion: " + strip(q);
  const { json, model } = await generateJson({ system: RULES_SYSTEM, user, schema: RULES_SCHEMA, maxOutputTokens: 4096 });

  const ids = (Array.isArray(json.citation_ids) ? json.citation_ids : []).map(String);
  const cited = entries.filter((e) => ids.includes(e.id));
  const answer = String(json.answer || "").trim().slice(0, 1500);
  const notCovered = "The supplied sources do not clearly cover this question. Please ask the Secretary or Managing Committee.";

  // An answer without a valid citation is never shown as an answer.
  if (!json.answerable || !cited.length || !answer) return { ...base, model, answerable: false, answer: json.answerable === false && answer ? answer : notCovered };

  return {
    ...base, model, answerable: true, answer,
    citations: cited.map((e) => ({ id: e.id, question: e.question || e.title || e.locator, locator: e.locator, sourceTitle: srcById[e.sourceId].title, sourceUrl: srcById[e.sourceId].url || null }))
  };
});
