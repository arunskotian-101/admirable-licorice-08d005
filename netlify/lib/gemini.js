"use strict";
const { AppError } = require("./http");

const DEFAULT_MODEL = "gemini-3.8-flash"; // used only if GEMINI_MODEL is unset; set GEMINI_MODEL to override

function config() {
  const t = parseFloat(process.env.GEMINI_TEMPERATURE);
  return {
    apiKey: (process.env.GEMINI_API_KEY || "").trim(),
    model: (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim(),
    temperature: Number.isFinite(t) ? t : null,
    timeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS, 10) || 24000
  };
}

function mapHttpError(status, data, model) {
  const detail = (data && data.error && data.error.message) || "";
  console.error("Gemini HTTP " + status + ": " + detail.slice(0, 300));
  if (status === 400 && /api key/i.test(detail)) return new AppError(500, "AI_BAD_KEY", "The server's Gemini API key was rejected. Site administrator: check GEMINI_API_KEY.");
  if (status === 401 || status === 403) return new AppError(500, "AI_BAD_KEY", "The Gemini API refused the request (key invalid, lacks permission, or the API is not available in this region). Site administrator: check GEMINI_API_KEY.");
  if (status === 404) return new AppError(500, "AI_MODEL_NOT_FOUND", 'The model "' + model + '" was not found or is no longer available. Site administrator: set GEMINI_MODEL to a current model id.');
  if (status === 429) return new AppError(429, "AI_RATE_LIMITED", "The AI service is busy or its quota has been reached. Wait a minute and try again.");
  if (status === 400) return new AppError(502, "AI_BAD_REQUEST", "The AI service could not process this request. Try shortening the text; if it keeps happening, tell the site administrator.");
  return new AppError(502, "AI_UPSTREAM", "The AI service is temporarily unavailable. Please try again shortly.");
}

/* Calls Gemini generateContent and returns parsed JSON that follows `schema`. The key never leaves the server. */
async function generateJson({ system, user, schema, maxOutputTokens = 8192 }) {
  const { apiKey, model, temperature, timeoutMs } = config();
  if (!apiKey) throw new AppError(500, "AI_NOT_CONFIGURED", "The AI service is not configured. Site administrator: set GEMINI_API_KEY in the environment.");
  if (!/^[\w.\-]+$/.test(model)) throw new AppError(500, "AI_MODEL_INVALID", "GEMINI_MODEL contains invalid characters. Site administrator: use a plain model id such as gemini-3.8-flash.");

  const generationConfig = { responseMimeType: "application/json", responseSchema: schema, maxOutputTokens };
  if (temperature !== null) generationConfig.temperature = temperature;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig
  };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res, raw;
  try {
    const base = (process.env.GOOGLE_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").trim().replace(/\/+$/, "");
    res = await fetch(base + "/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: ctl.signal
    });
    raw = await res.text();
  } catch (err) {
    if (err && err.name === "AbortError") throw new AppError(504, "AI_TIMEOUT", "The AI service took too long to respond. Please try again, or shorten the text.");
    console.error("Gemini network error:", err && err.message);
    throw new AppError(502, "AI_NETWORK", "The server could not reach the AI service. Please try again shortly.");
  } finally { clearTimeout(timer); }

  let data = null;
  try { data = JSON.parse(raw); } catch { /* handled below */ }
  if (!res.ok) throw mapHttpError(res.status, data, model);
  if (!data) throw new AppError(502, "AI_BAD_JSON", "The AI service returned an unreadable response. Please try again.");

  const block = data.promptFeedback && data.promptFeedback.blockReason;
  if (block) throw new AppError(422, "AI_BLOCKED", "The AI service declined to process this text (" + block + "). Rephrase the wording and try again.");
  const cand = data.candidates && data.candidates[0];
  if (!cand) throw new AppError(502, "AI_EMPTY", "The AI service returned no draft. Please try again.");
  const fr = cand.finishReason;
  if (fr && !["STOP", "MAX_TOKENS"].includes(fr) && fr !== "FINISH_REASON_UNSPECIFIED") throw new AppError(422, "AI_BLOCKED", "The AI service stopped without a draft (" + fr + "). Rephrase the wording and try again.");

  const parts = (cand.content && cand.content.parts) || [];
  const text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("").trim();
  if (fr === "MAX_TOKENS" && !text) throw new AppError(502, "AI_TRUNCATED", "The draft was cut off. Try shorter notes, or ask the administrator to use a model with a larger output limit.");
  let json;
  try { json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")); }
  catch { throw new AppError(502, fr === "MAX_TOKENS" ? "AI_TRUNCATED" : "AI_BAD_JSON", fr === "MAX_TOKENS" ? "The draft was cut off. Try shorter notes." : "The AI service returned a draft in an unexpected format. Please try again."); }
  return { json, model };
}

module.exports = { generateJson, config, DEFAULT_MODEL };
