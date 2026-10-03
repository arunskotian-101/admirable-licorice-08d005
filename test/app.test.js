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

test.beforeEach(() => { process.env.GEMINI_API_KEY = "test-key"; process.env.GEMINI_MODEL = "test-model"; delete process.env.SOCIETY_ACCESS_CODE; delete process.env.NETLIFY; delete process.env.NETLIFY_DEV; process.env.RATE_LIMIT_PER_10_MIN = "1000"; });

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

test("rules-qa rejects unknown citations and accepts retrieved evidence", async () => {
  mockGemini({ answerable: true, scope: true, answer: "Made up answer", citation_ids: ["does-not-exist"], evidence: [] });
  const a = parse(await call("../netlify/functions/rules-qa.js", { question: "How do I file a complaint?" }));
  assert.equal(a.answerable, false); assert.deepEqual(a.citations, []);
  const quote = require("../netlify/data/assistant-sources.json").passages[0].text;
  const calls = mockGemini({answerable:true,scope:true,answer:"Submit the complaint in writing with details.",nextStep:"Write to an office bearer.",clarification:"Check registered bye-laws.",citation_ids:["model171"],evidence:[{id:"model171",quote}]});
  const b = parse(await call("../netlify/functions/rules-qa.js", { question: "How do I file a complaint?", language:"mr" }));
  assert.equal(b.answerable, true); assert.equal(b.citations[0].locator, "Bye-law 171");
  assert.match(b.disclaimer,/General model bye-law guidance/);assert.match(b.citations[0].sourceUrl,/#page=54/);
  const user=JSON.parse(JSON.parse(calls[0].opts.body).contents[0].parts[0].text);
  assert.equal(user.language,"Marathi");assert.ok(user.passages.some(p=>p.id==='model171'));
  assert.ok(!user.passages.some(p=>p.id==='faq-waiver'));
});

test("rules-qa refuses forged quotes; unsupported and urgent cases skip Gemini", async () => {
  mockGemini({answerable:true,scope:true,answer:"Invented",citation_ids:["model171"],evidence:[{id:"model171",quote:"This is not in the document."}]});
  assert.equal(parse(await call("../netlify/functions/rules-qa.js",{question:"How do I file a complaint?"})).answerable,false);
  const calls=mockGemini({});
  const out=parse(await call("../netlify/functions/rules-qa.js",{question:"Explain quantum computing"}));
  assert.match(out.answer,/I cannot confirm this from the available sources/);
  assert.match(out.clarification,/society rules/);assert.equal(calls.length,0);
  const urgent=parse(await call("../netlify/functions/rules-qa.js",{question:"There is a gas leak in the building"}));
  assert.match(urgent.answer,/emergency/);assert.equal(calls.length,0);
  assert.equal((await call("../netlify/functions/rules-qa.js",{question:"x".repeat(1001)})).statusCode,422);
});

test("retrieval prioritises registered clauses and excludes draft and old sources", () => {
  const {retrieve}=require("../netlify/lib/retrieval");
  const src=(id,kind,status,url)=>({id,kind,status,url,edition:"2026",verifiedBy:"Secretary",verifiedOn:"2026-10-03"});
  const data={sources:[src("r","registered","applicable","https://example.org/registered.pdf"),src("d","registered","draft","https://example.org/draft.pdf"),src("m","model","model-reference","https://sahakarayukta.maharashtra.gov.in/model.pdf"),src("o","model","superseded","https://sahakarayukta.maharashtra.gov.in/old.pdf"),src("bad","model","model-reference","https://random.example/model.pdf")],passages:["r","d","m","o","bad"].map(id=>({id,sourceId:id,text:"complaint application in writing",provision:"171"}))};
  assert.deepEqual(retrieve("complaint",data).map(p=>p.id),["r","m"]);
});

test("production requests fail closed when the shared limiter is unavailable", async () => {
  process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT="true";
  try { const r=await call("../netlify/functions/rules-qa.js",{question:"How do I complain?"});assert.equal(r.statusCode,503);assert.equal(parse(r).error.code,"LIMITER_UNAVAILABLE"); }
  finally {delete process.env.REQUIRE_DISTRIBUTED_RATE_LIMIT;}
});

test("shared limiter applies atomic counter and blocks quota excess", async () => {
  process.env.UPSTASH_REDIS_REST_URL="https://limiter.example";
  process.env.UPSTASH_REDIS_REST_TOKEN="test-token";
  process.env.RATE_LIMIT_PER_10_MIN="2";
  let command;
  global.fetch=async (_url,opts)=>{command=JSON.parse(opts.body);return {ok:true,json:async()=>({result:3})};};
  try {
    const r=await call("../netlify/functions/rules-qa.js",{question:"How do I file a complaint?"},{"x-nf-client-connection-ip":"192.0.2.5"});
    assert.equal(r.statusCode,429);assert.equal(command[0],"EVAL");assert.match(command[1],/EXPIRE/);assert.ok(!command[3].includes("192.0.2.5"));
    global.fetch=async()=>{throw Error("offline")};
    assert.equal((await call("../netlify/functions/rules-qa.js",{question:"How do I complain?"})).statusCode,503);
  } finally {delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.UPSTASH_REDIS_REST_TOKEN;}
});

test("homepage includes centred assistant and safe shared renderer", () => {
  const fs=require("node:fs");const html=fs.readFileSync("public/index.html","utf8");const js=fs.readFileSync("public/js/assistant.js","utf8");
  assert.ok(html.indexOf('id="ask-society"')<html.indexOf('What you can do here'));
  assert.match(html,/Ask about society rules or procedures/);assert.match(html,/id="ask-btn"/);assert.match(html,/js\/assistant.js/);
  assert.doesNotMatch(js,/innerHTML|insertAdjacentHTML|eval\(/);assert.match(js,/Draft a letter about this/);
});
