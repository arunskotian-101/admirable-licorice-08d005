"use strict";
const test = require("node:test");
const assert = require("node:assert");
const V = require("../public/js/validators.js");
const { auditText } = require("../netlify/lib/checks.js");
const knowledge = require("../public/data/knowledge.json");

const letterBody = {
  societyName: "Test Society", recipient: "secretary", name: "A Member", flat: "B-402", contact: "+91 98765 43210",
  category: "maintenance", subject: "Lift not working", details: "The lift in wing B stopped working and residents are climbing stairs.",
  letterDate: "2026-10-03", issueStartDate: "2026-09-28", requestedAction: "Please arrange an inspection of the lift."
};
const minutesBody = {
  societyName: "Test Society", meetingType: "monthly", meetingDate: "2026-10-01", startTime: "18:00", endTime: "19:00",
  venue: "Clubhouse", chairperson: "P. Chair", recorder: "S. Secretary",
  attendees: [{ name: "A", unit: "A-101", status: "present" }, { name: "B", unit: "B-202", status: "present" }, { name: "C", unit: "", status: "absent" }],
  quorum: { required: "2", status: "present", basis: "" },
  agenda: [{ title: "Lift repair", discussion: "Lift fault discussed; vendor quote of 5000 received.", outcome: "resolved", resolution: "Approve repair as quoted", votesFor: "2", votesAgainst: "0", votesAbstain: "0" }],
  actions: [{ text: "Call vendor", owner: "S. Secretary", due: "2026-10-05", itemRef: "1" }]
};

function mockGemini(jsonOrFn, status = 200) {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    const payload = typeof jsonOrFn === "function" ? jsonOrFn(JSON.parse(opts.body)) : jsonOrFn;
    return { ok: status === 200, status, text: async () => JSON.stringify(status === 200 ? { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(payload) }] } }] } : payload) };
  };
  return calls;
}
const invoke = async (mod, init) => {
  const handler = (await import(mod.replace(/\.js$/, ".mjs"))).default;
  const r = await handler(new Request("http://localhost/api/fn", init), {});
  return { statusCode: r.status, body: await r.text() };
};
const call = (mod, body, headers = {}) => invoke(mod, { method: "POST", headers, body: JSON.stringify(body) });
const parse = (r) => JSON.parse(r.body);

test.beforeEach(() => { process.env.GEMINI_API_KEY = "test-key"; process.env.GEMINI_MODEL = "test-model"; delete process.env.SOCIETY_ACCESS_CODE; process.env.RATE_LIMIT_PER_10_MIN = "1000"; });

test("letter validation catches bad input", () => {
  const r = V.validateLetter({ ...letterBody, contact: "abc", issueStartDate: "2026-02-30", details: "short" }, { today: "2026-10-03" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.contact && r.errors.issueStartDate && r.errors.details);
  assert.equal(V.validateLetter(letterBody, { today: "2026-10-03" }).ok, true);
});

test("minutes validation: owners, quorum status, votes", () => {
  const bad = V.validateMinutes({ ...minutesBody, quorum: { status: "" }, actions: [{ text: "x" }], agenda: [{ title: "T", outcome: "resolved", votesFor: "-1" }] }, { today: "2026-10-03" });
  assert.ok(bad.errors["quorum.status"] && bad.errors["actions.0.owner"] && bad.errors["agenda.0.resolution"] && bad.errors["agenda.0.votesFor"]);
  assert.equal(V.validateMinutes(minutesBody, { today: "2026-10-03" }).ok, true);
});

test("audit flags invented numbers, bye-laws and delivery claims", () => {
  const w = auditText("Bye-law 12 requires 500 rupees; the letter was sent.", "Lift broken since 3 October");
  assert.equal(w.length, 3);
  assert.deepEqual(auditText("The lift has not worked since 3 October.", "Lift broken since 3 October"), []);
});

test("knowledge base integrity", () => {
  const ids = new Set(knowledge.sources.map((s) => s.id));
  knowledge.entries.forEach((e) => {
    assert.ok(ids.has(e.sourceId), e.id + " has unknown source");
    assert.ok(e.locator, e.id + " needs a locator");
    if (e.type === "rule") ["quote", "verifiedBy", "verifiedOn"].forEach((k) => assert.ok(e[k], e.id + " missing " + k));
    else assert.ok(e.question && e.answer, e.id + " needs question and answer");
  });
});

test("generate-letter success assembles deterministic parts", async () => {
  const calls = mockGemini({ body_paragraphs: ["Dear Sir/Madam,", "The lift in wing B stopped working on 28 September 2026.", "Kindly arrange an inspection."], reviewer_notes: ["Add location"] });
  const res = await call("../netlify/functions/generate-letter.js", letterBody);
  const d = parse(res);
  assert.equal(res.statusCode, 200);
  assert.match(d.letter, /^Date: 3 October 2026/);
  assert.match(d.letter, /Flat \/ wing: B-402/);
  assert.ok(!/Dear Sir\/Madam,\s+Dear/.test(d.letter));
  assert.equal(d.draftLabel, "Draft — requires review");
  assert.equal(d.model, "test-model");
  assert.match(calls[0].url, /models\/test-model:generateContent/);
  assert.equal(calls[0].opts.headers["x-goog-api-key"], "test-key");
  assert.ok(!JSON.stringify(d).includes("test-key"));
});

test("generate-letter error mapping", async () => {
  delete process.env.GEMINI_API_KEY;
  assert.equal(parse(await call("../netlify/functions/generate-letter.js", letterBody)).error.code, "AI_NOT_CONFIGURED");
  process.env.GEMINI_API_KEY = "k";
  mockGemini({ error: { message: "models/test-model is not found" } }, 404);
  assert.equal(parse(await call("../netlify/functions/generate-letter.js", letterBody)).error.code, "AI_MODEL_NOT_FOUND");
  mockGemini({ error: { message: "quota" } }, 429);
  assert.equal((await call("../netlify/functions/generate-letter.js", letterBody)).statusCode, 429);
  global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }) });
  assert.equal(parse(await call("../netlify/functions/generate-letter.js", letterBody)).error.code, "AI_BLOCKED");
  const v = await call("../netlify/functions/generate-letter.js", { ...letterBody, subject: "" });
  assert.equal(v.statusCode, 422); assert.ok(parse(v).error.fields.subject);
});

test("access code and method guards", async () => {
  process.env.SOCIETY_ACCESS_CODE = "sesame";
  assert.equal(parse(await call("../netlify/functions/generate-letter.js", letterBody)).error.code, "ACCESS_CODE_REQUIRED");
  assert.equal(parse(await call("../netlify/functions/generate-letter.js", letterBody, { "X-Access-Code": "nope" })).error.code, "ACCESS_CODE_INVALID");
  mockGemini({ body_paragraphs: ["Body."], reviewer_notes: [] });
  assert.equal((await call("../netlify/functions/generate-letter.js", letterBody, { "X-Access-Code": "sesame" })).statusCode, 200);
  assert.equal((await invoke("../netlify/functions/generate-letter.js", { method: "GET" })).statusCode, 405);
});

test("generate-minutes keeps votes/owners from the form and flags invented figures", async () => {
  mockGemini((req) => {
    assert.ok(!/Votes|votesFor/i.test(req.contents[0].parts[0].text), "votes must not be sent to the model for rewriting");
    return { items: [{ id: "1", discussion: "The lift fault was discussed. A quote of 9000 was received.", resolution: "Resolved to approve the repair as quoted." }], reviewer_notes: [] };
  });
  const d = parse(await call("../netlify/functions/generate-minutes.js", minutesBody));
  assert.match(d.minutes, /Votes: For 2 \| Against 0 \| Abstained 0/);
  assert.match(d.minutes, /Owner: S\. Secretary — Due: 5 October 2026 — Item 1/);
  assert.match(d.minutes, /Quorum status recorded: Quorum present/);
  assert.ok(d.warnings.some((w) => /9000/.test(w)), "invented figure should be flagged");
  assert.ok(d.aiUsed);
});

test("generate-minutes without free text skips the model", async () => {
  mockGemini(() => { throw new Error("model should not be called"); });
  const b = { ...minutesBody, agenda: [{ title: "Any other business", outcome: "none" }], actions: [] };
  const d = parse(await call("../netlify/functions/generate-minutes.js", b));
  assert.equal(d.aiUsed, false);
  assert.match(d.minutes, /\[discussion not recorded\]/);
  assert.match(d.minutes, /No action items recorded\./);
});

test("rules-qa refuses uncited answers and invalid ids", async () => {
  mockGemini({ answerable: true, answer: "Made up answer", citation_ids: ["does-not-exist"] });
  const a = parse(await call("../netlify/functions/rules-qa.js", { question: "What is the quorum for an AGM?" }));
  assert.equal(a.answerable, false); assert.deepEqual(a.citations, []);
  mockGemini({ answerable: true, answer: "Waivers need an authorized decision.", citation_ids: ["faq-waiver"] });
  const b = parse(await call("../netlify/functions/rules-qa.js", { question: "Can my charge be waived?" }));
  assert.equal(b.answerable, true); assert.equal(b.citations[0].id, "faq-waiver");
});
