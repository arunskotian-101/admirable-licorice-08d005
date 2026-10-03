"use strict";
const crypto = require("crypto");

class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status; this.code = code; this.fields = fields;
  }
}

const reply = (status, payload) => new Response(JSON.stringify(payload), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

const lowerKeys = (h) => Object.fromEntries([...new Headers(h || {}).entries()]);
const clientIp = (h, context) => (context && context.ip) || h["x-nf-client-connection-ip"] || (h["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";

/* Best-effort limiter: serverless instances are short-lived, so this slows abuse but is not a hard cap. */
const buckets = new Map();
function rateLimit(ip) {
  const limit = parseInt(process.env.RATE_LIMIT_PER_10_MIN, 10) || 15;
  const windowMs = 600000, now = Date.now();
  const hits = (buckets.get(ip) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const mins = Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 60000));
    throw new AppError(429, "RATE_LIMITED", "Too many requests from your connection. Please wait about " + mins + " minute(s) and try again.");
  }
  hits.push(now); buckets.set(ip, hits);
  if (buckets.size > 5000) buckets.clear();
}

function checkAccess(h) {
  const required = process.env.SOCIETY_ACCESS_CODE;
  if (!required) return;
  const given = h["x-access-code"] || "";
  if (!given) throw new AppError(401, "ACCESS_CODE_REQUIRED", "An access code is required to use the drafting assistant.");
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(required).digest();
  if (!crypto.timingSafeEqual(a, b)) throw new AppError(401, "ACCESS_CODE_INVALID", "That access code is not correct.");
}

async function parseBody(req) {
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 100000) throw new AppError(413, "PAYLOAD_TOO_LARGE", "The submitted form is too large. Shorten the longest fields and try again.");
  let data;
  try { data = JSON.parse(raw); } catch { throw new AppError(400, "BAD_JSON", "The request could not be read. Reload the page and try again."); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new AppError(400, "BAD_JSON", "The request could not be read. Reload the page and try again.");
  return data;
}

/* Wraps a POST-only JSON endpoint with method check, rate limit, access code, body parsing and error mapping. */
function route(fn) {
  return async (req, context) => {
    try {
      if (req.method !== "POST") throw new AppError(405, "METHOD_NOT_ALLOWED", "This endpoint only accepts POST requests.");
      const h = lowerKeys(req.headers);
      rateLimit(clientIp(h, context));
      checkAccess(h);
      return reply(200, await fn(await parseBody(req)));
    } catch (err) {
      if (err instanceof AppError) return reply(err.status, { error: { code: err.code, message: err.message, fields: err.fields } });
      console.error("Unhandled error:", err);
      return reply(500, { error: { code: "INTERNAL", message: "Something went wrong on the server. Please try again." } });
    }
  };
}

module.exports = { AppError, route, reply };
