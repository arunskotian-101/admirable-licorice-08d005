import http from "../lib/http.js";
const { reply } = http;

/* Lets the pages warn early if the server is not configured. Reveals no secrets. */
export default async () => reply(200, {
  ok: true,
  aiConfigured: Boolean((process.env.GEMINI_API_KEY || "").trim()),
  accessCodeRequired: Boolean(process.env.SOCIETY_ACCESS_CODE)
});
